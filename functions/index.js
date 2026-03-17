const functions = require("firebase-functions");
const https     = require("https");

const HUBTEL_API_ID   = "X7q7oXm";            
const HUBTEL_API_KEY  = "77a27a218cd14819ac6e0e6434368506";  
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

    const payload = JSON.stringify({
      totalAmount:           Number(amount),
      description:           description || "LocalBiz GH Subscription",
      callbackUrl:           `${APP_URL}/hubtel-callback`,
      returnUrl:             `${APP_URL}?hubtel=success&ref=${encodeURIComponent(clientReference)}`,
      merchantAccountNumber: HUBTEL_MERCHANT,
      cancellationUrl:       `${APP_URL}?hubtel=cancelled`,
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
      },
    };

    try {
      const response = await makeRequest(options, payload);
      console.log("Hubtel response:", response.status, JSON.stringify(response.body));

      if (response.status !== 200) {
        res.status(response.status).json({ error: `Hubtel HTTP ${response.status}`, details: response.body });
        return;
      }

      const checkoutUrl =
        response.body?.data?.checkoutUrl ||
        response.body?.data?.checkoutDirectUrl ||
        response.body?.checkoutUrl || null;

      if (!checkoutUrl) {
        res.status(500).json({ error: "No checkoutUrl in response", raw: response.body });
        return;
      }

      res.status(200).json({ checkoutUrl });

    } catch (err) {
      console.error("Function error:", err);
      res.status(500).json({ error: err.message });
    }
  });
