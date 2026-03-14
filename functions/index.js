// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js  —  LocalBiz GH · Firebase Cloud Functions
// Hubtel Payment Proxy — keeps API credentials secure on server side
// ─────────────────────────────────────────────────────────────────────────────

const functions = require("firebase-functions");
const https     = require("https");

// ── Hubtel Credentials ────────────────────────────────────────────────────────
// UPDATE THESE with your NEW credentials after regenerating on Hubtel dashboard
const HUBTEL_API_ID   = "X7q7oXm ";
const HUBTEL_API_KEY  = "75673bfcfa254316b502de468b7fe2b1";
const HUBTEL_MERCHANT = "2030179";
const APP_URL         = "https://localbizgh.web.app";

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
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

    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const authToken = Buffer.from(`${HUBTEL_API_ID}:${HUBTEL_API_KEY}`).toString("base64");

    const payload = JSON.stringify({
      merchantAccountNumber: HUBTEL_MERCHANT,
      description:           description || "LocalBiz GH Subscription",
      amount:                Number(amount),
      clientReference,
      returnUrl:      `${APP_URL}?hubtel=success&clientReference=${encodeURIComponent(clientReference)}`,
      cancellationUrl:`${APP_URL}?hubtel=cancelled`,
    });

    const options = {
      hostname: "payproxyapi.hubtel.com",
      path:     "/items/initiate",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  `Basic ${authToken}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    try {
      const response = await makeRequest(options, payload);

      if (response.status !== 200) {
        console.error("Hubtel error:", response.status, response.body);
        res.status(response.status).json({
          error:   `Hubtel returned HTTP ${response.status}`,
          details: response.body,
        });
        return;
      }

      const checkoutUrl =
        response.body?.data?.checkoutUrl ||
        response.body?.checkoutUrl || null;

      if (!checkoutUrl) {
        res.status(500).json({ error: "Hubtel did not return a checkout URL", details: response.body });
        return;
      }

      res.status(200).json({ checkoutUrl });

    } catch (err) {
      console.error("Function error:", err);
      res.status(500).json({ error: err.message });
    }
  });
