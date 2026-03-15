const functions = require("firebase-functions");
const https     = require("https");

// ── UPDATE THESE with your Hubtel credentials ─────────────────────────────────
const HUBTEL_API_ID   = "X7q7oXm";
const HUBTEL_API_KEY  = "75673bfcfa254316b502de468b7fe2b1";
const HUBTEL_MERCHANT = "2030179";
const APP_URL         = "https://localbizgh.web.app";

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function setCORS(res) {
  res.set("Access-Control-Allow-Origin",  "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

exports.initiateHubtelCheckout = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    setCORS(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { amount, description, clientReference } = req.body || {};

    if (!amount || !clientReference) {
      res.status(400).json({ error: "amount and clientReference are required" });
      return;
    }

    const authToken = Buffer.from(`${HUBTEL_API_ID}:${HUBTEL_API_KEY}`).toString("base64");

    // Hubtel Online Checkout required fields
    const payload = JSON.stringify({
      totalAmount:           Number(amount),
      description:           description || "LocalBiz GH Subscription",
      callbackUrl:           `${APP_URL}/hubtel-callback`,
      returnUrl:             `${APP_URL}?hubtel=success&clientReference=${encodeURIComponent(clientReference)}`,
      cancellationUrl:       `${APP_URL}?hubtel=cancelled`,
      merchantAccountNumber: HUBTEL_MERCHANT,
      clientReference:       clientReference,
    });

    const options = {
      hostname: "payproxyapi.hubtel.com",
      path:     "/items/initiate",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  `Basic ${authToken}`,
        "Content-Length": Buffer.byteLength(payload),
        "Cache-Control":  "no-cache",
      },
    };

    // Log full request for debugging
    console.log("=== HUBTEL REQUEST ===");
    console.log("Merchant:", HUBTEL_MERCHANT);
    console.log("Amount:", amount);
    console.log("ClientRef:", clientReference);
    console.log("Payload:", payload);

    try {
      const response = await makeRequest(options, payload);

      // Log full response for debugging
      console.log("=== HUBTEL RESPONSE ===");
      console.log("Status:", response.status);
      console.log("Body:", JSON.stringify(response.body));

      if (response.status !== 200) {
        // Return FULL Hubtel error so we can debug
        res.status(response.status).json({
          error:   `Hubtel HTTP ${response.status}`,
          details: response.body,
          hint:    response.status === 401
            ? "Wrong Client ID or Secret — check developers.hubtel.com"
            : response.status === 400
            ? "Bad request — check merchant account number at unity.hubtel.com"
            : "Check Firebase Function logs for details",
        });
        return;
      }

      const checkoutUrl = response.body?.data?.checkoutUrl || response.body?.checkoutUrl || null;
      if (!checkoutUrl) {
        res.status(500).json({ error: "No checkout URL", details: response.body });
        return;
      }

      res.status(200).json({ checkoutUrl });

    } catch (err) {
      console.error("Function error:", err);
      res.status(500).json({ error: err.message });
    }
  });
