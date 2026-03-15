// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js  —  LocalBiz GH · Firebase Cloud Functions
// Hubtel Payment Proxy
// ─────────────────────────────────────────────────────────────────────────────

const functions = require("firebase-functions");
const https     = require("https");

// ── Hubtel Credentials ────────────────────────────────────────────────────────
// UPDATE THESE with your credentials from developers.hubtel.com
// Client ID = HUBTEL_API_ID, Client Secret = HUBTEL_API_KEY
const HUBTEL_API_ID   = "X7q7oXm";          // ← your Client ID
const HUBTEL_API_KEY  = "75673bfcfa254316b502de468b7fe2b1"; // ← paste your Client Secret here
const HUBTEL_MERCHANT = "2030179";           // ← your Account Number from unity.hubtel.com
const APP_URL         = "https://localbizgh.web.app";

// ── HTTPS helper ──────────────────────────────────────────────────────────────
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

// ── Main Function ─────────────────────────────────────────────────────────────
exports.initiateHubtelCheckout = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    setCORS(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

    const { amount, description, clientReference } = req.body || {};

    if (!amount || !clientReference) {
      res.status(400).json({ error: "amount and clientReference are required" });
      return;
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    // ── Build auth token ──────────────────────────────────────────────────────
    const authToken = Buffer.from(`${HUBTEL_API_ID}:${HUBTEL_API_KEY}`).toString("base64");

    // ── IMPORTANT: Hubtel uses "totalAmount" not "amount" ─────────────────────
    const payload = JSON.stringify({
      totalAmount:           Number(amount),          // ← correct field name
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

    console.log("Calling Hubtel with merchant:", HUBTEL_MERCHANT, "amount:", amount);

    try {
      const response = await makeRequest(options, payload);
      console.log("Hubtel response status:", response.status);
      console.log("Hubtel response body:", JSON.stringify(response.body));

      if (response.status === 401) {
        res.status(401).json({
          error: "Hubtel authentication failed. Check your Client ID and Client Secret.",
          hint:  "Go to developers.hubtel.com → Programmable API Keys → click wppnllg row → copy Client Secret",
        });
        return;
      }

      if (response.status !== 200) {
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
        res.status(500).json({
          error:   "Hubtel did not return a checkout URL",
          details: response.body,
        });
        return;
      }

      res.status(200).json({ checkoutUrl });

    } catch (err) {
      console.error("Function error:", err);
      res.status(500).json({ error: err.message });
    }
  });
