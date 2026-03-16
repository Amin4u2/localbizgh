// ─────────────────────────────────────────────────────────────────────────────
// src/App.jsx  —  LocalBiz GH  ·  Full Application
// v4: Mobile-friendly, discount tags, town field, sort/filter, order management
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { ForgotPasswordModal, OnboardingTour, OrderNotifyPanel, requestNotificationPermission } from "./newFeatures";
import {
  registerUser, loginUser, logoutUser, onAuthChange, fetchUserProfile,
  isUsernameTaken,
  listenBusinesses, listenMyBusiness, updateBusiness,
  addProduct, updateProduct, deleteProduct,
  placeOrder, updateOrderStatus,
  listenBusinessOrders, listenCustomerOrders, listenRiderOrders,
  listenAvailableJobs, listenAllOrders,
  listenMyRiderProfile, listenRidersInRegion, listenAllRiders, updateRider,
  listenAllUsers, adminUpdateBusiness, adminAddBusiness,
  updateSubscription, logSubscriptionPayment, listenAllPayments,
  uploadImage,
  getBusinessWhatsApp,
  listenDispatchLogs,
  addFleetDriver, updateFleetDriver, deleteFleetDriver,
  listenFleetDrivers, recordFleetDelivery, listenDriverDeliveries,
  listenDriverDailyStats, rateFleetDelivery, rateOrderDriver,
  requestPartnership, respondPartnership,
  listenBizPartnerships, listenRiderPartnerships, listenRiderHistory,
  updateRiderProfile,
  getBusinessByUsername, getRiderByUsername,
  track,
} from "./firebase";

// ── Firestore direct imports for Reports & Messages ───────────────────────────
import { getFirestore, collection, addDoc, serverTimestamp as fts,
  query as fq, where as fw, orderBy as fo, onSnapshot as fon,
  updateDoc as fud, doc as fdoc } from "firebase/firestore";
import { getApp } from "firebase/app";
const _db = () => getFirestore(getApp());

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_CREDS = { username: "Amisco4u2", password: "Amiena702$" };

// ── HUBTEL PAYMENT & SMS CREDENTIALS ─────────────────────────────────────────
const HUBTEL_API_ID   = "wppnllg";
const HUBTEL_API_KEY  = "d229e5e5de5149ceb19bf707af075951";
const HUBTEL_MERCHANT = "2022622";
const SMS_CLIENT_ID   = "yaxnqtoi";
const SMS_CLIENT_SECRET = "zpwfshan";
const SMS_SENDER      = "AminMoroEnt";
const APP_URL         = "https://localbizgh.web.app";

// ── HUBTEL: Initiate Checkout via Firebase Function proxy ────────────────────
// Calls our server-side Firebase Function to avoid CORS + expose credentials.
// The Function at /initiateHubtelCheckout handles the actual Hubtel API call.
const HUBTEL_FUNCTION_URL = "https://us-central1-localbizgh.cloudfunctions.net/initiateHubtelCheckout";

async function initiateHubtelPayment(amount, description, clientRef) {
  let res, data;

  try {
    res = await fetch(HUBTEL_FUNCTION_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amount, description, clientReference: clientRef }),
    });
    data = await res.json();
  } catch (networkErr) {
    throw new Error("Network error reaching payment server. Check your connection.");
  }

  if (!res.ok) {
    // Show full Hubtel error details for debugging
    const details = data?.details || data;
    const hubtelMsg = typeof details === "object"
      ? JSON.stringify(details)
      : String(details || "");
    const msg =
      res.status === 401 ? "Payment credentials invalid. Contact admin." :
      res.status === 400 ? `Hubtel rejected request: ${data?.error || ""} ${hubtelMsg}` :
      res.status === 503 ? "Payment service unavailable. Try again." :
      (data?.error || `Payment error HTTP ${res.status}: ${hubtelMsg}`);
    throw new Error(msg);
  }

  const checkoutUrl = data?.checkoutUrl;
  if (!checkoutUrl) throw new Error("Payment server did not return a checkout link.");
  return checkoutUrl;
}

// ── HUBTEL: Send SMS ──────────────────────────────────────────────────────────
async function sendSMS(toPhone, message) {
  if (!toPhone) return;
  let phone = String(toPhone).replace(/\s+/g, "").replace(/^0/, "233").replace(/^\+/, "");
  if (phone.length < 9) return;
  const url = `https://sms.hubtel.com/v1/messages/send`
    + `?clientsecret=${SMS_CLIENT_SECRET}`
    + `&clientid=${SMS_CLIENT_ID}`
    + `&from=${SMS_SENDER}`
    + `&to=${phone}`
    + `&content=${encodeURIComponent(message)}`;
  try { await fetch(url); } catch {}
}

// ── All 16 Ghana Regions + Districts (imported from regions.js) ───────────────
import { GHANA_REGIONS, REGION_NAMES, getDistricts } from "./regions";
const REGIONS = REGION_NAMES; // All 16 regions
const GHANA_TOWNS = Object.fromEntries(GHANA_REGIONS.map(r => [r.region, r.districts]));

const BIZ_CATEGORIES = [
  {label:"Food & Restaurant",emoji:"🍽️"},{label:"Grocery & Supermarket",emoji:"🛒"},
  {label:"Fashion & Boutique",emoji:"👗"},{label:"Electronics",emoji:"📱"},
  {label:"Pharmacy & Health",emoji:"💊"},{label:"Beauty & Wellness",emoji:"💄"},
  {label:"Bakery & Pastry",emoji:"🍰"},{label:"Hardware & Tools",emoji:"🔧"},
  {label:"Drinks & Bar",emoji:"🍺"},{label:"Logistics & Courier",emoji:"🚚"},
  {label:"Agriculture & Farming",emoji:"🌾"},{label:"Education & Tutoring",emoji:"📚"},
  {label:"Auto Parts & Services",emoji:"🔧"},{label:"Events & Entertainment",emoji:"🎉"},
  {label:"Hotels & Accommodation",emoji:"🏨"},{label:"Other (specify)",emoji:"🏪"},
];
const VEHICLES = ["Motorbike 🏍️","Bicycle 🚴","Car 🚗","Van 🚐","Tricycle (Keke) 🛺"];
const PAYMENTS = [
  {v:"cash",label:"💵 Cash on Delivery"},{v:"transfer",label:"🏦 Bank Transfer"},
  {v:"pos",label:"💳 POS on Delivery"},{v:"momo",label:"📱 Mobile Money (MoMo)"},
];
const ORDER_STATUS = {
  pending:    {label:"Pending",       color:"#f59e0b",bg:"rgba(245,158,11,.14)"},
  confirmed:  {label:"Confirmed",     color:"#3b9eff",bg:"rgba(59,158,255,.14)"},
  preparing:  {label:"Preparing",     color:"#a855f7",bg:"rgba(168,85,247,.14)"},
  assigned:   {label:"Rider Assigned",color:"#f97316",bg:"rgba(249,115,22,.14)"},
  dispatched: {label:"On the Way",    color:"#10b981",bg:"rgba(16,185,129,.14)"},
  delivered:  {label:"Delivered",     color:"#22c55e",bg:"rgba(34,197,94,.14)"},
  cancelled:  {label:"Cancelled",     color:"#ef4444",bg:"rgba(239,68,68,.14)"},
};
const TRACK_STEPS = ["pending","confirmed","preparing","assigned","dispatched","delivered"];
const PLANS = {
  free:     {label:"Free Trial", duration:"1 Month",  price:0,    monthly:0,    color:"#64748b",bg:"rgba(100,116,139,.1)", desc:"Full access, no card needed"},
  monthly:  {label:"Monthly",    duration:"1 Month",  price:100,  monthly:100,  color:"#3b9eff",bg:"rgba(59,158,255,.12)", desc:"Renews every month"},
  quarter:  {label:"3 Months",   duration:"3 Months", price:250,  monthly:83,   color:"#d97706",bg:"rgba(245,158,11,.12)", desc:"Save GH₵50 vs monthly"},
  biannual: {label:"6 Months",   duration:"6 Months", price:550,  monthly:92,   color:"#9333ea",bg:"rgba(147,51,234,.1)",  desc:"Save GH₵50 vs monthly"},
  annual:   {label:"Yearly",     duration:"1 Year",   price:1000, monthly:83,   color:"#16a34a",bg:"rgba(22,163,74,.1)",   desc:"Best value — save GH₵200"},
};

// Rider plans at 50% of business plans
const RIDER_PLANS = {
  free:     {label:"Free Trial", duration:"1 Month",  price:0,   monthly:0,   color:"#64748b",bg:"rgba(100,116,139,.1)", desc:"Full access, no card needed"},
  monthly:  {label:"Monthly",    duration:"1 Month",  price:50,  monthly:50,  color:"#3b9eff",bg:"rgba(59,158,255,.12)", desc:"Renews every month"},
  quarter:  {label:"3 Months",   duration:"3 Months", price:125, monthly:42,  color:"#d97706",bg:"rgba(245,158,11,.12)", desc:"Save GH₵25 vs monthly"},
  biannual: {label:"6 Months",   duration:"6 Months", price:275, monthly:46,  color:"#9333ea",bg:"rgba(147,51,234,.1)",  desc:"Save GH₵25 vs monthly"},
  annual:   {label:"Yearly",     duration:"1 Year",   price:500, monthly:42,  color:"#16a34a",bg:"rgba(22,163,74,.1)",   desc:"Best value — save GH₵100"},
};
const ADMIN_ROLES = [
  {id:"admin",    ico:"⚡", label:"Dashboard"},
  {id:"customer", ico:"🛍️",label:"Customer View"},
  {id:"store",    ico:"🏪", label:"Business View"},
  {id:"rider",    ico:"🏍️",label:"Rider View"},
];

const fmt    = n  => "GH₵ " + Number(n||0).toFixed(2);
const ago    = ts => { if(!ts)return"—"; const m=Math.floor((Date.now()-(ts.seconds?ts.seconds*1000:ts))/60000); return m<1?"Just now":m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`; };
const dstr   = ts => { if(!ts)return"—"; return new Date(ts.seconds?ts.seconds*1000:ts).toLocaleDateString("en-GH",{day:"numeric",month:"short",year:"numeric"}); };
const dtstr  = ts => { if(!ts)return"—"; return new Date(ts.seconds?ts.seconds*1000:ts).toLocaleString("en-GH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); };
const catEmo = cat => BIZ_CATEGORIES.find(c=>c.label===cat)?.emoji||"🏪";
const genId  = () => "#"+Math.random().toString(36).slice(2,8).toUpperCase();

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL CSS
// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --g1:#1a3d2b;--g2:#245237;--g3:#2f6b47;
  --lime:#4ade80;--lime2:#22c55e;--lime3:#16a34a;
  --amber:#f59e0b;--amber2:#d97706;
  --coral:#f97316;--coral2:#ea580c;
  --cream:#faf7f2;--cream2:#f3ede4;--cream3:#e8e0d5;
  --ink:#1c1209;--muted:#6b5e4e;--dim:#9e8f80;
  --white:#fff;--border:#d6cfc4;--border2:#ede8e1;
  --red:#ef4444;--blue:#3b9eff;--purple:#a855f7;
  --r:14px;--r2:20px;--r3:28px;
  --sh:0 2px 12px rgba(28,18,9,.07);--sh2:0 8px 36px rgba(28,18,9,.13);--sh3:0 20px 60px rgba(28,18,9,.22);
  --ff:'Fraunces',serif;--fb:'Plus Jakarta Sans',sans-serif;
}
body{font-family:var(--fb);background:var(--cream);color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;}
h1,h2,h3,h4{font-family:var(--ff);}
html{font-size:15px;}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-track{background:#e8e0d5;}::-webkit-scrollbar-thumb{background:#2f6b47;border-radius:4px;}html,body{scrollbar-width:thin;scrollbar-color:#2f6b47 #e8e0d5;}

.loader{min-height:100vh;background:var(--g1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;}
.ld-logo{font-family:var(--ff);font-size:34px;font-weight:900;color:var(--lime);}
.ld-logo em{color:var(--amber);font-style:normal;}
.ld-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(74,222,128,.2);border-top-color:var(--lime);animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}

.toast-stack{position:fixed;top:18px;right:18px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
.toast{background:var(--ink);color:white;padding:11px 18px;border-radius:var(--r);font-size:15px;font-weight:600;box-shadow:var(--sh2);animation:tIn .3s cubic-bezier(.34,1.56,.64,1);max-width:290px;border-left:4px solid var(--lime2);}
.toast.err{border-left-color:var(--red);}
.toast.warn{border-left-color:var(--amber);}
@keyframes tIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}

/* LANDING */
.land{background:var(--g1);min-height:100vh;overflow-x:hidden;position:relative;}
.land-grain{position:fixed;inset:0;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");pointer-events:none;z-index:0;}
.land-nav{position:relative;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:20px 40px;}
.land-logo{font-family:var(--ff);font-size:26px;font-weight:900;color:var(--lime);display:flex;align-items:center;gap:3px;}
.land-logo em{color:var(--amber);font-style:normal;}
.land-logo sup{font-size:12px;background:var(--lime);color:var(--g1);border-radius:5px;padding:1px 5px;font-family:var(--fb);font-weight:900;margin-left:2px;}
.nav-btns{display:flex;gap:10px;align-items:center;}
.btn-ghost{padding:9px 20px;border-radius:var(--r);border:1.5px solid rgba(74,222,128,.3);background:transparent;color:var(--lime);font-family:var(--fb);font-size:15px;font-weight:600;cursor:pointer;transition:all .17s;}
.btn-ghost:hover{background:rgba(74,222,128,.1);}
.btn-lime{padding:9px 20px;border-radius:var(--r);border:none;background:var(--lime);color:var(--g1);font-family:var(--fb);font-size:15px;font-weight:800;cursor:pointer;transition:all .17s;}
.btn-lime:hover{background:#6ef99a;}
.dev-access-btn{padding:7px 16px;border-radius:var(--r);border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.07);color:var(--amber);font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;transition:all .17s;display:flex;align-items:center;gap:5px;}
.dev-access-btn:hover{background:rgba(245,158,11,.14);border-color:var(--amber);}
.l-hero{position:relative;z-index:5;text-align:center;padding:88px 24px 64px;}
.l-eyebrow{display:inline-flex;align-items:center;gap:8px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:30px;padding:8px 20px;color:var(--lime);font-size:15px;font-weight:700;margin-bottom:28px;}
.l-h1{font-size:clamp(44px,8vw,86px);font-weight:900;color:white;line-height:1.03;margin-bottom:24px;letter-spacing:-.025em;}
.l-h1 em{font-style:italic;color:var(--lime);}
.l-h1 span{color:var(--amber);}
.l-sub{font-size:18px;color:rgba(255,255,255,.52);max-width:540px;margin:0 auto 44px;line-height:1.75;}
.l-ctas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;}
.btn-hero{padding:17px 40px;border-radius:var(--r);border:none;background:var(--lime);color:var(--g1);font-family:var(--fb);font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 8px 28px rgba(74,222,128,.28);transition:all .18s;}
.btn-hero:hover{background:#6ef99a;transform:translateY(-2px);}
.btn-hero2{padding:17px 40px;border-radius:var(--r);border:1.5px solid rgba(255,255,255,.17);background:rgba(255,255,255,.07);color:white;font-family:var(--fb);font-size:16px;font-weight:600;cursor:pointer;transition:all .18s;}
.btn-hero2:hover{background:rgba(255,255,255,.13);}
.l-stats{display:flex;justify-content:center;gap:56px;padding:28px;flex-wrap:wrap;}
.lst{text-align:center;}
.lst-n{font-family:var(--ff);font-size:42px;font-weight:900;color:var(--lime);}
.lst-l{font-size:15px;color:rgba(255,255,255,.42);font-weight:500;margin-top:4px;}
.l-roles{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:0 40px 64px;max-width:1000px;margin:0 auto;position:relative;z-index:5;}
.rc{padding:30px 24px;border-radius:var(--r2);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);backdrop-filter:blur(12px);transition:all .22s;cursor:pointer;}
.rc:hover{background:rgba(255,255,255,.1);transform:translateY(-4px);}
.rc-ico{font-size:46px;display:block;margin-bottom:14px;}
.rc-title{font-size:20px;font-weight:700;color:white;margin-bottom:7px;}
.rc-desc{font-size:15px;color:rgba(255,255,255,.5);line-height:1.7;}
.rc-link{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:15px;font-weight:700;}
.l-how{padding:88px 40px;background:var(--cream);}
.how-inner{max-width:960px;margin:0 auto;}
.l-lbl{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--lime3);margin-bottom:10px;}
.l-sh{font-size:clamp(26px,4vw,42px);font-weight:900;color:var(--ink);margin-bottom:46px;line-height:1.2;}
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;}
.hw{background:var(--white);border-radius:var(--r2);padding:26px;box-shadow:var(--sh);}
.hw-ico{font-size:30px;margin-bottom:12px;display:block;}
.hw-t{font-size:16px;font-weight:700;margin-bottom:7px;}
.hw-d{font-size:15px;color:var(--muted);line-height:1.65;}
.l-admin-panel{padding:72px 40px;background:linear-gradient(135deg,#080c10 0%,#0f1923 100%);position:relative;overflow:hidden;}
.lap-inner{max-width:960px;margin:0 auto;position:relative;z-index:1;}
.l-regions{padding:64px 40px;background:var(--g1);}
.regions-center{max-width:700px;margin:0 auto;text-align:center;}
.regions-flex{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-top:22px;}
.rpill{padding:9px 18px;border-radius:30px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.17);color:var(--lime);font-size:15px;font-weight:600;}
.land-footer{padding:28px;text-align:center;color:rgba(255,255,255,.22);font-size:15px;border-top:1px solid rgba(255,255,255,.06);}

/* AUTH MODAL */
.auth-ov{position:fixed;inset:0;background:rgba(26,61,43,.9);z-index:500;display:flex;align-items:center;justify-content:center;padding:14px;animation:fadeIn .18s;backdrop-filter:blur(10px);}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.auth-card{background:var(--white);border-radius:var(--r3);width:100%;max-width:500px;max-height:94vh;overflow-y:auto;animation:slideUp .28s cubic-bezier(.34,1.56,.64,1);}
@keyframes slideUp{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}
.auth-top{padding:28px 28px 0;display:flex;justify-content:space-between;align-items:flex-start;}
.auth-brand{font-family:var(--ff);font-size:19px;font-weight:900;color:var(--g1);}
.auth-brand em{color:var(--amber);font-style:normal;}
.auth-title{font-size:23px;font-weight:900;margin-top:9px;}
.auth-sub{font-size:15px;color:var(--muted);margin-top:3px;}
.auth-close{width:32px;height:32px;border-radius:50%;border:none;background:var(--cream2);font-size:18px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.auth-body{padding:20px 28px 28px;}
.role-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:20px;}
.role-opt{padding:12px 6px;border-radius:var(--r);border:2px solid var(--border2);text-align:center;cursor:pointer;transition:all .13s;}
.role-opt:hover{border-color:var(--cream3);}
.role-opt.sel{border-color:var(--g1);background:var(--cream);}
.ro-ico{font-size:20px;display:block;margin-bottom:4px;}
.ro-lab{font-size:14px;font-weight:700;}
.ro-sub{font-size:12px;color:var(--muted);margin-top:1px;}
.fgrp{margin-bottom:12px;}
.fgrp label{display:block;font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;}
.finp{width:100%;padding:11px 13px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--cream);font-family:var(--fb);font-size:16px;color:var(--ink);outline:none;transition:border-color .13s;}
.finp:focus{border-color:var(--g1);background:white;}
.finp::placeholder{color:var(--dim);}
.frow2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.auth-hint{font-size:13px;color:var(--dim);margin-top:4px;}
.auth-err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:9px 13px;color:#dc2626;font-size:15px;margin-bottom:11px;}
.btn-auth{width:100%;padding:14px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:16px;font-weight:700;cursor:pointer;transition:all .17s;margin-top:3px;}
.btn-auth:hover{background:var(--g2);}
.btn-auth:disabled{opacity:.5;cursor:not-allowed;}
.auth-sw{text-align:center;margin-top:14px;font-size:15px;color:var(--muted);}
.auth-sw button{border:none;background:none;color:var(--lime3);font-weight:700;cursor:pointer;font-size:15px;text-decoration:underline;}
.cat-mini-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;margin-top:4px;}
.cat-mini{padding:9px 5px;border-radius:var(--r);border:1.5px solid var(--border2);cursor:pointer;text-align:center;transition:all .13s;}
.cat-mini:hover{border-color:var(--g3);}
.cat-mini.sel{border-color:var(--g1);background:var(--cream);}
.cat-mini-ico{font-size:17px;display:block;margin-bottom:2px;}
.cat-mini-lab{font-size:12px;font-weight:700;line-height:1.3;}
.logo-upload-row{display:flex;align-items:center;gap:14px;padding:12px;background:var(--cream);border-radius:var(--r);border:1.5px dashed var(--border);}
.logo-upload-preview{width:80px;height:80px;border-radius:16px;border:2px solid var(--border2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:white;cursor:pointer;position:relative;}
.logo-upload-preview.rider-photo-preview{border-radius:50%;background:var(--g1);}
.logo-upload-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0;transition:opacity .17s;border-radius:inherit;}
.logo-upload-preview:hover .logo-upload-overlay{opacity:1;}
.logo-upload-info{flex:1;}
.btn-upload-logo{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:var(--r);border:1.5px solid var(--g3);background:transparent;color:var(--g3);font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;transition:all .13s;}
.btn-upload-logo:hover{background:rgba(47,107,71,.08);}

/* APP SHELL */
.shell{height:100vh;background:var(--cream);display:flex;flex-direction:column;overflow:hidden;}
.topbar{height:56px;background:var(--white);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;padding:0 16px;position:sticky;top:0;z-index:100;box-shadow:0 1px 10px rgba(28,18,9,.06);}
.tb-brand{font-family:var(--ff);font-size:20px;font-weight:900;color:var(--g1);cursor:pointer;display:flex;align-items:center;}
.tb-brand em{color:var(--amber);font-style:normal;}
.tb-brand sup{font-size:12px;background:var(--lime);color:var(--g1);border-radius:5px;padding:1px 5px;font-family:var(--fb);font-weight:900;margin-left:2px;}
.tb-tabs{display:flex;gap:2px;}
.tb-tab{padding:7px 12px;border-radius:9px;border:none;background:transparent;color:var(--muted);font-family:var(--fb);font-size:14px;font-weight:600;cursor:pointer;transition:all .13s;display:flex;align-items:center;gap:4px;white-space:nowrap;}
.tb-tab:hover{background:var(--cream);color:var(--ink);}
.tb-tab.act{background:var(--g1);color:white;}
.tb-tab.adm.act{background:linear-gradient(135deg,var(--amber),var(--amber2));color:var(--ink);}
.tb-badge{background:var(--coral);color:white;font-size:12px;font-weight:800;padding:1px 5px;border-radius:9px;}
.tb-right{display:flex;align-items:center;gap:8px;}
.user-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:30px;background:var(--cream2);font-size:14px;font-weight:600;}
.role-tag{font-size:12px;font-weight:800;padding:2px 7px;border-radius:8px;}
.rt-customer{background:rgba(74,222,128,.14);color:var(--lime3);}
.rt-business{background:rgba(245,158,11,.14);color:var(--amber2);}
.rt-rider{background:rgba(249,115,22,.14);color:var(--coral2);}
.rt-admin{background:rgba(168,85,247,.12);color:var(--purple);}
.btn-out{padding:6px 12px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;transition:all .13s;}
.btn-out:hover{background:var(--cream2);}
.dev-bar{background:linear-gradient(135deg,#0a0e13,#13191f);border-bottom:1px solid rgba(245,158,11,.15);padding:8px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dev-bar-label{font-size:13px;font-weight:800;color:rgba(245,158,11,.6);text-transform:uppercase;letter-spacing:.8px;}
.dev-role-btn{padding:6px 14px;border-radius:9px;border:1.5px solid rgba(255,255,255,.1);background:transparent;color:rgba(255,255,255,.5);font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;transition:all .14s;display:flex;align-items:center;gap:5px;}
.dev-role-btn:hover{border-color:rgba(245,158,11,.4);color:var(--amber);}
.dev-role-btn.act{background:rgba(245,158,11,.12);border-color:var(--amber);color:var(--amber);}
.dev-info{margin-left:auto;font-size:13px;color:rgba(255,255,255,.25);font-style:italic;}

/* IMAGE UPLOAD COMPONENT */
.img-upload-area{border:2px dashed var(--border);border-radius:var(--r2);padding:20px;text-align:center;cursor:pointer;transition:all .17s;background:var(--cream);position:relative;overflow:hidden;}
.img-upload-area:hover{border-color:var(--g3);background:var(--cream2);}
.img-upload-area.has-img{border-style:solid;border-color:var(--g3);}
.img-upload-preview{width:100%;height:140px;object-fit:cover;border-radius:10px;display:block;}
.img-upload-overlay{position:absolute;inset:0;background:rgba(26,61,43,.55);display:flex;align-items:center;justify-content:center;gap:8px;opacity:0;transition:opacity .17s;border-radius:var(--r2);}
.img-upload-area:hover .img-upload-overlay{opacity:1;}
.img-upload-placeholder{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0;}
.iup-ico{font-size:32px;}
.iup-txt{font-size:15px;font-weight:700;color:var(--muted);}
.iup-hint{font-size:13px;color:var(--dim);}
.img-uploading{display:flex;align-items:center;justify-content:center;gap:9px;height:80px;color:var(--muted);font-size:15px;font-weight:600;}

/* CUSTOMER */
.cw{max-width:1080px;margin:0 auto;padding:20px 12px;}
.c-hero{background:linear-gradient(135deg,var(--g1),var(--g2));border-radius:var(--r3);padding:28px 32px;margin-bottom:20px;position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;}
.c-hero::before{content:'🌍';position:absolute;right:28px;top:50%;transform:translateY(-50%);font-size:100px;opacity:.07;pointer-events:none;}
.ch-greet{font-size:24px;font-weight:900;color:white;}
.ch-sub{color:rgba(255,255,255,.52);font-size:15px;margin-top:3px;}
.ch-region{display:flex;align-items:center;gap:9px;margin-top:12px;flex-wrap:wrap;}
.ch-region label{font-size:12px;color:rgba(255,255,255,.4);font-weight:800;text-transform:uppercase;}
.rsel{padding:7px 12px;border-radius:var(--r);border:1.5px solid rgba(74,222,128,.27);background:rgba(255,255,255,.08);color:var(--lime);font-family:var(--fb);font-size:14px;font-weight:600;outline:none;cursor:pointer;}
.rsel option{background:var(--g1);}
.sbox{display:flex;align-items:center;gap:10px;background:white;border-radius:var(--r2);padding:0 16px;box-shadow:var(--sh2);margin-bottom:18px;border:1.5px solid var(--border2);}
.sbox input{flex:1;padding:12px 0;border:none;background:transparent;font-family:var(--fb);font-size:16px;color:var(--ink);outline:none;}
.sbox input::placeholder{color:var(--dim);}
.cat-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:20px;scrollbar-width:none;}
.cat-scroll::-webkit-scrollbar{display:none;}
.cpill{display:flex;align-items:center;gap:5px;padding:8px 15px;border-radius:30px;border:1.5px solid var(--border);background:white;color:var(--muted);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .13s;flex-shrink:0;}
.cpill:hover{border-color:var(--g3);}
.cpill.act{background:var(--g1);color:white;border-color:var(--g1);}
.biz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:16px;margin-bottom:28px;}
.biz-card{background:white;border-radius:var(--r2);box-shadow:var(--sh);overflow:hidden;cursor:pointer;transition:all .18s;border:1.5px solid var(--border2);}
.biz-card:hover{transform:translateY(-4px);box-shadow:var(--sh2);}
.bc-banner{height:110px;display:flex;align-items:center;justify-content:center;font-size:50px;position:relative;overflow:hidden;}
.bc-banner-img{width:100%;height:100%;object-fit:cover;}
.bc-reg{position:absolute;top:9px;right:9px;background:rgba(255,255,255,.92);border-radius:20px;padding:3px 9px;font-size:12px;font-weight:700;}
.bc-logo-badge{position:absolute;bottom:-18px;left:14px;width:40px;height:40px;border-radius:10px;border:2.5px solid white;object-fit:cover;box-shadow:var(--sh);}
.bc-body{padding:14px 14px 14px;}
.bc-name{font-size:16px;font-weight:700;margin-bottom:2px;}
.bc-cat{font-size:13px;color:var(--muted);margin-bottom:8px;}
.bc-meta{display:flex;align-items:center;gap:9px;}
.bc-rating{font-size:14px;font-weight:700;color:var(--amber2);}
.bc-cnt{font-size:13px;color:var(--dim);}
.bc-items{margin-left:auto;font-size:14px;font-weight:700;color:var(--g3);}

/* BIZ DETAIL */
.bdp{max-width:860px;margin:0 auto;padding:20px 12px;}
.back-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--r);border:1.5px solid var(--border);background:transparent;color:var(--muted);font-size:14px;font-weight:600;cursor:pointer;margin-bottom:16px;transition:all .13s;}
.back-btn:hover{background:var(--cream2);}
.bdp-hero{background:linear-gradient(135deg,var(--g1),var(--g2));border-radius:var(--r2);padding:24px 28px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.bdp-name{font-size:22px;font-weight:900;color:white;}
.bdp-desc{color:rgba(255,255,255,.52);font-size:15px;margin-top:4px;}
.bdp-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;}
.bdp-tag{padding:3px 11px;border-radius:20px;background:rgba(74,222,128,.13);color:var(--lime);font-size:13px;font-weight:700;}
.bdp-emo{font-size:52px;}

/* PRODUCT GRID */
.prod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:13px;margin-bottom:90px;}
.prod-item{background:white;border-radius:var(--r2);overflow:hidden;box-shadow:var(--sh);border:1.5px solid var(--border2);transition:all .16s;}
.prod-item:hover{transform:translateY(-3px);box-shadow:var(--sh2);}
.pi-img{width:100%;height:160px;object-fit:cover;display:block;}
.pi-img-placeholder{height:110px;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,var(--cream),var(--cream2));}
.pi-body{padding:13px;}
.pi-emo{font-size:32px;margin-bottom:8px;display:block;}
.pi-name{font-weight:700;font-size:15px;margin-bottom:2px;}
.pi-cat{font-size:12px;color:var(--dim);margin-bottom:6px;}
.pi-desc{font-size:13px;color:var(--muted);margin-bottom:8px;line-height:1.5;}
.pi-price{font-family:var(--ff);font-size:19px;font-weight:700;color:var(--g1);margin-bottom:11px;}
.qty-row{display:flex;align-items:center;gap:10px;}
.qbtn{width:28px;height:28px;border-radius:50%;border:2px solid var(--g3);background:transparent;color:var(--g1);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .13s;}
.qbtn:hover{background:var(--g1);color:white;border-color:var(--g1);}
.qnum{font-weight:800;font-size:16px;min-width:20px;text-align:center;}

/* CART */
.cart-fab{position:fixed;bottom:24px;right:24px;background:var(--g1);color:white;border-radius:50px;padding:13px 22px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 28px rgba(26,61,43,.42);cursor:pointer;font-weight:700;font-size:16px;transition:transform .17s;z-index:50;}
.cart-fab:hover{transform:scale(1.04);}
.cart-cnt{background:var(--lime);color:var(--g1);width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;}
.sp-ov{position:fixed;inset:0;background:rgba(26,61,43,.6);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .17s;}
.sp-panel{background:white;border-radius:var(--r3) var(--r3) 0 0;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;padding:24px;animation:slideUp .27s cubic-bezier(.34,1.56,.64,1);}
.sp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
.sp-head h3{font-size:20px;font-weight:900;}
.sp-close{width:32px;height:32px;border-radius:50%;border:none;background:var(--cream);font-size:17px;cursor:pointer;color:var(--muted);}
.cl{display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--border2);}
.cl-img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0;}
.cl-emo{font-size:22px;width:44px;text-align:center;flex-shrink:0;}
.cl-name{font-weight:600;font-size:15px;}
.cl-sub{font-size:13px;color:var(--muted);}
.cl-tot{margin-left:auto;font-family:var(--ff);font-weight:700;font-size:15px;color:var(--g1);}
.cart-total-row{display:flex;justify-content:space-between;padding:13px 0;border-top:2px solid var(--border2);margin-top:5px;}
.ctr-lab{font-size:15px;color:var(--muted);}
.ctr-amt{font-family:var(--ff);font-size:25px;font-weight:900;color:var(--amber2);}
.btn-place{width:100%;padding:14px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:16px;font-weight:700;cursor:pointer;margin-top:12px;transition:all .16s;}
.btn-place:hover{background:var(--g2);}
.btn-place:disabled{opacity:.5;cursor:not-allowed;}

/* RECEIPT */
.receipt-ov{position:fixed;inset:0;background:rgba(26,61,43,.8);z-index:300;display:flex;align-items:center;justify-content:center;padding:14px;animation:fadeIn .2s;}
.receipt-box{background:white;border-radius:var(--r3);width:100%;max-width:420px;max-height:92vh;overflow-y:auto;animation:slideUp .28s cubic-bezier(.34,1.56,.64,1);}
.rcpt-head{background:var(--g1);padding:24px;text-align:center;border-radius:var(--r3) var(--r3) 0 0;position:relative;}
.rcpt-logo{width:72px;height:72px;border-radius:16px;object-fit:cover;border:3px solid rgba(74,222,128,.4);margin-bottom:10px;}
.rcpt-logo-placeholder{width:72px;height:72px;border-radius:16px;background:rgba(74,222,128,.15);display:flex;align-items:center;justify-content:center;font-size:34px;margin:0 auto 10px;}
.rcpt-biz-name{font-family:var(--ff);font-size:20px;font-weight:900;color:white;}
.rcpt-biz-sub{font-size:14px;color:rgba(255,255,255,.52);margin-top:3px;}
.rcpt-body{padding:24px;}
.rcpt-divider{border:none;border-top:2px dashed var(--border2);margin:16px 0;}
.rcpt-row{display:flex;justify-content:space-between;font-size:15px;margin-bottom:8px;}
.rcpt-row.bold{font-weight:800;font-size:15px;padding-top:6px;border-top:2px solid var(--border2);}
.rcpt-id{font-family:var(--ff);font-size:26px;font-weight:900;color:var(--g1);text-align:center;letter-spacing:2px;margin:14px 0 8px;}
.rcpt-status{text-align:center;margin-bottom:14px;}
.rcpt-items{background:var(--cream);border-radius:var(--r);padding:13px;margin-bottom:14px;}
.rcpt-item{display:flex;justify-content:space-between;font-size:14px;padding:4px 0;color:var(--muted);}
.rcpt-item strong{color:var(--ink);font-weight:600;}
.rcpt-actions{display:flex;gap:8px;margin-top:16px;}
.btn-print{flex:1;padding:12px;border-radius:var(--r);border:1.5px solid var(--g1);background:transparent;color:var(--g1);font-family:var(--fb);font-size:15px;font-weight:700;cursor:pointer;}
.btn-done{flex:2;padding:12px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:15px;font-weight:700;cursor:pointer;}
@media print{
  body > *{display:none!important;}
  .receipt-box{display:block!important;box-shadow:none;border-radius:0;max-height:none;overflow:visible;}
  .rcpt-actions{display:none;}
  .receipt-ov{position:static;background:none;padding:0;}
}

/* ORDERS */
.ord-list{display:flex;flex-direction:column;gap:11px;margin-top:18px;}
.ord-row{background:white;border-radius:var(--r2);padding:16px;box-shadow:var(--sh);border-left:4px solid transparent;}
.or-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
.or-id{font-family:var(--ff);font-size:16px;font-weight:700;}
.or-biz{font-size:14px;color:var(--muted);margin-bottom:4px;}
.or-items{font-size:13px;color:var(--dim);margin-bottom:7px;}
.or-foot{display:flex;justify-content:space-between;margin-top:7px;}
.or-total{font-family:var(--ff);font-size:17px;font-weight:700;color:var(--g1);}
.or-time{font-size:13px;color:var(--dim);}
.track-bar{display:flex;justify-content:space-between;padding:10px 0;position:relative;}
.track-bar::before{content:'';position:absolute;top:22px;left:14px;right:14px;height:2px;background:var(--border2);}
.tst{display:flex;flex-direction:column;align-items:center;gap:5px;z-index:1;flex:1;}
.tst-dot{width:26px;height:26px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--dim);}
.tst-dot.done{background:var(--g1);color:white;}
.tst-dot.active{background:var(--lime2);color:white;box-shadow:0 0 0 4px rgba(34,197,94,.17);}
.tst-lab{font-size:10px;font-weight:700;color:var(--dim);text-align:center;line-height:1.3;}
.tst-lab.done,.tst-lab.act{color:var(--g1);}

/* BUSINESS APP */
.bw{max-width:1080px;margin:0 auto;padding:20px 12px;}
.biz-hdr{background:linear-gradient(135deg,var(--g1),var(--g2));border-radius:var(--r3);padding:22px 26px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.biz-hdr-logo{width:68px;height:68px;border-radius:18px;object-fit:cover;border:3px solid rgba(74,222,128,.45);box-shadow:0 4px 18px rgba(0,0,0,.25);flex-shrink:0;}
.biz-hdr-logo-ph{width:68px;height:68px;border-radius:18px;background:rgba(74,222,128,.15);border:2px dashed rgba(74,222,128,.35);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;}
.bh-name{font-size:20px;font-weight:900;color:white;}
.bh-sub{color:rgba(255,255,255,.52);font-size:14px;margin-top:3px;}
.bh-stats{display:flex;gap:16px;flex-wrap:wrap;}
.bhs{text-align:center;}
.bhs-v{font-family:var(--ff);font-size:20px;font-weight:900;color:var(--lime);}
.bhs-l{font-size:12px;color:rgba(255,255,255,.42);font-weight:700;text-transform:uppercase;}
.biz-tabs{display:flex;gap:3px;margin-bottom:18px;border-bottom:2px solid var(--border2);}
.biztab{padding:9px 16px;border:none;background:transparent;color:var(--muted);font-family:var(--fb);font-size:14px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .13s;}
.biztab:hover{color:var(--ink);}
.biztab.act{color:var(--g1);border-bottom-color:var(--g1);font-weight:800;}
.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:13px;}
.pm-card{background:white;border-radius:var(--r2);overflow:hidden;box-shadow:var(--sh);border:1.5px solid var(--border2);}
.pm-img{width:100%;height:140px;object-fit:cover;}
.pm-img-ph{height:100px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--cream),var(--cream2));}
.pm-body{padding:13px;}
.pm-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px;}
.pm-emo{font-size:28px;}
.pm-avail{display:flex;align-items:center;gap:4px;cursor:pointer;}
.av-dot{width:7px;height:7px;border-radius:50%;}
.pm-name{font-weight:700;font-size:15px;margin-bottom:3px;}
.pm-price{font-family:var(--ff);font-size:16px;font-weight:700;color:var(--g1);margin-bottom:10px;}
.pm-acts{display:flex;gap:6px;}
.btn-sm{padding:5px 10px;border-radius:7px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .13s;font-family:var(--fb);}
.bs-edit{background:rgba(26,61,43,.08);color:var(--g1);}
.bs-del{background:rgba(239,68,68,.08);color:var(--red);}
.ord-card{background:white;border-radius:var(--r2);padding:16px;box-shadow:var(--sh);margin-bottom:11px;border-left:4px solid transparent;}
.oc-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.oc-id{font-family:var(--ff);font-size:16px;font-weight:700;}
.oc-time{font-size:12px;color:var(--dim);}
.oc-cust{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.oc-av{width:32px;height:32px;border-radius:50%;background:var(--cream2);display:flex;align-items:center;justify-content:center;font-size:15px;}
.oc-cname{font-weight:600;font-size:15px;}
.oc-caddr{font-size:13px;color:var(--muted);}
.oc-items{font-size:13px;color:var(--muted);margin-bottom:8px;}
.oc-rider{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:7px;padding:6px 10px;font-size:13px;color:var(--lime3);margin-bottom:8px;font-weight:600;}
.oc-foot{display:flex;justify-content:space-between;align-items:center;}
.oc-total{font-family:var(--ff);font-size:18px;font-weight:900;color:var(--g1);}
.oc-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border2);}
.act-btn{padding:6px 12px;border-radius:var(--r);border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .13s;font-family:var(--fb);}
.ab-c{background:rgba(59,158,255,.12);color:var(--blue);}
.ab-p{background:rgba(168,85,247,.12);color:var(--purple);}
.ab-a{background:rgba(16,185,129,.1);color:#059669;}
.ab-d{background:rgba(34,197,94,.1);color:var(--lime3);}
.ab-x{background:rgba(239,68,68,.1);color:var(--red);}

/* MODALS */
.modal-ov{position:fixed;inset:0;background:rgba(26,61,43,.72);z-index:300;display:flex;align-items:center;justify-content:center;padding:12px;}
.modal-box{background:white;border-radius:var(--r3);padding:28px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;animation:slideUp .24s cubic-bezier(.34,1.56,.64,1);}
.modal-box h3{font-size:18px;font-weight:900;margin-bottom:16px;color:var(--g1);}
.rider-opt{display:flex;align-items:center;gap:11px;padding:12px;border-radius:var(--r);border:1.5px solid var(--border2);cursor:pointer;margin-bottom:8px;transition:all .13s;}
.rider-opt:hover{border-color:var(--g3);}
.rider-opt.sel{border-color:var(--g1);background:var(--cream);}
.ro2-ico{font-size:24px;}
.ro2-name{font-weight:700;font-size:15px;}
.ro2-det{font-size:13px;color:var(--muted);}
.ro2-rat{margin-left:auto;color:var(--amber2);font-weight:700;font-size:14px;}
.macts{display:flex;gap:8px;margin-top:16px;}
.mact-sec{flex:1;padding:10px;border-radius:var(--r);border:1.5px solid var(--border);background:transparent;font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;color:var(--muted);}
.mact-pri{flex:2;padding:10px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:14px;font-weight:800;cursor:pointer;}
.mact-pri:disabled{opacity:.4;cursor:not-allowed;}

/* RIDER APP */
.rw{max-width:740px;margin:0 auto;padding:20px 12px;}
.rider-hdr{background:white;border-radius:var(--r2);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;box-shadow:var(--sh);flex-wrap:wrap;gap:11px;}
.rh-av{width:52px;height:52px;border-radius:50%;background:var(--g1);color:var(--lime);display:flex;align-items:center;justify-content:center;font-family:var(--ff);font-size:20px;font-weight:900;flex-shrink:0;}
.rh-av-photo{width:52px;height:52px;border-radius:50%;object-fit:cover;border:3px solid var(--lime2);box-shadow:0 2px 10px rgba(0,0,0,.15);flex-shrink:0;}
.rh-name{font-weight:700;font-size:16px;}
.rh-det{font-size:13px;color:var(--muted);}
.toggle-row{display:flex;align-items:center;gap:8px;}
.toggle-track{width:44px;height:22px;border-radius:11px;cursor:pointer;transition:background .17s;border:none;position:relative;flex-shrink:0;}
.toggle-thumb{width:16px;height:16px;border-radius:50%;background:white;position:absolute;top:3px;transition:left .17s;box-shadow:0 1px 3px rgba(0,0,0,.18);}
.avail-lbl{font-size:14px;font-weight:700;}
.r-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-bottom:18px;}
.rs{background:white;border-radius:var(--r2);padding:13px;text-align:center;box-shadow:var(--sh);}
.rs-v{font-family:var(--ff);font-size:22px;font-weight:900;}
.rs-l{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-top:2px;}
.job-card{background:white;border-radius:var(--r2);padding:16px;box-shadow:var(--sh);margin-bottom:11px;border:1.5px solid var(--border2);transition:all .17s;}
.job-card:hover{box-shadow:var(--sh2);transform:translateY(-2px);}
.jc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.jc-id{font-family:var(--ff);font-size:16px;font-weight:700;}
.jc-earn{font-family:var(--ff);font-size:20px;font-weight:900;color:var(--g1);}
.jc-route{display:flex;align-items:center;gap:8px;margin:9px 0;}
.jr-pt{font-size:14px;font-weight:600;}
.jr-line{flex:1;height:2px;background:linear-gradient(90deg,var(--g1),var(--amber));border-radius:2px;}
.jc-items{font-size:13px;color:var(--muted);margin-bottom:11px;}
.btn-accept{width:100%;padding:11px;border-radius:var(--r);border:none;background:var(--lime2);color:white;font-family:var(--fb);font-size:15px;font-weight:800;cursor:pointer;transition:all .13s;}
.btn-accept:hover{background:var(--lime3);}
.active-del{background:white;border-radius:var(--r2);padding:16px;box-shadow:var(--sh);margin-bottom:11px;border-top:4px solid var(--lime2);}
.pay-badge{padding:4px 10px;border-radius:20px;font-size:13px;font-weight:800;}
.pb-cash{background:rgba(245,158,11,.12);color:var(--amber2);}
.pb-paid{background:rgba(74,222,128,.12);color:var(--lime3);}
.pb-pos{background:rgba(59,158,255,.12);color:var(--blue);}
.r-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
.btn-call{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:var(--r);border:none;background:#25d366;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--fb);}
.btn-deliver{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--fb);}
.btn-directions{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:var(--r);border:none;background:rgba(59,158,255,.12);color:var(--blue);font-size:14px;font-weight:700;cursor:pointer;font-family:var(--fb);text-decoration:none;}

/* ADMIN */
.aw{max-width:1180px;margin:0 auto;padding:24px 12px;}
.adm-hero{background:linear-gradient(135deg,#080c10,#111a24);border-radius:var(--r3);padding:28px 34px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;position:relative;overflow:hidden;}
.adm-hero::after{content:'⚡';position:absolute;right:32px;font-size:120px;opacity:.04;pointer-events:none;}
.adm-hero h1{font-size:24px;font-weight:900;color:var(--amber);}
.adm-hero p{color:rgba(255,255,255,.4);font-size:15px;margin-top:3px;}
.adm-badge2{display:inline-flex;align-items:center;gap:5px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:20px;padding:4px 12px;color:var(--lime);font-size:13px;font-weight:700;margin-top:8px;}
.mrr-box{text-align:right;}
.mrr-lab{font-size:12px;color:rgba(255,255,255,.35);text-transform:uppercase;font-weight:700;}
.mrr-val{font-family:var(--ff);font-size:36px;font-weight:900;color:var(--amber);}
.mrr-sub{font-size:14px;color:var(--lime);font-weight:700;}
.adm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:24px;}
.as{background:white;border-radius:var(--r2);padding:15px;box-shadow:var(--sh);position:relative;overflow:hidden;}
.as::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;}
.as-amb::after{background:var(--amber);}
.as-grn::after{background:var(--lime2);}
.as-cor::after{background:var(--coral);}
.as-blu::after{background:var(--blue);}
.as-pur::after{background:var(--purple);}
.as-v{font-family:var(--ff);font-size:26px;font-weight:900;}
.as-l{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:3px;}
.as-ico{position:absolute;top:12px;right:12px;font-size:19px;opacity:.12;}
.adm-tabs{display:flex;gap:3px;margin-bottom:20px;border-bottom:2px solid var(--border2);}
.adm-tab{padding:9px 16px;border:none;background:transparent;color:var(--muted);font-family:var(--fb);font-size:14px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .13s;}
.adm-tab:hover{color:var(--ink);}
.adm-tab.act{color:var(--g1);border-bottom-color:var(--amber2);font-weight:800;}
.sect-head{display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px;}
.sect-h{font-family:var(--ff);font-size:16px;font-weight:700;}
.adm-tbl{background:white;border-radius:var(--r2);box-shadow:var(--sh);overflow:hidden;margin-bottom:22px;}
.tbl-hd{display:grid;padding:10px 16px;border-bottom:1px solid var(--border2);font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;}
.tbl-row{display:grid;padding:12px 16px;border-bottom:1px solid var(--border2);align-items:center;transition:background .11s;}
.tbl-row:last-child{border-bottom:none;}
.tbl-row:hover{background:var(--cream);}
.t-name{font-weight:700;font-size:15px;}
.t-sub{font-size:13px;color:var(--muted);}
.plan-pill{padding:3px 9px;border-radius:20px;font-size:13px;font-weight:800;}
.sdot{width:7px;height:7px;border-radius:50%;}
.adm-act{padding:5px 10px;border-radius:7px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--fb);}
.aa-sus{background:rgba(239,68,68,.08);color:var(--red);}
.aa-act{background:rgba(34,197,94,.08);color:var(--lime3);}
.sub-card{background:white;border-radius:var(--r2);padding:16px;box-shadow:var(--sh);margin-bottom:11px;border:1.5px solid var(--border2);}
.sub-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;}
.sub-bname{font-weight:700;font-size:16px;}
.sub-meta{font-size:13px;color:var(--muted);margin-top:2px;}
.sub-plans{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;}
.sub-plan-btn{padding:7px 14px;border-radius:var(--r);border:2px solid;font-size:14px;font-weight:800;cursor:pointer;background:transparent;transition:all .13s;font-family:var(--fb);}
.btn-record-pay{padding:7px 14px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--fb);}
.rev-chart{display:flex;align-items:flex-end;gap:6px;height:90px;}
.rev-bw{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
.rev-bar{width:100%;border-radius:4px 4px 0 0;background:linear-gradient(to top,var(--g3),var(--lime));transition:height .6s cubic-bezier(.34,1.56,.64,1);}
.rev-bl{font-size:12px;color:var(--muted);font-weight:600;}
.btn-onboard{display:flex;align-items:center;gap:5px;padding:8px 16px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;}

/* SHARED */
.sbadge{padding:3px 10px;border-radius:20px;font-size:13px;font-weight:800;}
.empty-st{text-align:center;padding:52px 20px;color:var(--muted);}
.empty-st .ico{font-size:42px;display:block;margin-bottom:10px;}
.empty-st h3{font-size:16px;font-weight:700;margin-bottom:6px;color:var(--ink);}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid var(--border2);display:flex;justify-content:center;gap:4px;padding:7px 14px;z-index:50;}
.bnav-btn{flex:1;max-width:150px;padding:6px 0;border:none;border-radius:9px;background:transparent;color:var(--muted);font-family:var(--fb);font-size:12px;font-weight:700;cursor:pointer;}
.bnav-btn.act{background:var(--cream2);color:var(--g1);}

/* GPS LOCATION PICKER */
.gps-box{background:var(--cream);border-radius:var(--r);padding:14px;border:1.5px solid var(--border2);}
.gps-coords{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:9px;}
.gps-val{font-family:var(--ff);font-size:15px;font-weight:700;color:var(--g1);}
.btn-gps{display:inline-flex;align-items:center;gap:5px;padding:8px 14px;border-radius:var(--r);border:1.5px solid var(--g3);background:transparent;color:var(--g3);font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;transition:all .14s;}
.btn-gps:hover{background:var(--g1);color:white;border-color:var(--g1);}
.btn-gps:disabled{opacity:.5;cursor:not-allowed;}

/* DISCOUNT BADGE */
.disc-badge{display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;font-size:12px;font-weight:900;padding:2px 8px;border-radius:20px;margin-bottom:5px;}
.disc-orig{font-size:13px;color:var(--dim);text-decoration:line-through;margin-right:5px;}
.disc-save{font-size:12px;color:#dc2626;font-weight:700;}
.pi-price-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:11px;}
.pm-disc-badge{background:rgba(239,68,68,.12);color:var(--red);font-size:11px;font-weight:900;padding:1px 6px;border-radius:10px;}

/* SORT BAR */
.sort-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.sort-lbl{font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
.sort-btn{padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:white;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;transition:all .13s;white-space:nowrap;}
.sort-btn.act{background:var(--g1);color:white;border-color:var(--g1);}
.prod-filter-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;}
.prod-filter-row::-webkit-scrollbar{display:none;}

/* TOWN FIELD */
.town-scroll{max-height:160px;overflow-y:auto;border:1.5px solid var(--border);border-radius:var(--r);background:white;}
.town-opt{padding:9px 13px;font-size:15px;cursor:pointer;transition:background .1s;}
.town-opt:hover{background:var(--cream);}
.town-opt.sel{background:var(--cream2);font-weight:700;color:var(--g1);}

/* RIDER PANEL IN ORDERS */
.rider-panel{background:var(--cream);border-radius:var(--r2);padding:16px;margin-top:10px;border:1.5px solid var(--border2);}
.rider-panel-title{font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;}
.rider-avail-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--r);border:2px solid var(--border2);background:white;cursor:pointer;margin-bottom:7px;transition:all .13s;}
.rider-avail-card:hover{border-color:var(--g3);}
.rider-avail-card.sel{border-color:var(--g1);background:rgba(26,61,43,.04);}
.rac-photo{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--lime2);}
.rac-av{width:36px;height:36px;border-radius:50%;background:var(--g1);color:var(--lime);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0;}
.rac-name{font-weight:700;font-size:14px;}
.rac-det{font-size:12px;color:var(--muted);}
.rac-rat{margin-left:auto;color:var(--amber2);font-size:13px;font-weight:700;}

/* ADD TO CART BUTTON */
.btn-add-cart{width:100%;padding:9px;border-radius:var(--r);border:none;background:var(--g1);color:white;font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;margin-top:8px;}
.btn-add-cart:hover{background:var(--g2);}
.qty-ctrl{display:flex;align-items:center;justify-content:space-between;background:var(--g1);border-radius:var(--r);padding:4px 8px;margin-top:8px;}
.qty-ctrl .qbtn{width:26px;height:26px;border:none;background:rgba(255,255,255,.15);color:white;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.qty-ctrl .qbtn:hover{background:rgba(255,255,255,.3);}
.qty-ctrl .qnum{color:white;font-weight:800;font-size:15px;}

/* MOBILE-FRIENDLY TOPBAR */
.tb-menu-btn{display:none;padding:6px 9px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;}
.tb-mobile-drawer{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;}
.tmd-backdrop{flex:1;background:rgba(0,0,0,.5);}
.tmd-panel{background:white;padding:20px;display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow-y:auto;}
.tmd-btn{padding:12px 16px;border-radius:var(--r);border:none;background:transparent;color:var(--ink);font-family:var(--fb);font-size:16px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;}
.tmd-btn.act{background:var(--g1);color:white;}

/* BUSINESS MOBILE BOTTOM NAV */
.biz-bot-nav{position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid var(--border2);display:none;justify-content:space-around;padding:6px 8px;z-index:50;}
.bbn-btn{flex:1;padding:6px 4px;border:none;border-radius:8px;background:transparent;color:var(--muted);font-family:var(--fb);font-size:11px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;}
.bbn-btn .bbn-ico{font-size:18px;}
.bbn-btn.act{color:var(--g1);background:var(--cream);}
.bbn-badge{background:var(--coral);color:white;font-size:10px;font-weight:900;padding:1px 4px;border-radius:8px;min-width:14px;text-align:center;}

@keyframes pulseAmber{0%,100%{box-shadow:0 4px 20px rgba(245,158,11,.35)}50%{box-shadow:0 4px 32px rgba(245,158,11,.65)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes slideInAlert{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes ringBell{0%,100%{transform:rotate(0)}15%{transform:rotate(18deg)}30%{transform:rotate(-18deg)}45%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}}

@media(max-width:700px){
  .l-roles{grid-template-columns:1fr;}
  .land-nav{padding:16px 18px;}
  .l-hero{padding:60px 18px 40px;}
  .l-stats{gap:26px;}
  .adm-stats{grid-template-columns:1fr 1fr;}
  .tb-menu-btn{display:flex;align-items:center;justify-content:center;}
  .tb-tabs{display:none;}
  .topbar{padding:0 10px;}
  .frow2{grid-template-columns:1fr;}
  .biz-tabs{display:none;}
  .biz-bot-nav{display:flex;}
  .bw{padding-bottom:72px;}
  .biz-hdr{padding:16px 16px;}
  .biz-hdr-logo{width:52px;height:52px;}
  .bh-name{font-size:17px;}
  .prod-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));}
  .pi-img{height:130px;}
  .biz-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}
  .c-hero{padding:20px 18px;}
  .ch-greet{font-size:20px;}
  .bdp{padding:14px 10px;}
  .bdp-hero{padding:18px 18px;}
  .bdp-name{font-size:18px;}
  .cart-fab{bottom:72px;right:14px;padding:11px 16px;font-size:15px;}
  .sp-panel{padding:18px;}
  .rw{padding-bottom:20px;}
  .rider-hdr{padding:12px 12px;}
  .adm-tabs{overflow-x:auto;scrollbar-width:none;}
  .adm-tabs::-webkit-scrollbar{display:none;}
  .adm-tab{white-space:nowrap;}
  .sort-bar{gap:5px;}
  .track-bar{overflow-x:auto;}
  .tst-lab{font-size:7px;}
}

/* ── FLEET / DRIVER SYSTEM ──────────────────────────────────────────────── */
.fleet-driver-card{background:var(--white);border-radius:var(--r2);padding:16px;box-shadow:var(--sh);border:1.5px solid var(--border2);margin-bottom:12px;}
.fleet-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.fleet-stat-cell{text-align:center;padding:10px 6px;background:var(--cream);border-radius:var(--r);}
.fleet-stat-val{font-family:var(--ff);font-size:16px;font-weight:900;}
.fleet-stat-lbl{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2;}
.driver-photo-circle{width:52px;height:52px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,var(--g1),var(--g3));display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2.5px solid var(--border2);}
.driver-photo-circle img{width:100%;height:100%;object-fit:cover;}
.driver-photo-circle .initials{color:white;font-weight:900;font-size:20px;}
.rate-stars{display:flex;gap:5px;cursor:pointer;}
.rate-star{font-size:26px;transition:transform .1s;}
.rate-star.active{transform:scale(1.2);}
@media(max-width:700px){
  .fleet-stat-grid{grid-template-columns:repeat(2,1fr);}
}

/* ── DARK MODE ─────────────────────────────────────────────────────────────── */
body.dark-mode{
  --cream:#0f1923;--cream2:#1a2535;--cream3:#243040;
  --white:#1e2d3d;--border:#2a3a4e;--border2:#243040;
  --ink:#e8f0f8;--muted:#7a99b8;--dim:#4a6580;
  --sh:0 2px 12px rgba(0,0,0,.3);--sh2:0 8px 36px rgba(0,0,0,.45);
}
body.dark-mode .topbar{background:#131f2e;border-bottom-color:#1e2d3d;}
body.dark-mode .biz-card,body.dark-mode .prod-item,body.dark-mode .ord-row,
body.dark-mode .ord-card,body.dark-mode .pm-card,body.dark-mode .job-card,
body.dark-mode .active-del,body.dark-mode .sub-card,body.dark-mode .as,
body.dark-mode .adm-tbl,body.dark-mode .hw,body.dark-mode .rs{background:#1e2d3d;border-color:#2a3a4e;}
body.dark-mode .finp{background:#243040;border-color:#2a3a4e;color:#e8f0f8;}
body.dark-mode .finp:focus{background:#1e2d3d;border-color:var(--g3);}
body.dark-mode .auth-card,body.dark-mode .modal-box,body.dark-mode .receipt-box,
body.dark-mode .sp-panel,body.dark-mode .rider-hdr{background:#1a2535;}
body.dark-mode .cpill,body.dark-mode .sort-btn,body.dark-mode .back-btn,
body.dark-mode .btn-out,body.dark-mode .tb-tab{background:#1e2d3d;border-color:#2a3a4e;color:#7a99b8;}
body.dark-mode .tb-tab.act{background:var(--g1);color:white;}
body.dark-mode .tb-tab:hover{background:#243040;color:#e8f0f8;}
body.dark-mode .sbox{background:#1e2d3d;border-color:#2a3a4e;}
body.dark-mode .sbox input{color:#e8f0f8;}
body.dark-mode .user-chip{background:#243040;}
body.dark-mode .tmd-panel{background:#131f2e;}
body.dark-mode .tmd-btn{color:#e8f0f8;}
body.dark-mode .tmd-btn.act{background:var(--g1);}
body.dark-mode .biz-bot-nav,body.dark-mode .bottom-nav{background:#131f2e;border-top-color:#1e2d3d;}
body.dark-mode .biztab{color:#7a99b8;}
body.dark-mode .biztab.act{color:var(--lime);border-bottom-color:var(--lime);}
body.dark-mode .tbl-row:hover{background:#243040;}
body.dark-mode .rider-avail-card,body.dark-mode .rider-panel{background:#243040;border-color:#2a3a4e;}
body.dark-mode .rcpt-items{background:#243040;}
body.dark-mode .gps-box{background:#243040;border-color:#2a3a4e;}
body.dark-mode select.finp option{background:#1a2535;}
body.dark-mode .cat-mini{border-color:#2a3a4e;}
body.dark-mode .cat-mini.sel,body.dark-mode .role-opt.sel{background:#243040;}
body.dark-mode .role-opt{border-color:#2a3a4e;}
body.dark-mode .img-upload-area{background:#243040;border-color:#2a3a4e;}
body.dark-mode .bc-body,body.dark-mode .pm-body,body.dark-mode .pi-body{background:#1e2d3d;}
body.dark-mode .bdp-hero{background:linear-gradient(135deg,#0d1f2d,#1a3040);}
body.dark-mode .biz-hdr{background:linear-gradient(135deg,#0d1f2d,#1a3040);}
body.dark-mode .c-hero{background:linear-gradient(135deg,#0d1f2d,#1a3040);}`;

// ══════════════════════════════════════════════════════════════════════════════
// TOAST HOOK
// ══════════════════════════════════════════════════════════════════════════════
function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(t => [...t, {id,msg,type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  return {toasts, toast};
}
function Toasts({toasts}) {
  return <div className="toast-stack">{toasts.map(t=><div key={t.id} className={`toast ${t.type==="error"?"err":t.type==="warn"?"warn":""}`}>{t.type==="success"?"✅ ":t.type==="error"?"❌ ":"⚠️ "}{t.msg}</div>)}</div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE UPLOAD COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
function ImageUpload({ value, onChange, path, label = "Upload Image", hint = "JPG, PNG, WebP — max 5MB", previewHeight = 140 }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("File too large — max 5MB."); return; }
    setUploading(true);
    try {
      const url = await uploadImage(file, path);
      onChange(url);
    } catch(e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && <div style={{fontSize:10,fontWeight:800,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:5}}>{label}</div>}
      <div
        className={`img-upload-area ${value?"has-img":""}`}
        style={{minHeight: uploading ? 80 : (value ? previewHeight+20 : 110)}}
        onClick={()=>!uploading && inputRef.current?.click()}
      >
        {uploading ? (
          <div className="img-uploading"><div className="ld-spin" style={{width:22,height:22,borderWidth:2}}/> Uploading…</div>
        ) : value ? (
          <>
            <img src={value} className="img-upload-preview" style={{height:previewHeight}} alt="preview"/>
            <div className="img-upload-overlay">
              <span style={{color:"white",fontSize:13,fontWeight:700}}>📷 Change Image</span>
            </div>
          </>
        ) : (
          <div className="img-upload-placeholder">
            <span className="iup-ico">📷</span>
            <span className="iup-txt">{label}</span>
            <span className="iup-hint">{hint}</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// REPORTS & MESSAGES — Firestore helpers
// ══════════════════════════════════════════════════════════════════════════════

async function submitReport(bizId, bizName, customerId, customerName, reason, details) {
  const db = _db();
  await addDoc(collection(db, "reports"), {
    bizId, bizName, customerId, customerName,
    reason, details: details||"",
    status: "open",
    adminReply: "",
    createdAt: fts(), timestamp: Date.now(),
  });
}

async function submitMessage(fromUid, fromName, fromRole, subject, body) {
  const db = _db();
  await addDoc(collection(db, "devMessages"), {
    fromUid, fromName, fromRole, subject, body,
    status: "unread",
    adminReply: "",
    createdAt: fts(), timestamp: Date.now(),
  });
}

function listenDevMessages(callback) {
  const db = _db();
  const q = fq(collection(db, "devMessages"), fo("timestamp", "desc"));
  return fon(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function listenUserMessages(uid, callback) {
  const db = _db();
  const q = fq(collection(db, "devMessages"), fw("fromUid", "==", uid), fo("timestamp", "desc"));
  return fon(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function listenReports(callback) {
  const db = _db();
  const q = fq(collection(db, "reports"), fo("timestamp", "desc"));
  return fon(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

async function replyToMessage(msgId, reply) {
  const db = _db();
  await fud(fdoc(db, "devMessages", msgId), { adminReply: reply, status: "replied", repliedAt: fts() });
}

async function replyToReport(reportId, reply, status="resolved") {
  const db = _db();
  await fud(fdoc(db, "reports", reportId), { adminReply: reply, status, reviewedAt: fts() });
}

async function updateBizStatusAdmin(bizId, status) {
  const db = _db();
  await fud(fdoc(db, "businesses", bizId), { status, statusUpdatedAt: fts() });
}

// ── REPORT BUSINESS MODAL ─────────────────────────────────────────────────────
const REPORT_REASONS = [
  "Item not delivered","Wrong item delivered","Fake/Scam business",
  "Rude or abusive behaviour","Price fraud","Poor quality product",
  "Unsafe food/product","Other",
];

function ReportBusinessModal({ biz, user, profile, onClose }) {
  const [reason,  setReason]  = React.useState("");
  const [details, setDetails] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent,    setSent]    = React.useState(false);

  async function submit() {
    if (!reason) { alert("Please select a reason."); return; }
    if (!user)   { alert("Please sign in to report a business."); return; }
    setLoading(true);
    try {
      await submitReport(biz.id, biz.name, user.uid, profile?.name || "Anonymous", reason, details);
      setSent(true);
    } catch(e) { alert("Failed: " + e.message); }
    finally { setLoading(false); }
  }

  if (sent) return (
    <div style={RPT_OV} onClick={onClose}>
      <div style={RPT_BOX} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <h3 style={{margin:"0 0 8px",color:"#16a34a"}}>Report Submitted</h3>
          <p style={{color:"#555",fontSize:14,margin:"0 0 20px"}}>Thank you. The developer will review your report within 24 hours.</p>
          <button onClick={onClose} style={RPT_BTN}>Close</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={RPT_OV} onClick={onClose}>
      <div style={RPT_BOX} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:800,color:"#ef4444"}}>🚨 Report Business</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#999"}}>✕</button>
        </div>
        <p style={{fontSize:13,color:"#666",margin:"0 0 16px"}}>Reporting: <strong>{biz.name}</strong></p>
        <label style={RPT_LBL}>Reason *</label>
        <select value={reason} onChange={e=>setReason(e.target.value)} style={RPT_INP}>
          <option value="">— Select a reason —</option>
          {REPORT_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{...RPT_LBL,marginTop:12}}>Additional Details (optional)</label>
        <textarea value={details} onChange={e=>setDetails(e.target.value)} rows={4}
          placeholder="Describe what happened..."
          style={{...RPT_INP,resize:"vertical",minHeight:80,fontFamily:"inherit"}}/>
        <button onClick={submit} disabled={loading} style={{...RPT_BTN,background:"#ef4444",marginTop:16,opacity:loading?0.7:1}}>
          {loading?"Submitting…":"Submit Report"}
        </button>
      </div>
    </div>
  );
}

function ContactDevModal({ user, profile, onClose }) {
  const [subject, setSubject] = React.useState("");
  const [body,    setBody]    = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent,    setSent]    = React.useState(false);

  async function submit() {
    if (!subject.trim() || !body.trim()) { alert("Please fill in all fields."); return; }
    if (!user) { alert("Please sign in first."); return; }
    setLoading(true);
    try {
      await submitMessage(user.uid, profile?.name||"User", profile?.role||"customer", subject, body);
      setSent(true);
    } catch(e) { alert("Failed: " + e.message); }
    finally { setLoading(false); }
  }

  if (sent) return (
    <div style={RPT_OV} onClick={onClose}>
      <div style={RPT_BOX} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:48,marginBottom:12}}>📨</div>
          <h3 style={{margin:"0 0 8px",color:"#4f46e5"}}>Message Sent!</h3>
          <p style={{color:"#555",fontSize:14,margin:"0 0 20px"}}>The developer will reply to your message. Check back here for a reply.</p>
          <button onClick={onClose} style={RPT_BTN}>Close</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={RPT_OV} onClick={onClose}>
      <div style={RPT_BOX} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:800,color:"#4f46e5"}}>📬 Contact Developer</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#999"}}>✕</button>
        </div>
        <label style={RPT_LBL}>Subject *</label>
        <input value={subject} onChange={e=>setSubject(e.target.value)} style={RPT_INP} placeholder="What is your message about?"/>
        <label style={{...RPT_LBL,marginTop:12}}>Message *</label>
        <textarea value={body} onChange={e=>setBody(e.target.value)} rows={5}
          placeholder="Type your message here..."
          style={{...RPT_INP,resize:"vertical",minHeight:100,fontFamily:"inherit"}}/>
        <button onClick={submit} disabled={loading} style={{...RPT_BTN,marginTop:16,opacity:loading?0.7:1}}>
          {loading?"Sending…":"Send Message"}
        </button>
      </div>
    </div>
  );
}

const RPT_OV  = {position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16};
const RPT_BOX = {background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.22)",padding:"24px 22px",position:"relative"};
const RPT_LBL = {display:"block",fontWeight:600,fontSize:13,color:"#374151",marginBottom:6};
const RPT_INP = {width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #ddd",fontSize:15,outline:"none",boxSizing:"border-box",background:"#fafafa"};
const RPT_BTN = {width:"100%",padding:12,borderRadius:10,border:"none",background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"};

// RECEIPT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
function Receipt({ order, biz, onClose }) {
  if (!order || !biz) return null;
  const sc = ORDER_STATUS[order.status] || ORDER_STATUS.pending;

  function doPrint() {
    window.print();
  }

  return (
    <div className="receipt-ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="receipt-box">
        {/* Header with business branding */}
        <div className="rcpt-head">
          {biz.logo
            ? <img src={biz.logo} className="rcpt-logo" alt="logo"/>
            : <div className="rcpt-logo-placeholder">{catEmo(biz.category)}</div>
          }
          <div className="rcpt-biz-name">{biz.name}</div>
          <div className="rcpt-biz-sub">
            {biz.region} · {biz.category}
            {biz.contactPhone && <> · {biz.contactPhone}</>}
          </div>
        </div>

        <div className="rcpt-body">
          {/* Order ID */}
          <div style={{textAlign:"center",marginBottom:4}}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1}}>Order Receipt</div>
          </div>
          <div className="rcpt-id">{order.orderId || order.id}</div>
          <div className="rcpt-status">
            <span className="sbadge" style={{background:sc.bg,color:sc.color}}>{sc.label}</span>
          </div>

          <hr className="rcpt-divider"/>

          {/* Customer info */}
          <div className="rcpt-row">
            <span style={{color:"var(--muted)"}}>Customer</span>
            <span style={{fontWeight:700}}>{order.customerName}</span>
          </div>
          <div className="rcpt-row">
            <span style={{color:"var(--muted)"}}>Phone</span>
            <span>{order.customerPhone}</span>
          </div>
          <div className="rcpt-row">
            <span style={{color:"var(--muted)"}}>Delivery Address</span>
            <span style={{textAlign:"right",maxWidth:"55%"}}>{order.address}</span>
          </div>
          <div className="rcpt-row">
            <span style={{color:"var(--muted)"}}>Payment</span>
            <span>{PAYMENTS.find(p=>p.v===order.payment)?.label || order.payment}</span>
          </div>
          <div className="rcpt-row">
            <span style={{color:"var(--muted)"}}>Date</span>
            <span>{dtstr(order.createdAt || order.timestamp)}</span>
          </div>

          <hr className="rcpt-divider"/>

          {/* Items */}
          <div style={{fontWeight:800,fontSize:12,marginBottom:8,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>Items Ordered</div>
          <div className="rcpt-items">
            {(order.items||[]).map((item,i)=>(
              <div key={i} className="rcpt-item">
                <span><strong>{item.emoji||"📦"} {item.name}</strong> × {item.qty}</span>
                <span>{fmt(item.price * item.qty)}</span>
              </div>
            ))}
          </div>

          <div className="rcpt-row bold">
            <span>Total</span>
            <span style={{color:"var(--amber2)"}}>{fmt(order.total)}</span>
          </div>

          {order.riderName && (
            <div className="rcpt-row" style={{marginTop:8}}>
              <span style={{color:"var(--muted)"}}>Rider</span>
              <span>🏍️ {order.riderName} · {order.riderPhone}</span>
            </div>
          )}

          <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"var(--dim)"}}>
            Thank you for shopping with <strong>{biz.name}</strong>!<br/>
            Powered by AMTECH SOFTWARE SOLUTIONS · LocalBiz GH 🇬🇭
          </div>

          <div className="rcpt-actions">
            <button className="btn-print" onClick={doPrint}>🖨️ Print</button>
            <button className="btn-done" onClick={onClose}>Done ✓</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════════════════════════════════════════════
function AuthModal({mode, defaultRole, onClose, toast, onAdminAccess}) {
  const [isSu, setIsSu]       = useState(mode==="signup");
  const [role, setRole]       = useState(defaultRole||"customer");
  const [err, setErr]         = useState("");
  const [loading, setL]       = useState(false);
  const [logoFile, setLogoFile]   = useState(null);   // business logo File
  const [logoPreview, setLogoPreview] = useState(""); // object URL for preview
  const [photoFile, setPhotoFile] = useState(null);   // rider photo File
  const [photoPreview, setPhotoPreview] = useState("");
  const logoInputRef  = useRef();
  const photoInputRef = useRef();
  const [form, setForm] = useState({name:"",username:"",email:"",phone:"",password:"",region:"Greater Accra",town:"",businessName:"",category:"",vehicle:"Motorbike 🏍️",licenseNo:""});
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showFullDisclaimer, setShowFullDisclaimer] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  function pickLogo(file) {
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }
  function pickPhoto(file) {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit() {
    setErr(""); setL(true);
    try {
      if(isSu) {
        if(!form.name||!form.username||!form.email||!form.password||!form.phone) throw new Error("Please fill in all required fields.");
        if(form.username.length<3) throw new Error("Username must be at least 3 characters.");
        if(/[^a-zA-Z0-9_.]/.test(form.username)) throw new Error("Username can only contain letters, numbers, _ and .");
        if(form.password.length<6) throw new Error("Password must be at least 6 characters.");
        if(role==="business"&&!form.businessName) throw new Error("Please enter your business name.");
        if((role==="business"||role==="rider")&&!disclaimerAccepted) throw new Error("You must read and accept the LocalBiz GH Terms & Disclaimer to create an account.");
        await registerUser(form.email,form.password,form.name,form.username,role,form.region,form.phone,{
          businessName:form.businessName, category:form.category==="Other (specify)"?(form.customCategory||"Other"):form.category||"Food & Restaurant",
          vehicle:form.vehicle, licenseNo:form.licenseNo,
          town: form.town,
          logoFile:  role==="business" ? logoFile  : null,
          photoFile: role==="rider"    ? photoFile : null,
        });
        toast(`Welcome to LocalBiz, ${form.name.split(" ")[0]}! 🎉`);
      } else {
        if(!form.username||!form.password) throw new Error("Please enter your username/email and password.");
        if(form.username===ADMIN_CREDS.username && form.password===ADMIN_CREDS.password){
          setL(false); onClose(); if(onAdminAccess) onAdminAccess(); return;
        }
        await loginUser(form.username, form.password);
        toast("Welcome back!");
      }
      onClose();
    } catch(e) {
      const msg = e.code==="auth/email-already-in-use"?"An account with this email already exists."
        :e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-credential"?"Incorrect username/email or password."
        :e.message||"Something went wrong.";
      setErr(msg);
    } finally {setL(false);}
  }

  return (
    <div className="auth-ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="auth-card">
        <div className="auth-top">
          <div>
            <div className="auth-brand">Local<em>Biz</em></div>
            <div className="auth-title">{isSu?"Create your account":"Welcome back"}</div>
            <div className="auth-sub">{isSu?"Join LocalBiz GH — free to start":"Sign in with your username or email"}</div>
          </div>
          <button className="auth-close" onClick={onClose}>✕</button>
        </div>
        <div className="auth-body">
          {isSu&&<>
            <p style={{fontSize:10,fontWeight:800,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:9}}>I am a…</p>
            <div className="role-grid">
              {[{r:"customer",ico:"🛍️",lab:"Customer",sub:"Shop & order"},
                {r:"business",ico:"🏪",lab:"Business",sub:"Sell online"},
                {r:"rider",   ico:"🏍️",lab:"Rider",   sub:"Deliver & earn"}].map(({r,ico,lab,sub})=>(
                <div key={r} className={`role-opt ${role===r?"sel":""}`} onClick={()=>setRole(r)}>
                  <span className="ro-ico">{ico}</span>
                  <div className="ro-lab">{lab}</div>
                  <div className="ro-sub">{sub}</div>
                </div>
              ))}
            </div>
          </>}
          {err&&<div className="auth-err">⚠️ {err}</div>}
          {isSu&&role==="business"&&<div className="fgrp"><label>Business Name *</label><input className="finp" placeholder="e.g. Mama Akua's Kitchen" value={form.businessName} onChange={e=>set("businessName",e.target.value)}/></div>}
          {isSu?(
            <>
              <div className="frow2">
                <div className="fgrp"><label>Full Name *</label><input className="finp" placeholder="Your full name" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
                <div className="fgrp">
                  <label>Username *</label>
                  <input className="finp" placeholder="e.g. kofi_ama" value={form.username} onChange={e=>set("username",e.target.value.replace(/\s/g,""))}/>
                  <div className="auth-hint">Letters, numbers, _ and . only</div>
                </div>
                <div className="fgrp"><label>Email *</label><input className="finp" type="email" placeholder="you@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
                <div className="fgrp"><label>Phone *</label><input className="finp" placeholder="024 000 0000" value={form.phone} onChange={e=>set("phone",e.target.value)}/></div>
                <div className="fgrp"><label>Region *</label>
                  <select className="finp" value={form.region} onChange={e=>{set("region",e.target.value);set("town","");}}>
                    <option value="">— Select Region —</option>
                    {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="fgrp"><label>District / Town *</label>
                  <select className="finp" value={form.town} onChange={e=>set("town",e.target.value)}>
                    <option value="">— Select District —</option>
                    {(GHANA_TOWNS[form.region]||[]).map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="auth-hint">{form.region?`Districts in ${form.region}`:"Select a region first"}</div>
                </div>
              </div>
              {role==="business"&&<>
                <div className="fgrp"><label>Business Category</label><div className="cat-mini-grid">{BIZ_CATEGORIES.map(c=><div key={c.label} className={`cat-mini ${form.category===c.label?"sel":""}`} onClick={()=>set("category",c.label)}><span className="cat-mini-ico">{c.emoji}</span><div className="cat-mini-lab">{c.label}</div></div>)}</div>
                {form.category==="Other (specify)"&&<input className="finp" style={{marginTop:8}} placeholder="Type your business category" value={form.customCategory||""} onChange={e=>set("customCategory",e.target.value)}/>}
                </div>
                <div className="fgrp">
                  <label style={{display:"flex",alignItems:"center",gap:6}}>🖼️ Business Logo <span style={{fontSize:9,fontWeight:500,textTransform:"none",letterSpacing:0,color:"var(--dim)"}}>— shows on your dashboard, shop page &amp; receipts</span></label>
                  <div className="logo-upload-row">
                    <div className="logo-upload-preview" onClick={()=>logoInputRef.current?.click()}>
                      {logoPreview
                        ? <img src={logoPreview} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <span style={{fontSize:32}}>{catEmo(form.category||"Other")}</span>
                      }
                      <div className="logo-upload-overlay">📷</div>
                    </div>
                    <div className="logo-upload-info">
                      <button type="button" className="btn-upload-logo" onClick={()=>logoInputRef.current?.click()}>
                        {logoPreview ? "✏️ Change Logo" : "📷 Upload Logo"}
                      </button>
                      <div style={{fontSize:11,color:"var(--dim)",marginTop:5,lineHeight:1.5}}>JPG or PNG recommended<br/>Square image, 400×400px ideal</div>
                      {logoPreview&&<div style={{fontSize:11,color:"var(--lime3)",fontWeight:700,marginTop:4}}>✓ Logo ready to upload</div>}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{display:"none"}} onChange={e=>pickLogo(e.target.files[0])}/>
                  </div>
                </div>
              </>}
              {role==="rider"&&<>
                <div className="frow2">
                  <div className="fgrp"><label>Vehicle *</label><select className="finp" value={form.vehicle} onChange={e=>set("vehicle",e.target.value)}>{VEHICLES.map(v=><option key={v}>{v}</option>)}</select></div>
                  <div className="fgrp"><label>Licence No.</label><input className="finp" placeholder="Optional" value={form.licenseNo} onChange={e=>set("licenseNo",e.target.value)}/></div>
                </div>
                <div className="fgrp">
                  <label style={{display:"flex",alignItems:"center",gap:6}}>🏍️ Rider Profile Photo <span style={{fontSize:9,fontWeight:500,textTransform:"none",letterSpacing:0,color:"var(--dim)"}}>— shows on your rider dashboard</span></label>
                  <div className="logo-upload-row">
                    <div className="logo-upload-preview rider-photo-preview" onClick={()=>photoInputRef.current?.click()}>
                      {photoPreview
                        ? <img src={photoPreview} alt="photo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <span style={{fontSize:28}}>🏍️</span>
                      }
                      <div className="logo-upload-overlay">📷</div>
                    </div>
                    <div className="logo-upload-info">
                      <button type="button" className="btn-upload-logo" style={{borderColor:"var(--coral)",color:"var(--coral)"}} onClick={()=>photoInputRef.current?.click()}>
                        {photoPreview ? "✏️ Change Photo" : "📷 Upload Photo"}
                      </button>
                      <div style={{fontSize:11,color:"var(--dim)",marginTop:5,lineHeight:1.5}}>JPG or PNG · max 5MB<br/>Clear face photo recommended</div>
                      {photoPreview&&<div style={{fontSize:11,color:"var(--lime3)",fontWeight:700,marginTop:4}}>✓ Photo ready</div>}
                    </div>
                    <input ref={photoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{display:"none"}} onChange={e=>pickPhoto(e.target.files[0])}/>
                  </div>
                </div>
              </>}
            </>
          ):(
            <div className="fgrp">
              <label>Username or Email *</label>
              <input className="finp" placeholder="Enter your username or email" value={form.username} onChange={e=>set("username",e.target.value)} autoComplete="username"/>
            </div>
          )}
          <div className="fgrp" style={{marginBottom:4}}><label>Password *</label><input className="finp" type="password" placeholder={isSu?"Min 6 characters":"Your password"} onChange={e=>set("password",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
          {!isSu&&<div style={{textAlign:"right",marginBottom:8,marginTop:-2}}><ForgotPasswordModal /></div>}

          {/* ── DISCLAIMER for Business & Rider only ── */}
          {isSu&&(role==="business"||role==="rider")&&(
            <div style={{margin:"14px 0",borderRadius:14,overflow:"hidden",border:"2px solid rgba(239,68,68,.35)",background:"rgba(239,68,68,.04)"}}>
              {/* Header */}
              <div style={{background:"rgba(239,68,68,.1)",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22,flexShrink:0}}>⚠️</span>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:"#b91c1c"}}>LocalBiz GH — Merchant & Rider Disclaimer</div>
                  <div style={{fontSize:11,color:"#ef4444",marginTop:1}}>Please read carefully before creating your account</div>
                </div>
              </div>
              {/* Disclaimer body */}
              <div style={{padding:"14px 16px",fontSize:13,color:"#374151",lineHeight:1.75}}>
                <p style={{margin:"0 0 10px",fontWeight:700,color:"#b91c1c"}}>By creating a {role==="business"?"Business":"Rider"} account on LocalBiz GH, you agree to the following:</p>
                <ol style={{paddingLeft:18,margin:"0 0 12px"}}>
                  <li style={{marginBottom:8}}><strong>Honest Dealings:</strong> You must conduct all transactions honestly and transparently. Misrepresentation of products, services, pricing, or delivery terms is strictly prohibited.</li>
                  <li style={{marginBottom:8}}><strong>No Scams or Fraud:</strong> Any form of scam, theft, fraudulent activity, or deception against customers will result in <strong>immediate account suspension</strong>.</li>
                  <li style={{marginBottom:8}}><strong>Customer Refunds:</strong> If found culpable of delivering wrong, substandard, or no goods/services, you are obligated to <strong>refund the affected customer in full</strong>.</li>
                  <li style={{marginBottom:8}}><strong>Report & Investigation:</strong> Customers have the right to report your {role==="business"?"shop":"rider profile"} to the LocalBiz GH developer team. All reports are reviewed and investigated seriously.</li>
                  <li style={{marginBottom:8}}><strong>Disciplinary Actions:</strong> Depending on the severity of a verified complaint, LocalBiz GH reserves the right to:
                    <ul style={{paddingLeft:16,marginTop:4}}>
                      <li>⏸️ <strong>Suspend</strong> your account temporarily</li>
                      <li>🚫 <strong>Revoke</strong> your account indefinitely</li>
                      <li>🗑️ <strong>Permanently delete</strong> your {role==="business"?"shop":"profile"} from the platform</li>
                    </ul>
                  </li>
                  {role==="business"&&<li style={{marginBottom:8}}><strong>Business Integrity:</strong> Your shop represents the LocalBiz GH marketplace. Poor service damages the entire platform's reputation. Maintain quality, respond to orders promptly, and treat every customer with respect.</li>}
                  {role==="rider"&&<li style={{marginBottom:8}}><strong>Safe Delivery:</strong> You are responsible for the safe and timely delivery of all orders. Tampering with, stealing, or mishandling a customer's order is a criminal offence and will be reported to the appropriate authorities.</li>}
                  <li><strong>Zero Tolerance:</strong> LocalBiz GH has a zero-tolerance policy for dishonest behaviour. Protecting our customers is our top priority.</li>
                </ol>
                <button onClick={()=>setShowFullDisclaimer(v=>!v)} style={{background:"none",border:"none",color:"#4f46e5",fontSize:12,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}}>
                  {showFullDisclaimer?"Hide full terms":"Read full platform terms →"}
                </button>
                {showFullDisclaimer&&(
                  <div style={{marginTop:10,padding:"12px 14px",background:"rgba(79,70,229,.05)",borderRadius:10,border:"1px solid rgba(79,70,229,.15)",fontSize:12,color:"#4b5563",lineHeight:1.7}}>
                    <strong>Full Platform Terms (Summary):</strong><br/>
                    LocalBiz GH is a product of AMTECH SOFTWARE SOLUTIONS. By using this platform as a merchant or rider, you acknowledge that:
                    (1) All data submitted is accurate and verifiable;
                    (2) You will not use the platform for money laundering, illegal trade, or any activity that violates Ghana's laws;
                    (3) Disputes between merchants/riders and customers will be mediated by LocalBiz GH developer team whose decision is final;
                    (4) LocalBiz GH reserves the right to update these terms at any time with notice on the platform;
                    (5) Continued use of the platform constitutes acceptance of updated terms.
                    For questions contact: <strong>AMTECH SOFTWARE SOLUTIONS</strong> via the platform's Contact Developer feature.
                  </div>
                )}
              </div>
              {/* Checkbox */}
              <div style={{padding:"12px 16px",borderTop:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.06)"}}>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
                  <input
                    type="checkbox"
                    checked={disclaimerAccepted}
                    onChange={e=>setDisclaimerAccepted(e.target.checked)}
                    style={{marginTop:2,width:18,height:18,accentColor:"#16a34a",flexShrink:0,cursor:"pointer"}}
                  />
                  <span style={{fontSize:13,fontWeight:600,color:"#1f2937",lineHeight:1.5}}>
                    I have read and understood the above disclaimer. I agree to conduct all activities on LocalBiz GH honestly and accept full responsibility for my {role==="business"?"business":"delivery"} conduct. I understand that violations may result in suspension, revocation, or permanent deletion of my account.
                  </span>
                </label>
              </div>
            </div>
          )}

          <button className="btn-auth" onClick={submit} disabled={loading||(isSu&&(role==="business"||role==="rider")&&!disclaimerAccepted)}
            style={{opacity:(isSu&&(role==="business"||role==="rider")&&!disclaimerAccepted)?0.5:1,transition:"opacity .2s"}}>
            {loading?(isSu?"Creating account…":"Signing in…"):(isSu?"Create Account →":"Sign In →")}
          </button>
          <div className="auth-sw">{isSu?"Already have an account?":"Don't have an account?"}<button onClick={()=>{setIsSu(!isSu);setErr("");}}>  {isSu?"Sign in":"Create account"}</button></div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════════════════════════════
function Landing({onAuth, onAdminDirect}) {
  const [showDevBox, setShowDevBox] = useState(false);
  const [devU, setDevU]             = useState("");
  const [devP, setDevP]             = useState("");
  const [devBoxErr, setDevBoxErr]   = useState("");
  const [devLoading, setDevLoading] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [allUsers, setAllUsers]     = useState([]);

  useEffect(()=>{ if(adminUnlocked){ const u1=listenBusinesses(setBusinesses); const u2=listenAllUsers(setAllUsers); return()=>{u1();u2();} } },[adminUnlocked]);

  function tryDevLogin() {
    setDevLoading(true);
    setTimeout(()=>{
      if(devU===ADMIN_CREDS.username && devP===ADMIN_CREDS.password){
        setShowDevBox(false); setAdminUnlocked(true); onAdminDirect();
      } else { setDevBoxErr("Invalid credentials."); }
      setDevLoading(false);
    }, 700);
  }

  const roles=[
    {r:"customer",ico:"🛍️",title:"Shop Local",desc:"Browse and order from businesses in your region. Food, fashion, electronics and more — delivered.",link:"Start Shopping →",color:"var(--lime)"},
    {r:"business",ico:"🏪",title:"Sell Online",desc:"Upload your products and logo, confirm orders, and connect with verified dispatch riders across Ghana.",link:"List My Business →",color:"var(--amber)"},
    {r:"rider",   ico:"🏍️",title:"Earn Delivering",desc:"Sign up as a dispatch rider. Browse jobs in your region, get GPS directions to businesses, earn every day.",link:"Become a Rider →",color:"var(--coral)"},
  ];

  return (
    <div className="land">
      <div className="land-grain"/>
      <nav className="land-nav">
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}><div className="land-logo">Local<em>Biz</em><sup>GH</sup></div><div style={{fontSize:9,color:"rgba(255,255,255,.35)",fontFamily:"var(--fb)",fontWeight:700,letterSpacing:1,marginTop:2}}>POWERED BY AMTECH SOFTWARE SOLUTIONS</div></div>
        <div className="nav-btns">
          <button className="dev-access-btn" onClick={()=>setShowDevBox(v=>!v)} title="Admin">⚙️</button>
          <button className="btn-ghost" onClick={()=>onAuth("signin")}>Sign In</button>
          <button className="btn-lime"  onClick={()=>onAuth("signup")}>Get Started →</button>
        </div>
      </nav>

      {showDevBox&&(
        <div style={{position:"fixed",top:68,right:18,zIndex:400,background:"#0d1117",border:"1.5px solid rgba(245,158,11,.4)",borderRadius:20,padding:24,width:310,boxShadow:"0 24px 64px rgba(0,0,0,.7)",animation:"slideUp .22s cubic-bezier(.34,1.56,.64,1)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div>
              <div style={{fontFamily:"var(--ff)",fontSize:18,fontWeight:900,color:"var(--amber)"}}>⚡ Admin Login</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.32)",marginTop:2}}>Authorised access only</div>
            </div>
            <button onClick={()=>{setShowDevBox(false);setDevBoxErr("");}} style={{background:"rgba(255,255,255,.07)",border:"none",color:"rgba(255,255,255,.45)",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {devBoxErr&&<div style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",borderRadius:9,padding:"9px 12px",color:"#fca5a5",fontSize:12,marginBottom:12}}>❌ {devBoxErr}</div>}
          <input style={{width:"100%",padding:"11px 13px",borderRadius:12,border:"1.5px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.07)",color:"white",fontFamily:"var(--fb)",fontSize:14,outline:"none",marginBottom:10}} placeholder="Username" value={devU} onChange={e=>{setDevU(e.target.value);setDevBoxErr("");}}/>
          <input style={{width:"100%",padding:"11px 13px",borderRadius:12,border:"1.5px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.07)",color:"white",fontFamily:"var(--fb)",fontSize:14,outline:"none",marginBottom:16}} type="password" placeholder="••••••••••" onChange={e=>{setDevP(e.target.value);setDevBoxErr("");}} onKeyDown={e=>e.key==="Enter"&&tryDevLogin()}/>
          <button onClick={tryDevLogin} disabled={devLoading} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#1c1209",fontFamily:"var(--fb)",fontSize:14,fontWeight:800,cursor:devLoading?"not-allowed":"pointer",opacity:devLoading?.7:1}}>
            {devLoading?"Authenticating…":"Access Dashboard →"}
          </button>
        </div>
      )}

      <section className="l-hero">
        <div className="l-eyebrow">🇬🇭 Ghana's National Commerce Platform</div>
        <h1 className="l-h1">Where <em>local</em> business<br/>meets <span>every customer</span></h1>
        <p className="l-sub">LocalBiz connects businesses, customers, and riders across all 16 regions of Ghana. Order local. Deliver local. <em>Win local.</em> <span style={{display:"block",marginTop:8,fontSize:12,opacity:.5,fontFamily:"var(--fb)",fontWeight:700,letterSpacing:1}}>POWERED BY AMTECH SOFTWARE SOLUTIONS</span></p>
        <div className="l-ctas">
          <button className="btn-hero"  onClick={()=>onAuth("signup")}>Join Free — Get Started</button>
          <button className="btn-hero2" onClick={()=>onAuth("signin")}>Sign In</button>
        </div>
      </section>

      <div className="l-stats">
        {[["16","Regions"],["3","User Roles"],["GH₵0","To Start"],["Real-time","Firebase"]].map(([n,l])=>(
          <div key={l} className="lst"><div className="lst-n">{n}</div><div className="lst-l">{l}</div></div>
        ))}
      </div>

      <div className="l-roles">
        {roles.map(({r,ico,title,desc,link,color})=>(
          <div key={r} className="rc" onClick={()=>onAuth("signup",r)}>
            <span className="rc-ico">{ico}</span>
            <div className="rc-title">{title}</div>
            <div className="rc-desc">{desc}</div>
            <div className="rc-link" style={{color}}>{link}</div>
          </div>
        ))}
      </div>

      <section className="l-how">
        <div className="how-inner">
          <div className="l-lbl">How It Works</div>
          <h2 className="l-sh">From signup to doorstep<br/>in four simple steps</h2>
          <div className="how-grid">
            {[{ico:"📝",t:"Sign Up Free",d:"Create your account. Upload your business logo and products with real photos."},
              {ico:"🔍",t:"Discover",   d:"Browse businesses by region. See product images. Add to cart instantly."},
              {ico:"🛒",t:"Order",      d:"Customers order and get a receipt. Merchants confirm and assign a nearby rider."},
              {ico:"🚀",t:"Delivered!", d:"Rider gets GPS directions to the business. Everyone tracks in real-time."},
            ].map(s=><div key={s.t} className="hw"><span className="hw-ico">{s.ico}</span><div className="hw-t">{s.t}</div><div className="hw-d">{s.d}</div></div>)}
          </div>
        </div>
      </section>

      <section className="l-admin-panel">
        <div className="lap-inner">
          <div style={{textAlign:"center",marginBottom:40}}>
            <div className="l-lbl" style={{color:"rgba(245,158,11,.6)"}}>Pricing</div>
            <h2 style={{fontFamily:"var(--ff)",fontSize:"clamp(24px,4vw,40px)",color:"white",marginBottom:10}}>Start free. Grow with us.</h2>
            <p style={{color:"rgba(255,255,255,.38)",fontSize:14,maxWidth:480,margin:"0 auto"}}>Every business gets <strong style={{color:"var(--lime)"}}>1 month free</strong> — full access, no credit card required.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,maxWidth:960,margin:"0 auto"}}>
            {[{key:"free",ico:"🎁",badge:null},{key:"monthly",ico:"📅",badge:null},{key:"quarter",ico:"📦",badge:"SAVE GH₵50",badgeColor:"#3b9eff"},{key:"biannual",ico:"⚡",badge:"POPULAR",badgeColor:"#d97706"},{key:"annual",ico:"👑",badge:"BEST VALUE",badgeColor:"#16a34a"}].map(({key,ico,badge,badgeColor})=>{
              const p=PLANS[key];
              return (
                <div key={key} style={{background:key==="biannual"?"rgba(245,158,11,.07)":"rgba(255,255,255,.04)",border:`1.5px solid ${key==="biannual"?"rgba(245,158,11,.35)":"rgba(255,255,255,.08)"}`,borderRadius:20,padding:"24px 18px",textAlign:"center",position:"relative",transition:"transform .18s"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-4px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                  {badge&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:badgeColor,color:"white",fontSize:9,fontWeight:900,padding:"3px 11px",borderRadius:20,whiteSpace:"nowrap"}}>{badge}</div>}
                  <div style={{fontSize:26,marginBottom:8}}>{ico}</div>
                  <div style={{fontFamily:"var(--ff)",fontSize:17,fontWeight:900,color:p.color,marginBottom:4}}>{p.label}</div>
                  <div style={{fontFamily:"var(--ff)",fontSize:30,fontWeight:900,color:"white",marginBottom:2}}>{p.price===0?"Free":"GH₵"+p.price.toLocaleString()}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:4}}>{p.price===0?"1 month · no card":p.duration+(p.monthly!==p.price?" · GH₵"+p.monthly+"/mo":"")}</div>
                  <div style={{fontSize:11,color:p.color,fontWeight:700,marginBottom:16,minHeight:16}}>{p.desc}</div>
                  <button onClick={()=>onAuth("signup")} style={{width:"100%",padding:"10px 0",borderRadius:10,border:`1.5px solid ${p.color}`,background:key==="biannual"?p.color:"transparent",color:key==="biannual"?"white":p.color,fontFamily:"var(--fb)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {p.price===0?"Start Free Trial →":"Subscribe →"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="l-regions">
        <div className="regions-center">
          <div className="l-lbl" style={{color:"rgba(74,222,128,.6)"}}>Coverage</div>
          <h2 style={{color:"white",fontSize:"clamp(22px,4vw,34px)",marginBottom:6}}>All 16 regions. One platform.</h2>
          <p style={{color:"rgba(255,255,255,.42)",fontSize:14}}>Every Ghanaian can access LocalBiz — from Greater Accra to Upper West.</p>
          <div className="regions-flex">{REGIONS.map(r=><div key={r} className="rpill">{r}</div>)}</div>
        </div>
      </section>
      <footer className="land-footer"><div>© 2026 LocalBiz GH · Powered by <strong style={{color:"rgba(255,255,255,.5)"}}>AMTECH SOFTWARE SOLUTIONS</strong></div><div style={{marginTop:4,fontSize:11}}>Made in Ghana 🇬🇭 · All rights reserved</div></footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER APP
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// RATE DELIVERY COMPONENT  — shown to customer after delivery
// ══════════════════════════════════════════════════════════════════════════════
function RateDelivery({orderId, toast}) {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone]       = useState(false);
  const [saving, setSaving]   = useState(false);

  if(done) return null;

  async function submitRating() {
    if(!rating){toast("Please select a star rating","warn");return;}
    setSaving(true);
    try {
      await rateOrderDriver(orderId, rating, comment);
      setDone(true);
      toast("Thanks for your rating! ⭐");
    } catch(e) {
      toast("Failed to submit rating","error");
    } finally { setSaving(false); }
  }

  const labels = ["","😞 Poor","😕 Fair","😊 Good","😄 Great","🤩 Excellent!"];

  return (
    <div style={{marginTop:10,background:"linear-gradient(135deg,rgba(251,191,36,.08),rgba(251,191,36,.03))",border:"1.5px solid rgba(251,191,36,.25)",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontWeight:800,fontSize:13,color:"var(--ink)",marginBottom:8}}>⭐ Rate your delivery experience</div>
      <div style={{display:"flex",gap:6,marginBottom:8,justifyContent:"center"}}>
        {[1,2,3,4,5].map(s=>(
          <div key={s} onClick={()=>setRating(s)} onMouseEnter={()=>setHovered(s)} onMouseLeave={()=>setHovered(0)}
            style={{fontSize:28,cursor:"pointer",transition:"transform .1s",transform:s<=(hovered||rating)?"scale(1.25)":"scale(1)",filter:s<=(hovered||rating)?"none":"grayscale(1) opacity(.4)"}}>
            ⭐
          </div>
        ))}
      </div>
      {(hovered||rating)>0&&<div style={{textAlign:"center",fontSize:12,fontWeight:700,color:"var(--amber)",marginBottom:8}}>{labels[hovered||rating]}</div>}
      <textarea
        className="finp"
        rows={2}
        style={{resize:"none",fontSize:12,marginBottom:8}}
        placeholder="Optional: leave a comment for the driver…"
        value={comment}
        onChange={e=>setComment(e.target.value)}
      />
      <button onClick={submitRating} disabled={saving||!rating}
        style={{width:"100%",padding:"9px",borderRadius:"var(--r)",border:"none",background:rating?"linear-gradient(135deg,var(--amber2),#d97706)":"var(--border)",color:rating?"white":"var(--muted)",fontFamily:"var(--fb)",fontWeight:800,fontSize:13,cursor:rating?"pointer":"not-allowed",transition:"all .14s"}}>
        {saving?"Submitting…":"Submit Rating ⭐"}
      </button>
    </div>
  );
}

function CustomerApp({user, profile, tab, setTab, toast}) {
  const [businesses,setBusinesses]=useState([]);
  const [selBiz,setSelBiz]=useState(null);
  const [cart,setCart]=useState({});
  const [showCart,setShowCart]=useState(false);
  const [form,setForm]=useState({address:"",payment:"cash",deliveryType:"delivery"});
  const [receipt,setReceipt]=useState(null);
  const [myOrders,setMyOrders]=useState([]);
  const [region,setRegion]=useState("All Regions");
  const [search,setSearch]=useState("");
  const [catF,setCatF]=useState("All");
  const [placing,setPlacing]=useState(false);
  const [viewOrderReceipt,setViewOrderReceipt]=useState(null);
  const [prodSort,setProdSort]=useState("default");
  const [prodCatFilter,setProdCatFilter]=useState("All");
  const [whatsappNotifUrl,setWhatsappNotifUrl]=useState(null);

  useEffect(()=>listenBusinesses(setBusinesses),[]);
  useEffect(()=>{ if(!user)return; return listenCustomerOrders(user.uid,setMyOrders); },[user]);

  const filtered=businesses.filter(b=>b.status!=="suspended").filter(b=>{
    const inR=region==="All Regions"||b.region===region;
    const inC=catF==="All"||b.category===catF;
    const inS=!search||b.name.toLowerCase().includes(search.toLowerCase())||(b.category||"").toLowerCase().includes(search.toLowerCase());
    return inR&&inC&&inS;
  });
  const cartItems=selBiz?Object.entries(cart).map(([id,qty])=>({...(selBiz.products||[]).find(p=>p.id===id),qty})).filter(i=>i&&i.id&&i.qty>0):[];
  const cartSubtotal=cartItems.reduce((s,i)=>s+(i.discountPrice||i.price)*i.qty,0);
  const appliedRiderFee=(form.deliveryType==="delivery"&&selBiz?.riderFee)?parseFloat(selBiz.riderFee)||0:0;
  const cartTotal=cartSubtotal+appliedRiderFee;
  const cartCount=Object.values(cart).reduce((s,q)=>s+q,0);
  const setQty=(id,d)=>setCart(c=>({...c,[id]:Math.max(0,(c[id]||0)+d)}));
  const addToCart=(id)=>setCart(c=>({...c,[id]:(c[id]||0)+1}));

  // Get sorted/filtered products for shop view
  const getShopProducts = () => {
    if(!selBiz) return [];
    let prods = (selBiz.products||[]).filter(p=>p.available);
    if(prodCatFilter!=="All") prods=prods.filter(p=>p.category===prodCatFilter);
    if(prodSort==="price-asc") prods=[...prods].sort((a,b)=>(a.discountPrice||a.price)-(b.discountPrice||b.price));
    if(prodSort==="price-desc") prods=[...prods].sort((a,b)=>(b.discountPrice||b.price)-(a.discountPrice||a.price));
    if(prodSort==="name") prods=[...prods].sort((a,b)=>a.name.localeCompare(b.name));
    if(prodSort==="discount") prods=[...prods].sort((a,b)=>(b.discountPrice?1:0)-(a.discountPrice?1:0));
    return prods;
  };

  async function doPlace(){
    if(!form.address){toast("Please enter your delivery address","error");return;}
    setPlacing(true);
    try{
      const orderId=genId();
      const orderData={
        orderId, customerId:user.uid, customerName:profile.name, customerPhone:profile.phone,
        businessId:selBiz.id, businessName:selBiz.name, businessLogo:selBiz.logo||"",
        items:cartItems, subtotal:cartSubtotal, riderFee:appliedRiderFee, total:cartTotal,
        address:form.deliveryType==="walkin"?"Walk-in / Self-pickup":form.address,
        payment:form.payment, deliveryType:form.deliveryType, region:profile.region,
      };
      await placeOrder(orderData);
      // Send WhatsApp notification to business owner
      try {
        const bizPhone = selBiz.whatsapp || selBiz.contactPhone;
        if(bizPhone){
          const itemsList = cartItems.map(i=>`${i.name} x${i.qty}`).join(", ");
          const msg = `🛒 *NEW ORDER ${orderId}*

👤 Customer: ${profile.name}
📱 Phone: ${profile.phone}
📍 Deliver to: ${form.address}

🛍️ Items: ${itemsList}
💰 Total: GH₵ ${cartTotal.toFixed(2)}
💳 Payment: ${form.payment}

Please confirm this order on your LocalBiz dashboard.`;
          const waUrl = `https://wa.me/${bizPhone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
          setWhatsappNotifUrl(waUrl);
        }
      } catch{}
      const fakeOrder={...orderData,status:"pending",createdAt:{seconds:Date.now()/1000},timestamp:Date.now()};
      setReceipt({order:fakeOrder, biz:selBiz});
      setCart({}); setShowCart(false);
      toast("Order placed! 🎉");
    }catch(e){toast("Failed: "+e.message,"error");}
    finally{setPlacing(false);}
  }

  if(receipt) return (
    <>
      <div className="cw"/>
      {whatsappNotifUrl&&(
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#25d366",borderRadius:"var(--r2)",padding:"14px 20px",boxShadow:"0 8px 32px rgba(0,0,0,.25)",display:"flex",alignItems:"center",gap:12,maxWidth:380,width:"90%",animation:"slideUp .3s cubic-bezier(.34,1.56,.64,1)"}}>
          <span style={{fontSize:26,flexShrink:0}}>💬</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,color:"white",fontSize:13}}>Notify the shop on WhatsApp?</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.8)",marginTop:2}}>Send your order details directly to the business owner.</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
            <a href={whatsappNotifUrl} target="_blank" rel="noreferrer" onClick={()=>setWhatsappNotifUrl(null)} style={{padding:"6px 12px",borderRadius:8,background:"white",color:"#128C7E",fontWeight:800,fontSize:12,textDecoration:"none",textAlign:"center"}}>Send 📲</a>
            <button onClick={()=>setWhatsappNotifUrl(null)} style={{padding:"4px 12px",borderRadius:8,border:"1.5px solid rgba(255,255,255,.4)",background:"transparent",color:"rgba(255,255,255,.7)",fontSize:11,cursor:"pointer"}}>Skip</button>
          </div>
        </div>
      )}
      <Receipt order={receipt.order} biz={receipt.biz} onClose={()=>{setReceipt(null);setSelBiz(null);setWhatsappNotifUrl(null);setTab("orders");}}/>
    </>
  );

  if(selBiz) {
    const shopProds = getShopProducts();
    const prodCats = ["All",...new Set((selBiz.products||[]).filter(p=>p.available).map(p=>p.category).filter(Boolean))];
    return (
    <div className="bdp">
      <button className="back-btn" onClick={()=>{setSelBiz(null);setCart({});setProdSort("default");setProdCatFilter("All");}}>← Back to shops</button>
      <div className="bdp-hero">
        <div style={{display:"flex",gap:16,alignItems:"center",flex:1,flexWrap:"wrap"}}>
          {selBiz.logo
            ? <img src={selBiz.logo} alt="logo" style={{width:64,height:64,borderRadius:16,objectFit:"cover",border:"2px solid rgba(74,222,128,.35)",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
            : <div style={{width:64,height:64,borderRadius:16,background:"rgba(74,222,128,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,flexShrink:0}}>{catEmo(selBiz.category)}</div>
          }
          <div>
            <div className="bdp-name">{selBiz.name}</div>
            <div className="bdp-desc">{selBiz.description||"Quality products, delivered fast."}</div>
            <div className="bdp-tags">
              <span className="bdp-tag">📍 {selBiz.region}</span>
              {selBiz.town&&<span className="bdp-tag">🏘️ {selBiz.town}</span>}
              <span className="bdp-tag">{selBiz.category}</span>
              {selBiz.rating>0&&<span className="bdp-tag">⭐ {Number(selBiz.rating).toFixed(1)}</span>}
              {selBiz.deliveryNote&&<span className="bdp-tag">🏍️ {selBiz.deliveryNote}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Contact info */}
      {(selBiz.contactPhone||selBiz.whatsapp||selBiz.contactEmail||selBiz.address||(selBiz.acceptedPayments||[]).length>0)&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:18}}>
          {(selBiz.contactPhone||selBiz.whatsapp)&&(
            <div style={{background:"white",borderRadius:"var(--r2)",padding:14,boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
              <div style={{fontFamily:"var(--ff)",fontSize:13,fontWeight:700,marginBottom:9,color:"var(--g1)"}}>📞 Contact</div>
              {selBiz.contactPhone&&<a href={`tel:${selBiz.contactPhone}`} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"rgba(26,61,43,.07)",color:"var(--g1)",textDecoration:"none",fontSize:12,fontWeight:700,marginBottom:6,marginRight:6}}>📱 {selBiz.contactPhone}</a>}
              {selBiz.whatsapp&&<a href={`https://wa.me/${selBiz.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"rgba(37,211,102,.1)",color:"#128C7E",textDecoration:"none",fontSize:12,fontWeight:700}}>💚 WhatsApp</a>}
              {selBiz.address&&<div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>📍 {selBiz.address}</div>}
            </div>
          )}
          {(selBiz.acceptedPayments||[]).length>0&&(
            <div style={{background:"white",borderRadius:"var(--r2)",padding:14,boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
              <div style={{fontFamily:"var(--ff)",fontSize:13,fontWeight:700,marginBottom:9,color:"var(--g1)"}}>💳 We Accept</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(selBiz.acceptedPayments||[]).map(p=>{
                  const labels={cash:"💵 Cash",momo:"📱 MoMo",transfer:"🏦 Transfer",pos:"💳 POS",cheque:"📄 Cheque",crypto:"₿ Crypto"};
                  return <span key={p} style={{padding:"4px 9px",borderRadius:20,background:"var(--cream2)",fontSize:11,fontWeight:700}}>{labels[p]||p}</span>;
                })}
              </div>
              <div style={{marginTop:9,fontSize:12,color:"var(--muted)",fontWeight:600}}>
                🏍️ Delivery fee: <strong style={{color:"var(--g1)"}}>{selBiz.riderFee?fmt(selBiz.riderFee):"Free"}</strong>
                {selBiz.deliveryNote&&<div style={{marginTop:5,padding:"6px 10px",borderRadius:8,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",fontSize:11,color:"#92400e",lineHeight:1.5}}><strong>📌 NB:</strong> {selBiz.deliveryNote}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sort & filter bar */}
      {(selBiz.products||[]).filter(p=>p.available).length>0&&<>
        {prodCats.length>2&&<div className="prod-filter-row">
          {prodCats.map(c=>(
            <button key={c} className={`cpill ${prodCatFilter===c?"act":""}`} style={{fontSize:11,padding:"6px 12px"}} onClick={()=>setProdCatFilter(c)}>{c}</button>
          ))}
        </div>}
        <div className="sort-bar">
          <span className="sort-lbl">Sort:</span>
          {[["default","⭐ Featured"],["price-asc","Price ↑"],["price-desc","Price ↓"],["name","A–Z"],["discount","🏷️ Deals"]].map(([v,l])=>(
            <button key={v} className={`sort-btn ${prodSort===v?"act":""}`} onClick={()=>setProdSort(v)}>{l}</button>
          ))}
        </div>
      </>}

      {/* Products */}
      {shopProds.length===0
        ?<div className="empty-st"><span className="ico">📦</span><h3>No products found</h3><p>Try a different filter or category.</p></div>
        :<div className="prod-grid">
          {shopProds.map(p=>{
            const qty=cart[p.id]||0;
            const effPrice=p.discountPrice||p.price;
            const saving=p.discountPrice&&p.price>p.discountPrice?p.price-p.discountPrice:0;
            return (
            <div key={p.id} className="prod-item">
              {p.image
                ? <img src={p.image} className="pi-img" alt={p.name} onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
                : null
              }
              <div className="pi-img-placeholder" style={{display:p.image?"none":"flex"}}><span style={{fontSize:44}}>{p.emoji||"📦"}</span></div>
              <div className="pi-body">
                {p.discountTag&&<div className="disc-badge">🏷️ {p.discountTag}</div>}
                <div className="pi-name">{p.name}</div>
                {p.category&&<div className="pi-cat">{p.category}</div>}
                {p.description&&<div className="pi-desc">{p.description}</div>}
                <div className="pi-price-row">
                  {saving>0&&<span className="disc-orig">{fmt(p.price)}</span>}
                  <span className="pi-price" style={{margin:0}}>{fmt(effPrice)}</span>
                  {saving>0&&<span className="disc-save">-{fmt(saving)}</span>}
                </div>
                {qty===0
                  ? <button className="btn-add-cart" onClick={()=>addToCart(p.id)}>+ Add to Cart</button>
                  : <div className="qty-ctrl">
                      <button className="qbtn" onClick={()=>setQty(p.id,-1)}>−</button>
                      <span className="qnum">{qty}</span>
                      <button className="qbtn" onClick={()=>setQty(p.id,1)}>+</button>
                    </div>
                }
              </div>
            </div>
          );})}
        </div>
      }

      {cartCount>0&&<div className="cart-fab" onClick={()=>setShowCart(true)}><span className="cart-cnt">{cartCount}</span>View Cart · {fmt(cartTotal)}</div>}

      {showCart&&<div className="sp-ov" onClick={e=>e.target===e.currentTarget&&setShowCart(false)}>
        <div className="sp-panel">
          <div className="sp-head"><h3>Your Cart 🛒</h3><button className="sp-close" onClick={()=>setShowCart(false)}>✕</button></div>
          {cartItems.map(i=>(
            <div key={i.id} className="cl">
              {i.image
                ? <img src={i.image} className="cl-img" alt={i.name} onError={e=>e.target.style.display="none"}/>
                : <span className="cl-emo">{i.emoji||"📦"}</span>
              }
              <div style={{flex:1}}>
                <div className="cl-name">{i.name}</div>
                <div className="cl-sub">{fmt(i.discountPrice||i.price)} × {i.qty}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button style={{width:24,height:24,borderRadius:"50%",border:"1.5px solid var(--border)",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setQty(i.id,-1)}>−</button>
                <span style={{fontWeight:700,fontSize:13,minWidth:14,textAlign:"center"}}>{i.qty}</span>
                <button style={{width:24,height:24,borderRadius:"50%",border:"1.5px solid var(--border)",background:"transparent",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setQty(i.id,1)}>+</button>
              </div>
              <span className="cl-tot">{fmt((i.discountPrice||i.price)*i.qty)}</span>
            </div>
          ))}
          {/* Subtotal + rider fee breakdown */}
          <div style={{padding:"10px 0",borderTop:"2px solid var(--border2)",marginTop:5}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"var(--muted)"}}>Subtotal</span><span style={{fontWeight:700}}>{fmt(cartSubtotal)}</span></div>
            {appliedRiderFee>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"var(--muted)"}}>🏍️ Rider delivery fee</span><span style={{fontWeight:700,color:"var(--coral)"}}>{fmt(appliedRiderFee)}</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:900,fontFamily:"var(--ff)",paddingTop:6,borderTop:"1px dashed var(--border2)",marginTop:4}}><span>Total</span><span style={{color:"var(--amber2)"}}>{fmt(cartTotal)}</span></div>
          </div>

          <p style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:15,margin:"16px 0 10px"}}>How will you receive your order?</p>

          {/* Delivery type toggle */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div onClick={()=>setForm(f=>({...f,deliveryType:"delivery"}))} style={{padding:"12px 10px",borderRadius:"var(--r)",border:`2px solid ${form.deliveryType==="delivery"?"var(--g1)":"var(--border2)"}`,background:form.deliveryType==="delivery"?"var(--cream)":"transparent",cursor:"pointer",textAlign:"center",transition:"all .14s"}}>
              <div style={{fontSize:22,marginBottom:4}}>🏍️</div>
              <div style={{fontSize:12,fontWeight:800,color:form.deliveryType==="delivery"?"var(--g1)":"var(--muted)"}}>Delivery</div>
              {selBiz.riderFee&&<div style={{fontSize:10,color:"var(--coral)",fontWeight:700,marginTop:2}}>+{fmt(selBiz.riderFee)} fee</div>}
            </div>
            <div onClick={()=>setForm(f=>({...f,deliveryType:"walkin",address:""}))} style={{padding:"12px 10px",borderRadius:"var(--r)",border:`2px solid ${form.deliveryType==="walkin"?"var(--g1)":"var(--border2)"}`,background:form.deliveryType==="walkin"?"var(--cream)":"transparent",cursor:"pointer",textAlign:"center",transition:"all .14s"}}>
              <div style={{fontSize:22,marginBottom:4}}>🚶</div>
              <div style={{fontSize:12,fontWeight:800,color:form.deliveryType==="walkin"?"var(--g1)":"var(--muted)"}}>Walk-in / Pickup</div>
              <div style={{fontSize:10,color:"var(--lime3)",fontWeight:700,marginTop:2}}>No delivery fee</div>
            </div>
          </div>

          {form.deliveryType==="delivery"&&<div className="fgrp"><label>Delivery Address *</label><textarea className="finp" rows={2} style={{resize:"none"}} placeholder="Full delivery address e.g. House 14, Ring Road, Accra" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>}
          {form.deliveryType==="walkin"&&<div style={{background:"rgba(74,222,128,.08)",border:"1.5px solid rgba(74,222,128,.2)",borderRadius:"var(--r)",padding:"10px 13px",marginBottom:12,fontSize:12,color:"var(--lime3)",fontWeight:600}}>🚶 You'll pick up your order directly from <strong>{selBiz.name}</strong>. The shop will confirm when it's ready.</div>}

          <div className="fgrp"><label>Payment Method</label><select className="finp" value={form.payment} onChange={e=>setForm(f=>({...f,payment:e.target.value}))}>
            {(selBiz.acceptedPayments||[]).length>0
              ? (selBiz.acceptedPayments||[]).map(p=>{const labels={cash:"💵 Cash on Delivery",momo:"📱 Mobile Money (MoMo)",transfer:"🏦 Bank Transfer",pos:"💳 POS on Delivery",cheque:"📄 Cheque",crypto:"₿ Crypto"};return<option key={p} value={p}>{labels[p]||p}</option>;})
              : PAYMENTS.map(p=><option key={p.v} value={p.v}>{p.label}</option>)
            }
          </select></div>
          <button className="btn-place" onClick={doPlace} disabled={placing}>{placing?"Placing order…":"Place Order · "+fmt(cartTotal)}</button>
        </div>
      </div>}
    </div>
  );}

  return (
    <div className="cw">
      {viewOrderReceipt&&(()=>{
        const o=viewOrderReceipt;
        const b=businesses.find(bx=>bx.id===o.businessId)||{name:o.businessName,logo:o.businessLogo||"",category:"Other",region:o.region};
        return <Receipt order={o} biz={b} onClose={()=>setViewOrderReceipt(null)}/>;
      })()}

      {tab==="browse"&&<>
        <div className="c-hero">
          <div>
            <div className="ch-greet">Hello, {(profile?.name||"there").split(" ")[0]} 👋</div>
            <div className="ch-sub">Discover businesses across Ghana.</div>
            <div className="ch-region"><label>REGION:</label>
              <select className="rsel" value={region} onChange={e=>setRegion(e.target.value)}>
                <option>All Regions</option>{REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="sbox"><span>🔍</span><input placeholder="Search businesses, food, fashion…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button style={{border:"none",background:"none",cursor:"pointer",color:"var(--dim)",fontSize:16}} onClick={()=>setSearch("")}>✕</button>}</div>
        <div className="cat-scroll">
          {["All",...BIZ_CATEGORIES.map(c=>c.label)].map(c=>(
            <button key={c} className={`cpill ${catF===c?"act":""}`} onClick={()=>setCatF(c)}>{c!=="All"&&<span>{catEmo(c)}</span>}{c}</button>
          ))}
        </div>
        {filtered.length===0?<div className="empty-st"><span className="ico">🏙️</span><h3>No businesses found</h3><p>Try a different region or category.</p></div>:(
          <div className="biz-grid">
            {filtered.map(b=>{
              const cols=[["#e8f5e9","#c8e6c9"],["#fff3e0","#ffe0b2"],["#fce4ec","#f8bbd0"],["#e3f2fd","#bbdefb"],["#f3e5f5","#e1bee7"],["#e0f2f1","#b2dfdb"]];
              const [c1,c2]=cols[Math.abs((b.name||"").charCodeAt(0)%6)];
              const onSaleCount=(b.products||[]).filter(p=>p.available&&p.discountPrice).length;
              return <div key={b.id} className="biz-card" onClick={()=>{setSelBiz(b);setProdSort("default");setProdCatFilter("All");}}>
                <div className="bc-banner" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                  {b.logo
                    ? <img src={b.logo} className="bc-banner-img" alt={b.name} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:48}}>{catEmo(b.category)}</span>
                  }
                  <span className="bc-reg">📍 {b.region}{b.town?`, ${b.town}`:""}</span>
                  {onSaleCount>0&&<span style={{position:"absolute",top:9,left:9,background:"#ef4444",color:"white",fontSize:9,fontWeight:900,padding:"2px 7px",borderRadius:20}}>🏷️ {onSaleCount} on sale</span>}
                </div>
                <div className="bc-body">
                  <div className="bc-name">{b.name}</div>
                  <div className="bc-cat">{b.category}</div>
                  <div className="bc-meta">
                    {b.rating>0&&<span className="bc-rating">⭐ {Number(b.rating).toFixed(1)}</span>}
                    <span className="bc-cnt">{b.ordersCount||0} orders</span>
                    <span className="bc-items">{(b.products||[]).filter(p=>p.available).length} items →</span>
                  </div>
                </div>
              </div>;
            })}
          </div>
        )}
      </>}

      {tab==="orders"&&<>
        <h2 style={{fontFamily:"var(--ff)",fontSize:20,marginBottom:16}}>My Orders</h2>
        {myOrders.length===0?<div className="empty-st"><span className="ico">📋</span><h3>No orders yet</h3><p>Browse and place your first order!</p></div>:(
          <div className="ord-list">
            {myOrders.map(o=>{const sc=ORDER_STATUS[o.status]||ORDER_STATUS.pending;const si=TRACK_STEPS.indexOf(o.status);return(
              <div key={o.id} className="ord-row" style={{borderLeftColor:sc.color}}>
                <div className="or-head"><div className="or-id">{o.orderId||o.id}</div><span className="sbadge" style={{background:sc.bg,color:sc.color}}>{sc.label}</span></div>
                <div className="or-biz">🏪 {o.businessName}</div>
                <div className="or-items">{(o.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
                {o.riderName&&<div style={{fontSize:11,color:"var(--lime3)",fontWeight:600,margin:"3px 0"}}>🏍️ {o.riderName}</div>}
                <div className="track-bar">
                  {TRACK_STEPS.map((s,i)=><div key={s} className="tst"><div className={`tst-dot ${i<si?"done":i===si?"active":""}`}>{i<si?"✓":""}</div><div className={`tst-lab ${i<=si?"done":""}`}>{ORDER_STATUS[s]?.label||s}</div></div>)}
                </div>
                <div className="or-foot">
                  <span className="or-total">{fmt(o.total)}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span className="or-time">{ago(o.createdAt||o.timestamp)}</span>
                    <button onClick={()=>setViewOrderReceipt(o)} style={{padding:"4px 10px",borderRadius:8,border:"1.5px solid var(--border)",background:"transparent",color:"var(--muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>🧾 Receipt</button>
                  </div>
                </div>
                {o.status==="delivered"&&!o.driverRating&&(
                  <RateDelivery orderId={o.id} toast={toast}/>
                )}
                {o.status==="delivered"&&o.driverRating&&(
                  <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(251,191,36,.08)",border:"1.5px solid rgba(251,191,36,.2)",marginTop:6,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:13}}>{"⭐".repeat(o.driverRating)}</span>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--amber)"}}>You rated this {o.driverRating}/5</span>
                    {o.driverRatingComment&&<span style={{fontSize:11,color:"var(--muted)"}}>— "{o.driverRatingComment}"</span>}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </>}
      <div style={{height:72}}/>
      <div className="bottom-nav">
        {[["browse","🔍","Explore"],["orders","📦","My Orders"]].map(([t,ico,lab])=>(
          <button key={t} className={`bnav-btn ${tab===t?"act":""}`} onClick={()=>setTab(t)}><div style={{fontSize:18,marginBottom:1}}>{ico}</div>{lab}</button>
        ))}
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// BUSINESS APP
// ══════════════════════════════════════════════════════════════════════════════
function BusinessApp({user, profile, toast}) {
  const [biz,setBiz]=useState(null);
  const [loading,setLoading]=useState(true);
  const [bizTab,setBizTab]=useState("orders");
  const [orders,setOrders]=useState([]);
  const [riders,setRiders]=useState([]);
  const [showProd,setShowProd]=useState(false);
  const [editProd,setEditProd]=useState(null);
  const [pf,setPf]=useState({name:"",price:"",emoji:"📦",image:"",category:"General",description:"",discountPrice:"",discountTag:""});
  const [riderModal,setRiderModal]=useState(null);
  const [selRider,setSelRider]=useState(null);
  const [saving,setSaving]=useState(false);
  const [savingProfile,setSavingProfile]=useState(false);
  const [gpsLoading,setGpsLoading]=useState(false);
  const [hubtelLoading,setHubtelLoading]=useState(null); // planKey being processed
  const [newOrderAlerts,setNewOrderAlerts]=useState([]);
  const [notifPerm,setNotifPerm]=useState(()=>{try{return typeof Notification!=="undefined"?Notification.permission:"denied";}catch{return "denied";}});
  const [dispatchLogs,setDispatchLogs]=useState([]);
  const [editRiderFee,setEditRiderFee]=useState({});
  // Fleet driver management state
  const [fleetDrivers,setFleetDrivers]=useState([]);
  const [partnerRequests,setPartnerRequests]=useState([]);
  const [fleetTab,setFleetTab]=useState("roster");
  const [showDriverForm,setShowDriverForm]=useState(false);
  const [editDriver,setEditDriver]=useState(null);
  const [selDriver,setSelDriver]=useState(null);
  const [driverDeliveries,setDriverDeliveries]=useState([]);
  const [driverDailyStats,setDriverDailyStats]=useState([]);
  const [driverPhotoFile,setDriverPhotoFile]=useState(null);
  const [recordDeliveryModal,setRecordDeliveryModal]=useState(null);
  const [savingDriver,setSavingDriver]=useState(false);
  const EMPTY_DRIVER={name:"",phone:"",email:"",vehicle:"Motorbike 🏍️",licenseNo:"",idNumber:"",address:"",emergencyContact:"",photo:""};
  const [df,setDf]=useState({...EMPTY_DRIVER});
  const seenOrderIds=useRef(new Set());
  const isFirstLoad=useRef(true);
  const audioCtx=useRef(null);

  const [shopForm,setShopForm]=useState({
    logo:"", description:"", phone:"", whatsapp:"", email:"",
    address:"", instagram:"", facebook:"",
    acceptedPayments:[], riderFee:"", deliveryNote:"",
    locationLat:"", locationLng:"",
  });
  const setSF=(k,v)=>setShopForm(f=>({...f,[k]:v}));
  const togglePayment=(p)=>setShopForm(f=>({...f,acceptedPayments:f.acceptedPayments.includes(p)?f.acceptedPayments.filter(x=>x!==p):[...f.acceptedPayments,p]}));

  // Play a soft chime using Web Audio API
  function playChime(){
    try{
      if(!audioCtx.current) audioCtx.current=new (window.AudioContext||window.webkitAudioContext)();
      const ctx=audioCtx.current;
      [523,659,784].forEach((freq,i)=>{
        const o=ctx.createOscillator();
        const g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value=freq; o.type="sine";
        g.gain.setValueAtTime(0,ctx.currentTime+i*0.15);
        g.gain.linearRampToValueAtTime(0.18,ctx.currentTime+i*0.15+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.4);
        o.start(ctx.currentTime+i*0.15);
        o.stop(ctx.currentTime+i*0.15+0.45);
      });
    }catch{}
  }

  // Send browser push notification
  function sendBrowserNotif(order){
    if(typeof Notification==="undefined"||Notification.permission!=="granted") return;
    try{
      const n=new Notification("🛒 New Order — "+order.orderId,{
        body:`${order.customerName} ordered ${(order.items||[]).map(i=>i.name).join(", ")} · ${fmt(order.total)}`,
        icon:"/favicon.ico", tag:order.id, requireInteraction:true,
      });
      n.onclick=()=>{ window.focus(); n.close(); };
    }catch{}
  }

  useEffect(()=>{
    // Request notification permission once on mount
    try{ if(typeof Notification!=="undefined"&&Notification.permission==="default") Notification.requestPermission().then(p=>setNotifPerm(p)); }catch{}
    if(!user)return; return listenMyBusiness(user.uid,b=>{
    setBiz(b);setLoading(false);
    if(b) setShopForm({
      logo:b.logo||"", description:b.description||"",
      phone:b.contactPhone||"", whatsapp:b.whatsapp||"",
      email:b.contactEmail||"", address:b.address||"",
      instagram:b.instagram||"", facebook:b.facebook||"",
      acceptedPayments:b.acceptedPayments||[],
      riderFee:b.riderFee||"", deliveryNote:b.deliveryNote||"",
      locationLat:b.location?.lat||"", locationLng:b.location?.lng||"",
    });
  }); },[user]);

  // ── Detect return from Hubtel checkout ─────────────────────────────────────
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const hubtelStatus = params.get("hubtel");
    const clientRef    = params.get("clientReference");
    if(hubtelStatus==="success" && clientRef && clientRef.startsWith("SUB-")) {
      // clientRef format: SUB-{bizId}-{planKey}-{timestamp}
      const parts = clientRef.split("-");
      if(parts.length>=3){
        const planKey = parts[2];
        // Wait until biz is loaded before updating
        const tryUpdate = setInterval(async()=>{
          const b = biz;
          if(!b) return;
          clearInterval(tryUpdate);
          try{
            const plan = PLANS[planKey];
            if(!plan) return;
            await updateSubscription(b.id, planKey);
            await logSubscriptionPayment(b.id, b.name, planKey, plan.price);
            const phone = b.contactPhone || b.ownerPhone || "";
            if(phone) await sendSMS(phone,
              `Payment of GH₵${plan.price} confirmed! Your LocalBiz GH ${plan.label} plan is now ACTIVE. Thank you for subscribing!`
            );
            toast(`🎉 Payment confirmed! ${plan.label} plan activated.`);
            setBizTab("sub");
          }catch(e){
            toast("Payment recorded but plan update failed. Contact support.","error");
          }
          // Clean URL
          window.history.replaceState({},"",window.location.pathname);
        },500);
        setTimeout(()=>clearInterval(tryUpdate),10000);
      }
    } else if(hubtelStatus==="cancelled"){
      toast("Payment was cancelled.","warn");
      window.history.replaceState({},"",window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[biz?.id]);

  useEffect(()=>{ if(!biz?.id)return;
    listenDispatchLogs(biz.id, setDispatchLogs);
    listenFleetDrivers(biz.id, setFleetDrivers);
    listenBizPartnerships(biz.id, setPartnerRequests);
    const u1=listenBusinessOrders(biz.id,incoming=>{
      if(isFirstLoad.current){
        incoming.forEach(o=>seenOrderIds.current.add(o.id));
        isFirstLoad.current=false;
        setOrders(incoming); return;
      }
      const brandNew=incoming.filter(o=>!seenOrderIds.current.has(o.id)&&o.status==="pending");
      brandNew.forEach(o=>{
        seenOrderIds.current.add(o.id);
        playChime();
        sendBrowserNotif(o);
        setNewOrderAlerts(a=>[...a,{id:o.id,orderId:o.orderId,customer:o.customerName,total:o.total,items:(o.items||[]).map(i=>i.name).join(", "),ts:Date.now()}]);
        setTimeout(()=>setNewOrderAlerts(a=>a.filter(x=>x.id!==o.id)),30000);
      });
      incoming.forEach(o=>seenOrderIds.current.add(o.id));
      setOrders(incoming);
    });
    const u2=listenRidersInRegion(biz.region,setRiders);
    return()=>{u1();u2();};
  },[biz?.id,biz?.region]);

  const pending=orders.filter(o=>o.status==="pending").length;
  // Revenue is persisted to Firestore on each delivery — read from biz doc, fallback to local calc
  const revenue = biz?.revenue || orders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total||0),0);

  async function updStatus(oid,status,extra={}){ try{await updateOrderStatus(oid,status,extra);toast(`Order ${status}!`);}catch(e){toast("Failed","error");} }
  async function assignRider(oid){ const r=riders.find(x=>x.id===selRider); await updStatus(oid,"assigned",{riderId:r.id,riderName:r.name,riderPhone:r.phone}); setRiderModal(null);setSelRider(null); }
  // Fleet driver CRUD
  async function saveDriver(){
    if(!df.name||!df.phone){toast("Name and phone required","warn");return;}
    setSavingDriver(true);
    try{
      let photoUrl=df.photo||"";
      if(driverPhotoFile){
        try{photoUrl=await uploadImage(driverPhotoFile,`fleet/${biz.id}_${Date.now()}`);}catch{}
      }
      const data={...df,photo:photoUrl};
      if(editDriver){
        await updateFleetDriver(editDriver.id,data);
        toast("Driver updated ✅");
      } else {
        await addFleetDriver(biz.id,data);
        toast("Driver added 🚗");
      }
      setShowDriverForm(false);setEditDriver(null);setDf({...EMPTY_DRIVER});setDriverPhotoFile(null);
    }catch(e){toast("Failed: "+e.message,"error");}
    finally{setSavingDriver(false);}
  }

  async function removeDriver(did){
    if(!window.confirm("Remove this driver from your fleet?"))return;
    try{await deleteFleetDriver(did);toast("Driver removed");}catch{toast("Failed","error");}
    if(selDriver?.id===did){setSelDriver(null);setDriverDeliveries([]);setDriverDailyStats([]);}
  }

  function openDriverDetail(driver){
    setSelDriver(driver);setFleetTab("driver-detail");
    const u1=listenDriverDeliveries(driver.id,setDriverDeliveries);
    const u2=listenDriverDailyStats(driver.id,setDriverDailyStats);
    // store unsubs for cleanup if needed
  }

  async function doRecordDelivery(order){
    if(!selDriver){toast("Select a driver first","warn");return;}
    try{
      await recordFleetDelivery(selDriver.id, biz.id, {
        orderId:order.orderId||order.id,
        orderDocId:order.id,
        customerName:order.customerName||"",
        customerPhone:order.customerPhone||"",
        address:order.address||"",
        items:order.items||[],
        total:order.total||0,
        riderFee:order.riderFee||parseFloat(biz.riderFee)||0,
      });
      await updStatus(order.id,"delivered");
      setRecordDeliveryModal(null);
      toast("Delivery recorded! ✅");
    }catch(e){toast("Failed: "+e.message,"error");}
  }

  async function saveProd(){
    if(!pf.name||!pf.price){toast("Name and price required","warn");return;} setSaving(true);
    try{
      if(editProd){await updateProduct(biz.id,editProd.id,pf);toast("Product updated ✏️");}
      else{await addProduct(biz.id,pf);toast("Product added 📦");}
      setShowProd(false);setEditProd(null);setPf({name:"",price:"",emoji:"📦",image:"",category:"General",description:"",discountPrice:"",discountTag:""});
    }catch(e){toast("Failed: "+e.message,"error");}finally{setSaving(false);}
  }
  async function delProd(pid){ if(!window.confirm("Delete this product?"))return; try{await deleteProduct(biz.id,pid);toast("Deleted");}catch(e){toast("Failed","error");} }
  async function toggleProd(pid,cur){ try{await updateProduct(biz.id,pid,{available:!cur});}catch{} }

  function getGPS(){
    if(!navigator.geolocation){toast("GPS not supported on this device","error");return;}
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{ setSF("locationLat",pos.coords.latitude.toFixed(6)); setSF("locationLng",pos.coords.longitude.toFixed(6)); setGpsLoading(false); toast("Location captured! 📍"); },
      ()=>{ setGpsLoading(false); toast("Could not get location. Allow browser GPS access.","error"); }
    );
  }

  // ── Hubtel subscription payment ────────────────────────────────────────────
  async function initiateSubscriptionPayment(planKey){
    const plan = PLANS[planKey];
    if(!plan || plan.price===0){toast("Free plan — no payment needed","warn");return;}
    setHubtelLoading(planKey);
    try{
      const clientRef = `SUB-${biz.id}-${planKey}-${Date.now()}`;
      const checkoutUrl = await initiateHubtelPayment(
        plan.price,
        `LocalBiz GH ${plan.label} Subscription — ${biz.name}`,
        clientRef
      );
      if(!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = checkoutUrl;
    }catch(e){
      toast("Payment initiation failed: "+e.message,"error");
      setHubtelLoading(null);
    }
  }

  async function saveShopProfile(){
    setSavingProfile(true);
    try{
      const locationData = shopForm.locationLat && shopForm.locationLng
        ? { lat: parseFloat(shopForm.locationLat), lng: parseFloat(shopForm.locationLng) }
        : null;
      await updateBusiness(biz.id,{
        logo:shopForm.logo, description:shopForm.description,
        contactPhone:shopForm.phone, whatsapp:shopForm.whatsapp,
        contactEmail:shopForm.email, address:shopForm.address,
        instagram:shopForm.instagram, facebook:shopForm.facebook,
        acceptedPayments:shopForm.acceptedPayments,
        riderFee:shopForm.riderFee, deliveryNote:shopForm.deliveryNote,
        location: locationData,
      });
      toast("Shop profile saved! ✅");
    }catch(e){toast("Failed: "+e.message,"error");}
    finally{setSavingProfile(false);}
  }

  const PAY_OPTS=[
    {v:"cash",label:"💵 Cash on Delivery"},{v:"momo",label:"📱 MoMo"},
    {v:"transfer",label:"🏦 Bank Transfer"},{v:"pos",label:"💳 POS on Delivery"},
    {v:"cheque",label:"📄 Cheque"},{v:"crypto",label:"₿ Crypto"},
  ];

  if(loading) return <div style={{padding:60,textAlign:"center",color:"var(--muted)"}}>Loading your store…</div>;
  if(!biz) return <div className="bw"><div className="empty-st"><span className="ico">🏪</span><h3>Store not found</h3><p>Sign out and re-register as a Business owner.</p></div></div>;

  const profileComplete = biz.logo || biz.contactPhone || biz.description;

  // Derive shop slug — ownerUsername on biz doc is most reliable
  const shopSlug = biz.ownerUsername || profile?.username || "";
  const shopUrl  = shopSlug ? `https://localbizgh.web.app/?shop=${shopSlug}` : "";

  return (
    <div className="bw">
      <div className="biz-hdr">
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          {biz.logo
            ? <img src={biz.logo} alt="logo" className="biz-hdr-logo" onError={e=>e.target.style.display="none"}/>
            : <div className="biz-hdr-logo-ph">{catEmo(biz.category)}</div>
          }
          <div>
            <div className="bh-name">{biz.name}</div>
            <div className="bh-sub">📍 {biz.region} · {biz.category} · <span style={{background:PLANS[biz.plan||"free"]?.bg,color:PLANS[biz.plan||"free"]?.color,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:800}}>{PLANS[biz.plan||"free"]?.label}</span></div>
            {!profileComplete&&<div style={{fontSize:10,color:"var(--amber)",fontWeight:700,marginTop:3}}>⚠️ Complete your shop profile to attract customers</div>}
            {!biz.logo&&<button onClick={()=>setBizTab("shop")} style={{fontSize:10,color:"var(--blue)",fontWeight:700,marginTop:3,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}}>+ Upload your logo</button>}
          </div>
        </div>
        <div className="bh-stats">
          {[{v:orders.length,l:"Orders"},{v:(biz.products||[]).length,l:"Products"},{v:fmt(revenue),l:"Revenue"}].map(({v,l})=>(
            <div key={l} className="bhs"><div className="bhs-v">{v}</div><div className="bhs-l">{l}</div></div>
          ))}
        </div>
      </div>

      {/* ── SHOP LINK BANNER — always visible ── */}
      <ShopLinkBanner shopUrl={shopUrl} shopSlug={shopSlug} bizName={biz.name}/>

      {/* NOTIFICATION PERMISSION PROMPT */}
      {notifPerm==="default"&&(
        <div style={{background:"linear-gradient(135deg,#1a3d2b,#245237)",borderRadius:"var(--r2)",padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",boxShadow:"var(--sh)"}}>
          <span style={{fontSize:24}}>🔔</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,color:"white",fontSize:13}}>Enable order notifications</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.55)",marginTop:2}}>Get instant alerts when customers place orders — even when you're on another tab.</div>
          </div>
          <button onClick={()=>Notification.requestPermission().then(p=>setNotifPerm(p))} style={{padding:"8px 16px",borderRadius:"var(--r)",border:"none",background:"var(--lime)",color:"var(--g1)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>Allow Notifications</button>
          <button onClick={()=>setNotifPerm("denied")} style={{padding:"8px 12px",borderRadius:"var(--r)",border:"1.5px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.5)",fontFamily:"var(--fb)",fontSize:11,cursor:"pointer",flexShrink:0}}>Not now</button>
        </div>
      )}

      {/* PENDING ORDERS ALERT BANNER */}
      {pending>0&&bizTab!=="orders"&&(
        <div onClick={()=>setBizTab("orders")} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",borderRadius:"var(--r2)",padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",boxShadow:"0 4px 20px rgba(245,158,11,.35)",animation:"pulseAmber 2s ease-in-out infinite"}}>
          <span style={{fontSize:28,animation:"bounce 1s infinite"}}>🔔</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,color:"white",fontSize:15}}>You have {pending} pending order{pending>1?"s":""}!</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)",marginTop:2}}>Tap here to view and confirm — customers are waiting.</div>
          </div>
          <div style={{background:"white",color:"#d97706",fontWeight:900,fontSize:13,padding:"8px 14px",borderRadius:"var(--r)",flexShrink:0}}>View Orders →</div>
        </div>
      )}

      {/* REAL-TIME NEW ORDER ALERTS */}
      {newOrderAlerts.map(alert=>(
        <div key={alert.id} style={{background:"linear-gradient(135deg,#1a3d2b,#2f6b47)",borderRadius:"var(--r2)",padding:"14px 18px",marginBottom:10,display:"flex",alignItems:"flex-start",gap:12,boxShadow:"0 6px 24px rgba(26,61,43,.35)",border:"1.5px solid rgba(74,222,128,.3)",animation:"slideInAlert .4s cubic-bezier(.34,1.56,.64,1)"}}>
          <span style={{fontSize:28,flexShrink:0}}>🛒</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,color:"var(--lime)",fontSize:14}}>New Order {alert.orderId}!</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:3}}>{alert.customer} ordered: {alert.items}</div>
            <div style={{fontFamily:"var(--ff)",fontSize:18,fontWeight:900,color:"var(--amber)",marginTop:4}}>{fmt(alert.total)}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
            <button onClick={()=>{setBizTab("orders");setNewOrderAlerts(a=>a.filter(x=>x.id!==alert.id));}} style={{padding:"7px 14px",borderRadius:"var(--r)",border:"none",background:"var(--lime)",color:"var(--g1)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>Manage Order</button>
            <button onClick={()=>setNewOrderAlerts(a=>a.filter(x=>x.id!==alert.id))} style={{padding:"5px 14px",borderRadius:"var(--r)",border:"1.5px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.5)",fontFamily:"var(--fb)",fontSize:11,cursor:"pointer"}}>Dismiss</button>
          </div>
        </div>
      ))}

            <div className="biz-tabs">
        {[["orders",`📋 Orders${pending>0?` (${pending})`:""}`],["fleet","🚗 My Fleet"],["dispatch","🚚 Dispatch"],["products","📦 Products"],["shop","🏪 Shop Profile"],["sub","💎 Subscription"],["info","ℹ️ Info"]].map(([t,l])=>(
          <button key={t} className={`biztab ${bizTab===t?"act":""}`} onClick={()=>setBizTab(t)}>{l}</button>
        ))}
      </div>
      {/* Mobile bottom nav for business */}
      <div className="biz-bot-nav">
        {[["orders","📋",`Orders${pending>0?` (${pending})`:""}`],["fleet","🚗","Fleet"],["dispatch","🚚","Dispatch"],["products","📦","Products"],["shop","🏪","Profile"],["sub","💎","Plan"],["info","ℹ️","Info"]].map(([t,ico,lab])=>(
          <button key={t} className={`bbn-btn ${bizTab===t?"act":""}`} onClick={()=>setBizTab(t)}>
            <span className="bbn-ico">{ico}</span>
            <span>{lab}</span>
            {t==="orders"&&pending>0&&<span className="bbn-badge">{pending}</span>}
          </button>
        ))}
      </div>

      {/* ORDERS */}
      {bizTab==="orders"&&(orders.length===0?<div className="empty-st"><span className="ico">📬</span><h3>No orders yet</h3><p>Orders appear here as customers place them.</p></div>:
        orders.map(o=>{const sc=ORDER_STATUS[o.status]||ORDER_STATUS.pending;return(
          <div key={o.id} className="ord-card" style={{borderLeftColor:sc.color}}>
            <div className="oc-head">
              <div>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div className="oc-id">{o.orderId||o.id}</div>
                  {o.deliveryType==="walkin"&&<span style={{padding:"2px 8px",borderRadius:20,background:"rgba(74,222,128,.12)",color:"var(--lime3)",fontSize:10,fontWeight:800}}>🚶 Walk-in</span>}
                </div>
                <div className="oc-time">{ago(o.createdAt||o.timestamp)}</div>
              </div>
              <span className="sbadge" style={{background:sc.bg,color:sc.color}}>{sc.label}</span>
            </div>
            <div className="oc-cust"><div className="oc-av">👤</div><div><div className="oc-cname">{o.customerName}</div><div className="oc-caddr">📍 {o.address}</div><div className="oc-caddr">📱 {o.customerPhone} · {PAYMENTS.find(p=>p.v===o.payment)?.label||o.payment}</div></div></div>
            <div className="oc-items">{(o.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
            {o.riderName&&(
              <div style={{background:"rgba(74,222,128,.07)",borderRadius:8,padding:"8px 10px",margin:"6px 0",border:"1px solid rgba(74,222,128,.2)"}}>
                <div style={{fontWeight:700,fontSize:12,color:"var(--g1)",marginBottom:5}}>🏍️ Assigned Rider: {o.riderName}</div>
                {o.riderPhone&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <a href={`tel:${o.riderPhone}`}
                      style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(59,158,255,.12)",color:"var(--blue)",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                      📞 Call {o.riderPhone}
                    </a>
                    <a href={`https://wa.me/${(o.riderPhone||"").replace(/\D/g,"").replace(/^0/,"233")}?text=${encodeURIComponent(`Hi ${o.riderName}, your delivery from ${o.businessName||"the shop"} is ready. Order: ${o.orderId||o.id}. Customer: ${o.customerName} at ${o.address}. Please proceed with the delivery.`)}`}
                      target="_blank" rel="noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(37,211,102,.15)",color:"#16a34a",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                      💬 WhatsApp
                    </a>
                    <a href={`sms:${o.riderPhone}?body=${encodeURIComponent(`Hi ${o.riderName}, delivery ready at ${o.businessName||"shop"}. Order ${o.orderId||o.id} for ${o.customerName}.`)}`}
                      style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(168,85,247,.12)",color:"var(--purple)",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                      ✉️ SMS
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="oc-foot"><span className="oc-total">{fmt(o.total)}</span></div>
            {/* Rider fee editor — visible on preparing step */}
            {(o.status==="confirmed"||o.status==="preparing")&&!o.deliveryType!=="walkin"&&(
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderTop:"1px solid var(--border2)",marginTop:6}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--muted)"}}>🏍️ Rider Fee:</span>
                <input
                  type="number"
                  style={{width:80,padding:"4px 8px",borderRadius:6,border:"1.5px solid var(--border2)",fontSize:12,fontWeight:700,color:"var(--g1)",background:"var(--cream)",fontFamily:"var(--fb)"}}
                  placeholder={biz.riderFee||"0"}
                  value={editRiderFee[o.id]??o.riderFee??biz.riderFee??""}
                  onChange={e=>setEditRiderFee(f=>({...f,[o.id]:e.target.value}))}
                />
                <button style={{padding:"4px 10px",borderRadius:6,border:"none",background:"var(--g1)",color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}}
                  onClick={async()=>{
                    const fee=parseFloat(editRiderFee[o.id])||0;
                    await updateOrderStatus(o.id,o.status,{riderFee:fee, total:(o.subtotal||o.total)+fee});
                    toast("Rider fee updated ✅");
                  }}>Save</button>
                <span style={{fontSize:10,color:"var(--dim)"}}>Added to customer total</span>
              </div>
            )}
            <div className="oc-acts">
              {o.status==="pending"&&<>
                <button className="act-btn ab-c" onClick={()=>updStatus(o.id,"confirmed")}>✅ Confirm Order</button>
                <button className="act-btn" style={{background:"rgba(74,222,128,.1)",color:"var(--lime3)"}} onClick={()=>updStatus(o.id,"delivered",{deliveryType:"walkin"})}>🚶 Walk-in Pickup</button>
                <button className="act-btn ab-x" onClick={()=>updStatus(o.id,"cancelled")}>✕ Cancel</button>
              </>}
              {o.status==="confirmed"&&<>
                <button className="act-btn ab-p" onClick={()=>updStatus(o.id,"preparing")}>👨‍🍳 Start Preparing</button>
                <button className="act-btn" style={{background:"rgba(74,222,128,.1)",color:"var(--lime3)"}} onClick={()=>updStatus(o.id,"delivered",{deliveryType:"walkin"})}>🚶 Walk-in Collected</button>
              </>}
              {o.status==="preparing"&&<button className="act-btn ab-a" onClick={()=>{setRiderModal(riderModal===o.id?null:o.id);setSelRider(null);}}>🏍️ {riderModal===o.id?"Hide Riders":"Assign Rider →"}</button>}
              {o.status==="dispatched"&&<>
                <button className="act-btn ab-d" onClick={()=>updStatus(o.id,"delivered")}>✅ Mark Delivered</button>
                {fleetDrivers.length>0&&<button className="act-btn" style={{background:"linear-gradient(135deg,#1a3d2b,#2f6b47)",color:"var(--lime)",border:"none"}} onClick={()=>setRecordDeliveryModal(o)}>🚗 Record Fleet Delivery</button>}
              </>}
            </div>
            {o.status==="preparing"&&riderModal===o.id&&(
              <div className="rider-panel">
                <div className="rider-panel-title">🏍️ Available Riders in {biz.region} — tap to select</div>
                {riders.filter(r=>r.available).length===0
                  ?<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"10px 0"}}>No riders online right now. Check again shortly.</p>
                  :riders.filter(r=>r.available).map(r=>(
                    <div key={r.id} style={{marginBottom:8}}>
                      {/* Rider card — tap to select */}
                      <div className={"rider-avail-card"+(selRider===r.id?" sel":"")} onClick={()=>setSelRider(r.id)}
                        style={{marginBottom:0,borderRadius:"var(--r) var(--r) 0 0"}}>
                        {r.photo?<img src={r.photo} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--lime2)",flexShrink:0}} alt="" onError={e=>e.target.style.display="none"}/>:<div style={{width:36,height:36,borderRadius:"50%",background:"var(--g1)",color:"var(--lime)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,flexShrink:0}}>{(r.name||"R")[0]}</div>}
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:12}}>{r.name}</div>
                          <div style={{fontSize:10,color:"var(--muted)"}}>{r.vehicle} · ⭐ {Number(r.rating||5).toFixed(1)} · {r.trips||0} trips</div>
                          {r.phone&&<div style={{fontSize:10,color:"var(--g3)",fontWeight:600}}>📞 {r.phone}</div>}
                        </div>
                        {selRider===r.id&&<span style={{color:"var(--g1)",fontSize:18,fontWeight:900,marginLeft:6}}>✓</span>}
                      </div>
                      {/* Contact buttons shown below each rider card */}
                      <div style={{display:"flex",gap:6,padding:"6px 8px",background:"var(--cream2)",borderRadius:"0 0 var(--r) var(--r)",border:"1px solid var(--border2)",borderTop:"none"}}>
                        <span style={{fontSize:10,color:"var(--muted)",fontWeight:700,alignSelf:"center",marginRight:2}}>Alert rider:</span>
                        {r.phone&&(
                          <a href={`tel:${r.phone}`}
                            style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(59,158,255,.12)",color:"var(--blue)",fontSize:11,fontWeight:700,textDecoration:"none",flexShrink:0}}
                            onClick={e=>e.stopPropagation()}>
                            📞 Call
                          </a>
                        )}
                        {r.phone&&(
                          <a href={`https://wa.me/${(r.phone||"").replace(/\D/g,"").replace(/^0/,"233")}?text=${encodeURIComponent(`Hi ${r.name}, there is a delivery job waiting for you at ${biz.name}. Please come in to collect the order. Thank you!`)}`}
                            target="_blank" rel="noreferrer"
                            style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(37,211,102,.15)",color:"#16a34a",fontSize:11,fontWeight:700,textDecoration:"none",flexShrink:0}}
                            onClick={e=>e.stopPropagation()}>
                            💬 WhatsApp
                          </a>
                        )}
                        {r.phone&&(
                          <a href={`sms:${r.phone}?body=${encodeURIComponent(`Hi ${r.name}, there is a delivery job at ${biz.name}. Please come to collect the order.`)}`}
                            style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(168,85,247,.12)",color:"var(--purple)",fontSize:11,fontWeight:700,textDecoration:"none",flexShrink:0}}
                            onClick={e=>e.stopPropagation()}>
                            ✉️ SMS
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                }
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button style={{flex:1,padding:"9px",borderRadius:"var(--r)",border:"1.5px solid var(--border)",background:"transparent",fontFamily:"var(--fb)",fontSize:12,fontWeight:700,cursor:"pointer",color:"var(--muted)"}} onClick={()=>{setRiderModal(null);setSelRider(null);}}>Cancel</button>
                  <button style={{flex:2,padding:"9px",borderRadius:"var(--r)",border:"none",background:selRider?"var(--g1)":"#aaa",color:"white",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:selRider?"pointer":"not-allowed"}} disabled={!selRider} onClick={()=>assignRider(o.id)}>Dispatch Rider 🏍️</button>
                </div>
              </div>
            )}
          </div>
        );})
      )}


      {/* ─── RECORD DELIVERY MODAL ─────────────────────────────────────────── */}
      {recordDeliveryModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"var(--white)",borderRadius:"var(--r2) var(--r2) 0 0",padding:24,width:"100%",maxWidth:480,maxHeight:"80vh",overflowY:"auto",boxShadow:"var(--sh2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <h3 style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:18,margin:0}}>🚗 Record Fleet Delivery</h3>
                <p style={{fontSize:12,color:"var(--muted)",margin:"4px 0 0"}}>Order {recordDeliveryModal.orderId} · {fmt(recordDeliveryModal.total)}</p>
              </div>
              <button onClick={()=>setRecordDeliveryModal(null)} style={{width:32,height:32,borderRadius:"50%",border:"1.5px solid var(--border2)",background:"var(--cream)",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <p style={{fontSize:13,fontWeight:700,color:"var(--ink)",marginBottom:12}}>Select the driver who made this delivery:</p>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
              {fleetDrivers.filter(d=>d.status==="active").map(d=>(
                <div key={d.id} onClick={()=>setSelDriver(d)}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:"var(--r)",border:`2px solid ${selDriver?.id===d.id?"var(--g1)":"var(--border2)"}`,background:selDriver?.id===d.id?"var(--cream)":"transparent",cursor:"pointer",transition:"all .13s"}}>
                  <div style={{width:38,height:38,borderRadius:"50%",overflow:"hidden",background:"var(--g1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {d.photo?<img src={d.photo} alt={d.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                     :<span style={{color:"white",fontWeight:800,fontSize:16}}>{d.name[0]}</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14}}>{d.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{d.vehicle} · {d.phone}</div>
                    <div style={{fontSize:10,color:"var(--dim)",marginTop:2}}>
                      Today: {d.todayTrips||0} trips · {fmt(d.todayEarnings||0)} earned
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:12,fontWeight:800,color:"var(--amber)"}}>⭐ {Number(d.rating||5).toFixed(1)}</div>
                    <div style={{fontSize:10,color:"var(--muted)"}}>{d.totalTrips||0} total trips</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setRecordDeliveryModal(null)} style={{flex:1,padding:"12px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>doRecordDelivery(recordDeliveryModal)} disabled={!selDriver}
                style={{flex:2,padding:"12px",borderRadius:"var(--r)",border:"none",background:selDriver?"var(--g1)":"var(--border)",color:selDriver?"white":"var(--muted)",fontFamily:"var(--fb)",fontWeight:800,fontSize:14,cursor:selDriver?"pointer":"not-allowed",transition:"all .14s"}}>
                ✅ Record Delivery {selDriver?`by ${selDriver.name}`:""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FLEET TAB ──────────────────────────────────────────────────────── */}
      {bizTab==="fleet"&&(
        <div>
          {/* Fleet sub-navigation */}
          {fleetTab!=="driver-detail"&&(
            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
              {[["roster","👨‍✈️ Roster"],["stats","📊 Daily Stats"],["applications",`📩 Applications${partnerRequests.filter(p=>p.status==="pending").length>0?" ("+partnerRequests.filter(p=>p.status==="pending").length+")":""}`]].map(([t,l])=>(
                <button key={t} onClick={()=>setFleetTab(t)}
                  style={{padding:"8px 16px",borderRadius:"var(--r)",border:`1.5px solid ${fleetTab===t?"var(--g1)":"var(--border2)"}`,background:fleetTab===t?"var(--g1)":"var(--cream)",color:fleetTab===t?"white":"var(--muted)",fontFamily:"var(--fb)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
              <button onClick={()=>{setEditDriver(null);setDf({...EMPTY_DRIVER});setDriverPhotoFile(null);setShowDriverForm(true);}}
                style={{marginLeft:"auto",padding:"8px 18px",borderRadius:"var(--r)",border:"none",background:"linear-gradient(135deg,var(--g1),var(--g3))",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"var(--sh)"}}>
                + Add Driver
              </button>
            </div>
          )}

          {/* ── Driver Add/Edit Form ── */}
          {showDriverForm&&(
            <div style={{background:"var(--white)",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh2)",marginBottom:18,border:"2px solid var(--border)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h3 style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:18,margin:0}}>{editDriver?"✏️ Edit Driver":"👨‍✈️ Add New Driver"}</h3>
                <button onClick={()=>{setShowDriverForm(false);setEditDriver(null);setDf({...EMPTY_DRIVER});}} style={{width:32,height:32,borderRadius:"50%",border:"1.5px solid var(--border2)",background:"var(--cream)",cursor:"pointer",fontSize:16}}>✕</button>
              </div>

              {/* Photo upload */}
              <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
                <div onClick={()=>document.getElementById("driverPhotoInput").click()}
                  style={{width:80,height:80,borderRadius:"50%",overflow:"hidden",background:"var(--g1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",border:"3px solid var(--border2)",position:"relative"}}>
                  {(driverPhotoFile||df.photo)
                    ?<img src={driverPhotoFile?URL.createObjectURL(driverPhotoFile):df.photo} alt="photo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    :<div style={{textAlign:"center"}}>
                       <div style={{fontSize:28}}>📷</div>
                       <div style={{fontSize:9,color:"rgba(255,255,255,.7)",marginTop:2}}>Add Photo</div>
                     </div>
                  }
                </div>
                <input id="driverPhotoInput" type="file" accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])setDriverPhotoFile(e.target.files[0]);}}/>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  ["name","Full Name *","text","e.g. Kwame Asante"],
                  ["phone","Phone *","tel","e.g. 024 123 4567"],
                  ["email","Email","email","e.g. kwame@email.com"],
                  ["licenseNo","License No.","text","e.g. GHA-DL-12345"],
                  ["idNumber","Ghana Card / ID No.","text","e.g. GHA-XXXXXX-X"],
                  ["emergencyContact","Emergency Contact","tel","e.g. 050 000 0000"],
                ].map(([k,lbl,type,ph])=>(
                  <div key={k} className="fgrp" style={{marginBottom:0}}>
                    <label style={{fontSize:11}}>{lbl}</label>
                    <input className="finp" type={type} placeholder={ph} value={df[k]||""} onChange={e=>setDf(f=>({...f,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <div className="fgrp" style={{marginTop:12}}>
                <label style={{fontSize:11}}>Home / Residential Address</label>
                <input className="finp" placeholder="e.g. Accra, Adenta, Block 5" value={df.address||""} onChange={e=>setDf(f=>({...f,address:e.target.value}))}/>
              </div>
              <div className="fgrp" style={{marginTop:12}}>
                <label style={{fontSize:11}}>Vehicle Type</label>
                <select className="finp" value={df.vehicle||"Motorbike 🏍️"} onChange={e=>setDf(f=>({...f,vehicle:e.target.value}))}>
                  {["Motorbike 🏍️","Bicycle 🚲","Car 🚗","Van 🚐","Tricycle (Aboboyaa) 🛺","Truck 🚚"].map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div style={{display:"flex",gap:10,marginTop:18}}>
                <button onClick={()=>{setShowDriverForm(false);setEditDriver(null);setDf({...EMPTY_DRIVER});}}
                  style={{flex:1,padding:"12px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontWeight:700,cursor:"pointer"}}>Cancel</button>
                <button onClick={saveDriver} disabled={savingDriver}
                  style={{flex:2,padding:"12px",borderRadius:"var(--r)",border:"none",background:"linear-gradient(135deg,var(--g1),var(--g3))",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:14,cursor:"pointer",opacity:savingDriver?.6:1}}>
                  {savingDriver?"Saving…":editDriver?"Save Changes ✅":"Add to Fleet 🚗"}
                </button>
              </div>
            </div>
          )}

          {/* ── ROSTER ── */}
          {fleetTab==="roster"&&!showDriverForm&&(
            <div>
              {fleetDrivers.length===0
                ?<div className="empty-st"><span className="ico">🚗</span><h3>No drivers yet</h3><p>Add your first driver to start tracking deliveries and revenue.</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {fleetDrivers.map(d=>{
                    const today=new Date().toISOString().split("T")[0];
                    const isActiveToday=d.lastActiveDate===today;
                    return (
                    <div key={d.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:16,boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                        <div style={{width:52,height:52,borderRadius:"50%",overflow:"hidden",background:"linear-gradient(135deg,var(--g1),var(--g3))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"2.5px solid var(--border2)"}}>
                          {d.photo?<img src={d.photo} alt={d.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                           :<span style={{color:"white",fontWeight:900,fontSize:20}}>{d.name[0]}</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:900,fontSize:16,color:"var(--ink)"}}>{d.name}</div>
                          <div style={{fontSize:12,color:"var(--muted)",marginTop:1}}>{d.vehicle} · {d.phone}</div>
                          <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,fontWeight:700,color:"var(--amber)"}}>⭐ {Number(d.rating||5).toFixed(1)} <span style={{color:"var(--dim)",fontWeight:400}}>({d.ratingCount||0} ratings)</span></span>
                            <span style={{fontSize:11,padding:"1px 8px",borderRadius:20,background:d.status==="active"?"rgba(74,222,128,.12)":"rgba(239,68,68,.1)",color:d.status==="active"?"var(--lime3)":"#ef4444",fontWeight:700}}>{d.status==="active"?"● Active":"● Inactive"}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                          <button onClick={()=>openDriverDetail(d)} style={{padding:"6px 12px",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer"}}>View →</button>
                          <button onClick={()=>{setEditDriver(d);setDf({name:d.name,phone:d.phone,email:d.email||"",vehicle:d.vehicle||"Motorbike 🏍️",licenseNo:d.licenseNo||"",idNumber:d.idNumber||"",address:d.address||"",emergencyContact:d.emergencyContact||"",photo:d.photo||""});setShowDriverForm(true);}} style={{padding:"6px 12px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"transparent",color:"var(--muted)",fontFamily:"var(--fb)",fontSize:11,cursor:"pointer"}}>Edit</button>
                        </div>
                      </div>

                      {/* Stats bar */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:"10px 0",borderTop:"1px solid var(--border2)"}}>
                        {[
                          {v:d.todayTrips||0, l:"Today's Trips", c:"var(--g1)", active:isActiveToday},
                          {v:fmt(d.todayEarnings||0), l:"Today's Revenue", c:"var(--amber2)", active:isActiveToday},
                          {v:d.totalTrips||0, l:"Total Trips", c:"var(--coral)"},
                          {v:fmt(d.totalEarnings||0), l:"Total Revenue", c:"var(--lime3)"},
                        ].map(({v,l,c,active})=>(
                          <div key={l} style={{textAlign:"center"}}>
                            <div style={{fontFamily:"var(--ff)",fontSize:15,fontWeight:900,color:c}}>{v}</div>
                            <div style={{fontSize:9,color:"var(--muted)",marginTop:1,lineHeight:1.2}}>{l}</div>
                            {active===false&&isActiveToday===false&&l.startsWith("Today")&&<div style={{fontSize:8,color:"var(--dim)"}}>not active</div>}
                          </div>
                        ))}
                      </div>

                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button onClick={()=>updateFleetDriver(d.id,{available:!d.available}).then(()=>toast(d.available?"Driver set offline":"Driver set available"))}
                          style={{flex:1,padding:"7px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:d.available?"rgba(74,222,128,.1)":"var(--cream)",color:d.available?"var(--lime3)":"var(--muted)",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {d.available?"🟢 Available":"⚫ Offline"}
                        </button>
                        <button onClick={()=>updateFleetDriver(d.id,{status:d.status==="active"?"suspended":"active"}).then(()=>toast("Driver status updated"))}
                          style={{flex:1,padding:"7px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {d.status==="active"?"⏸ Suspend":"▶ Reinstate"}
                        </button>
                        <button onClick={()=>removeDriver(d.id)}
                          style={{padding:"7px 12px",borderRadius:"var(--r)",border:"1.5px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.06)",color:"#ef4444",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          🗑
                        </button>
                      </div>
                    </div>
                  );})}
                </div>
              }
            </div>
          )}

          {/* ── DAILY STATS ── */}
          {fleetTab==="stats"&&(
            <div>
              {fleetDrivers.length===0
                ?<div className="empty-st"><span className="ico">📊</span><h3>No drivers yet</h3><p>Add drivers to see fleet stats.</p></div>
                :<>
                  {/* Fleet summary card */}
                  <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"18px 20px",marginBottom:16,boxShadow:"var(--sh2)"}}>
                    <div style={{color:"rgba(255,255,255,.7)",fontSize:12,fontWeight:700,marginBottom:4}}>FLEET OVERVIEW — TODAY</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                      {[
                        {v:fleetDrivers.filter(d=>d.lastActiveDate===new Date().toISOString().split("T")[0]).length, l:"Active Today"},
                        {v:fleetDrivers.reduce((s,d)=>s+(d.todayTrips||0),0), l:"Dispatches Today"},
                        {v:fmt(fleetDrivers.reduce((s,d)=>s+(d.todayEarnings||0),0)), l:"Revenue Today"},
                      ].map(({v,l})=>(
                        <div key={l} style={{textAlign:"center"}}>
                          <div style={{fontFamily:"var(--ff)",fontSize:22,fontWeight:900,color:"white"}}>{v}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,.65)",marginTop:2}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per driver today */}
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {fleetDrivers.map(d=>{
                      const today=new Date().toISOString().split("T")[0];
                      const active=d.lastActiveDate===today;
                      return(
                      <div key={d.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:"14px 16px",boxShadow:"var(--sh)",border:`1.5px solid ${active?"rgba(74,222,128,.3)":"var(--border2)"}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                          <div style={{width:36,height:36,borderRadius:"50%",overflow:"hidden",background:"var(--g1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {d.photo?<img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                             :<span style={{color:"white",fontWeight:800,fontSize:15}}>{d.name[0]}</span>}
                          </div>
                          <div style={{flex:1}}>
                            <span style={{fontWeight:800,fontSize:14}}>{d.name}</span>
                            <span style={{marginLeft:8,fontSize:10,padding:"1px 8px",borderRadius:20,background:active?"rgba(74,222,128,.12)":"rgba(100,100,100,.1)",color:active?"var(--lime3)":"var(--dim)",fontWeight:700}}>{active?"● Active today":"● Not active"}</span>
                          </div>
                          <button onClick={()=>openDriverDetail(d)} style={{padding:"5px 12px",borderRadius:"var(--r)",border:"none",background:"var(--cream2)",color:"var(--muted)",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer"}}>Details</button>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,borderTop:"1px solid var(--border2)",paddingTop:10}}>
                          {[
                            {v:d.todayTrips||0, l:"Trips Today", c:"var(--g1)"},
                            {v:fmt(d.todayEarnings||0), l:"Earned Today", c:"var(--amber2)"},
                            {v:d.totalTrips||0, l:"All-Time Trips", c:"var(--coral)"},
                            {v:fmt(d.totalEarnings||0), l:"All-Time Rev.", c:"var(--lime3)"},
                          ].map(({v,l,c})=>(
                            <div key={l} style={{textAlign:"center"}}>
                              <div style={{fontFamily:"var(--ff)",fontSize:15,fontWeight:900,color:c}}>{v}</div>
                              <div style={{fontSize:9,color:"var(--muted)",marginTop:1,lineHeight:1.2}}>{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );})}
                  </div>
                </>
              }
            </div>
          )}

          {/* ── DRIVER DETAIL VIEW ── */}
          {fleetTab==="driver-detail"&&selDriver&&(
            <div>
              <button onClick={()=>{setFleetTab("roster");setSelDriver(null);setDriverDeliveries([]);setDriverDailyStats([]);}}
                style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,padding:"7px 14px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ← Back to Fleet
              </button>

              {/* Driver profile header */}
              <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"20px",marginBottom:16,boxShadow:"var(--sh2)"}}>
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
                  <div style={{width:68,height:68,borderRadius:"50%",overflow:"hidden",border:"3px solid rgba(255,255,255,.3)",flexShrink:0}}>
                    {selDriver.photo?<img src={selDriver.photo} alt={selDriver.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                     :<div style={{width:"100%",height:"100%",background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,color:"white"}}>{selDriver.name[0]}</div>}
                  </div>
                  <div>
                    <div style={{fontFamily:"var(--ff)",fontSize:20,fontWeight:900,color:"white"}}>{selDriver.name}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:2}}>{selDriver.vehicle} · {selDriver.phone}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>⭐ {Number(selDriver.rating||5).toFixed(1)} rating · {selDriver.ratingCount||0} reviews</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                  {[
                    {icon:"🪪",label:"License No.",val:selDriver.licenseNo||"Not set"},
                    {icon:"🆔",label:"ID Number",val:selDriver.idNumber||"Not set"},
                    {icon:"📞",label:"Emergency",val:selDriver.emergencyContact||"Not set"},
                    {icon:"🏠",label:"Address",val:selDriver.address||"Not set"},
                  ].map(({icon,label,val})=>(
                    <div key={label} style={{background:"rgba(255,255,255,.12)",borderRadius:"var(--r)",padding:"9px 12px"}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,.6)",marginBottom:2}}>{icon} {label}</div>
                      <div style={{fontSize:12,fontWeight:700,color:"white"}}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats summary */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
                {[
                  {v:selDriver.todayTrips||0, l:"Today Trips", c:"var(--g1)"},
                  {v:fmt(selDriver.todayEarnings||0), l:"Today Rev.", c:"var(--amber2)"},
                  {v:selDriver.totalTrips||0, l:"Total Trips", c:"var(--coral)"},
                  {v:fmt(selDriver.totalEarnings||0), l:"Total Rev.", c:"var(--lime3)"},
                ].map(({v,l,c})=>(
                  <div key={l} style={{background:"var(--white)",borderRadius:"var(--r)",padding:"12px 8px",textAlign:"center",boxShadow:"var(--sh)"}}>
                    <div style={{fontFamily:"var(--ff)",fontSize:17,fontWeight:900,color:c}}>{v}</div>
                    <div style={{fontSize:9,color:"var(--muted)",marginTop:2,lineHeight:1.2}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Daily breakdown */}
              {driverDailyStats.length>0&&(
                <div style={{marginBottom:16}}>
                  <h4 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:15,marginBottom:10}}>📅 Daily Breakdown</h4>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {driverDailyStats.slice(0,14).map(day=>(
                      <div key={day.date} style={{background:"var(--white)",borderRadius:"var(--r)",padding:"10px 14px",boxShadow:"var(--sh)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:13}}>{day.date===new Date().toISOString().split("T")[0]?"Today":day.date}</span>
                          <span style={{marginLeft:10,fontSize:11,color:"var(--muted)"}}>{day.trips} trip{day.trips!==1?"s":""}</span>
                        </div>
                        <span style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:14,color:"var(--amber2)"}}>{fmt(day.earnings)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery history */}
              <h4 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:15,marginBottom:10}}>📦 Delivery History</h4>
              {driverDeliveries.length===0
                ?<div className="empty-st"><span className="ico">📦</span><h3>No deliveries yet</h3></div>
                :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {driverDeliveries.map(del=>(
                    <div key={del.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:"14px",boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontFamily:"var(--ff)",fontWeight:800,color:"var(--g1)",fontSize:14}}>{del.orderId}</span>
                        <span style={{fontSize:11,color:"var(--dim)"}}>{del.date}</span>
                      </div>
                      <div style={{fontSize:12,color:"var(--muted)",marginBottom:4}}>{del.customerName} · {del.address}</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>{(del.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:14}}>{fmt(del.total)}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {del.rated
                            ?<span style={{fontSize:12,color:"var(--amber)",fontWeight:700}}>⭐ {del.rating}/5 — "{del.ratingComment||"No comment"}"</span>
                            :<span style={{fontSize:11,color:"var(--dim)"}}>Not rated yet</span>
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          )}
        </div>
      )}


          {/* ── APPLICATIONS ── */}
          {fleetTab==="applications"&&(
            <div>
              {partnerRequests.length===0
                ?<div className="empty-st"><span className="ico">📩</span><h3>No applications yet</h3><p>Independent riders in your region will appear here when they apply to partner with your business.</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {partnerRequests.map(req=>(
                    <div key={req.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:16,boxShadow:"var(--sh)",border:`1.5px solid ${req.status==="pending"?"rgba(251,191,36,.35)":req.status==="approved"?"rgba(74,222,128,.3)":"rgba(239,68,68,.2)"}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                        <div style={{width:46,height:46,borderRadius:"50%",overflow:"hidden",background:"var(--g1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {req.riderPhoto?<img src={req.riderPhoto} alt={req.riderName} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                           :<span style={{color:"white",fontWeight:800,fontSize:18}}>{(req.riderName||"R")[0]}</span>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:900,fontSize:15}}>{req.riderName}</div>
                          <div style={{fontSize:12,color:"var(--muted)"}}>{req.vehicle} · {req.riderPhone}</div>
                          <div style={{display:"flex",gap:8,marginTop:3}}>
                            <span style={{fontSize:11,color:"var(--amber)",fontWeight:700}}>⭐ {Number(req.rating||5).toFixed(1)}</span>
                            <span style={{fontSize:11,color:"var(--muted)"}}>· {req.trips||0} trips</span>
                            <span style={{fontSize:10,padding:"1px 8px",borderRadius:20,fontWeight:700,
                              background:req.status==="pending"?"rgba(251,191,36,.12)":req.status==="approved"?"rgba(74,222,128,.12)":"rgba(239,68,68,.1)",
                              color:req.status==="pending"?"var(--amber)":req.status==="approved"?"var(--lime3)":"#ef4444"}}>
                              {req.status==="pending"?"⏳ Pending":req.status==="approved"?"✅ Approved":"✕ Rejected"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {req.status==="pending"&&(
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={async()=>{await respondPartnership(req.id,"approved");toast("Rider approved! They can now work with you 🎉");}}
                            style={{flex:1,padding:"9px",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                            ✅ Approve
                          </button>
                          <button onClick={async()=>{await respondPartnership(req.id,"rejected");toast("Application rejected");}}
                            style={{flex:1,padding:"9px",borderRadius:"var(--r)",border:"1.5px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.06)",color:"#ef4444",fontFamily:"var(--fb)",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                            ✕ Decline
                          </button>
                        </div>
                      )}
                      {req.status==="approved"&&<p style={{fontSize:11,color:"var(--lime3)",fontWeight:600,margin:0}}>✅ This rider is approved to work with your business. They'll appear in your rider assignment list.</p>}
                      {req.status==="rejected"&&<p style={{fontSize:11,color:"var(--muted)",margin:0}}>Application declined.</p>}
                    </div>
                  ))}
                </div>
              }
            </div>
          )}
      {/* DISPATCH LOG */}
      {bizTab==="dispatch"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{fontFamily:"var(--ff)",fontSize:20,fontWeight:900}}>🚚 Dispatch Log</h2>
          <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>{dispatchLogs.length} records</span>
        </div>
        {dispatchLogs.length===0
          ?<div className="empty-st"><span className="ico">🚚</span><h3>No dispatches yet</h3><p>Records appear here when you assign riders or mark walk-in pickups.</p></div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {dispatchLogs.map(log=>(
              <div key={log.id} style={{background:"white",borderRadius:"var(--r2)",padding:16,boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <span style={{fontFamily:"var(--ff)",fontSize:16,fontWeight:800,color:"var(--g1)"}}>{log.orderId}</span>
                    <span style={{marginLeft:9,padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:800,
                      background:log.deliveryType==="walkin"?"rgba(74,222,128,.12)":"rgba(59,158,255,.1)",
                      color:log.deliveryType==="walkin"?"var(--lime3)":"var(--blue)"}}>
                      {log.deliveryType==="walkin"?"🚶 Walk-in":"🏍️ Dispatched"}
                    </span>
                  </div>
                  <span style={{fontSize:11,color:"var(--dim)"}}>{dtstr(log.dispatchedAt||log.timestamp)}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,marginBottom:8}}>
                  <div><span style={{color:"var(--muted)"}}>Customer: </span><strong>{log.customerName}</strong></div>
                  <div><span style={{color:"var(--muted)"}}>Phone: </span><a href={`tel:${log.customerPhone}`} style={{color:"var(--g1)",fontWeight:700}}>{log.customerPhone}</a></div>
                  {log.riderName&&<div><span style={{color:"var(--muted)"}}>Rider: </span><strong>🏍️ {log.riderName}</strong></div>}
                  {log.riderPhone&&<div><span style={{color:"var(--muted)"}}>Rider Tel: </span><a href={`tel:${log.riderPhone}`} style={{color:"var(--g1)",fontWeight:700}}>{log.riderPhone}</a></div>}
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>📍 {log.address}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>{(log.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:"1px solid var(--border2)"}}>
                  <div style={{fontSize:12}}>
                    <span style={{color:"var(--muted)"}}>Subtotal: </span><strong>{fmt(log.total)}</strong>
                    {log.riderFee>0&&<span style={{marginLeft:8,color:"var(--muted)"}}>+ Rider fee: <strong style={{color:"var(--coral)"}}>{fmt(log.riderFee)}</strong></span>}
                  </div>
                  {log.riderPhone&&<a href={`https://wa.me/${(log.riderPhone||"").replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:"#25d366",color:"white",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                    💬 WhatsApp Rider
                  </a>}
                </div>
              </div>
            ))}
          </div>
        }
      </div>}

      {/* PRODUCTS */}
      {bizTab==="products"&&<>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:13}}>
          <button className="btn-onboard" onClick={()=>{setEditProd(null);setPf({name:"",price:"",emoji:"📦",image:"",category:"General",description:"",discountPrice:"",discountTag:""});setShowProd(true);}}>+ Add Product</button>
        </div>
        {(biz.products||[]).length===0?<div className="empty-st"><span className="ico">📦</span><h3>No products yet</h3><p>Add your first product to start selling.</p></div>:(
          <div className="pm-grid">
            {(biz.products||[]).map(p=>(
              <div key={p.id} className="pm-card">
                {p.image?<img src={p.image} className="pm-img" alt={p.name} onError={e=>e.target.style.display="none"}/>:<div className="pm-img-ph"><span style={{fontSize:36}}>{p.emoji}</span></div>}
                <div className="pm-body">
                  <div className="pm-head">
                    <span className="pm-emo" style={{display:p.image?"none":"block"}}>{p.emoji}</span>
                    <div className="pm-avail" onClick={()=>toggleProd(p.id,p.available)}><div className="av-dot" style={{background:p.available?"var(--lime2)":"var(--muted)"}}/><span style={{fontSize:10,fontWeight:700,color:p.available?"var(--lime3)":"var(--muted)"}}>{p.available?"Live":"Off"}</span></div>
                  </div>
                  {p.discountTag&&<div style={{display:"inline-flex",alignItems:"center",gap:3,background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"white",fontSize:9,fontWeight:900,padding:"2px 7px",borderRadius:20,marginBottom:4}}>🏷️ {p.discountTag}</div>}
                  <div className="pm-name">{p.name}</div>
                  <div style={{fontSize:10,color:"var(--dim)",marginBottom:5}}>{p.category}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:9}}>
                    {p.discountPrice&&Number(p.discountPrice)<Number(p.price)&&<span style={{fontSize:11,color:"var(--dim)",textDecoration:"line-through"}}>{fmt(p.price)}</span>}
                    <div className="pm-price" style={{margin:0}}>{fmt(p.discountPrice&&Number(p.discountPrice)<Number(p.price)?p.discountPrice:p.price)}</div>
                  </div>
                  <div className="pm-acts">
                    <button className="btn-sm bs-edit" onClick={()=>{setEditProd(p);setPf({name:p.name,price:p.price,emoji:p.emoji,image:p.image||"",category:p.category,description:p.description||"",discountPrice:p.discountPrice||"",discountTag:p.discountTag||""});setShowProd(true);}}>Edit</button>
                    <button className="btn-sm bs-del" onClick={()=>delProd(p.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </>}

      {/* SHOP PROFILE */}
      {bizTab==="shop"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>

        {/* Logo Upload */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:4}}>🖼️ Business Logo</h3>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Upload your logo — it appears on your shop page and on all receipts customers receive.</p>
          <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{width:100,height:100,borderRadius:18,border:"2px solid var(--border2)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--cream)",fontSize:36}}>
              {shopForm.logo
                ? <img src={shopForm.logo} alt="logo preview" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                : catEmo(biz.category)
              }
            </div>
            <div style={{flex:1,minWidth:200}}>
              <ImageUpload
                value={shopForm.logo}
                onChange={url=>setSF("logo",url)}
                path={`logos/${biz.id}`}
                label="Upload Logo"
                hint="JPG, PNG — recommended 400×400px"
                previewHeight={100}
              />
            </div>
          </div>
        </div>

        {/* Description & Address */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:14}}>📝 About Your Business</h3>
          <div className="fgrp"><label>Description</label>
            <textarea className="finp" rows={3} style={{resize:"none"}} placeholder="Tell customers what you sell, your story, and why they should choose you…" value={shopForm.description} onChange={e=>setSF("description",e.target.value)}/>
          </div>
          <div className="fgrp"><label>Physical Address</label>
            <input className="finp" placeholder="e.g. Shop 12, Accra Mall, Spintex Road" value={shopForm.address} onChange={e=>setSF("address",e.target.value)}/>
          </div>
        </div>

        {/* GPS Location */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:4}}>📍 Business GPS Location</h3>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Riders will use this to navigate directly to your business for pickups. Tap the button below while at your business location.</p>
          <div className="gps-box">
            {shopForm.locationLat && shopForm.locationLng ? (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Saved Location:</div>
                <div className="gps-coords">
                  <span className="gps-val">📍 {shopForm.locationLat}, {shopForm.locationLng}</span>
                  <a href={`https://maps.google.com/?q=${shopForm.locationLat},${shopForm.locationLng}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--blue)",fontWeight:700}}>View on Map →</a>
                </div>
              </div>
            ) : (
              <div style={{fontSize:12,color:"var(--dim)",marginBottom:10}}>No location set yet. Use the button below to capture your current location.</div>
            )}
            <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
              <button className="btn-gps" onClick={getGPS} disabled={gpsLoading}>
                {gpsLoading?<><div className="ld-spin" style={{width:14,height:14,borderWidth:2}}/>Getting location…</>:"📍 Use My Current Location"}
              </button>
              {shopForm.locationLat&&<button className="btn-gps" style={{borderColor:"var(--red)",color:"var(--red)"}} onClick={()=>{setSF("locationLat","");setSF("locationLng","");}}>✕ Clear</button>}
            </div>
            <div style={{marginTop:10}}>
              <div style={{fontSize:10,fontWeight:800,color:"var(--muted)",textTransform:"uppercase",marginBottom:6}}>Or enter manually</div>
              <div style={{display:"flex",gap:9}}>
                <input className="finp" style={{fontSize:12}} placeholder="Latitude e.g. 5.5502" value={shopForm.locationLat} onChange={e=>setSF("locationLat",e.target.value)}/>
                <input className="finp" style={{fontSize:12}} placeholder="Longitude e.g. -0.2174" value={shopForm.locationLng} onChange={e=>setSF("locationLng",e.target.value)}/>
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:14}}>📞 Customer Support Contacts</h3>
          <div className="frow2">
            <div className="fgrp"><label>📱 Phone Number</label><input className="finp" placeholder="024 000 0000" value={shopForm.phone} onChange={e=>setSF("phone",e.target.value)}/></div>
            <div className="fgrp"><label>💚 WhatsApp Number</label><input className="finp" placeholder="024 000 0000" value={shopForm.whatsapp} onChange={e=>setSF("whatsapp",e.target.value)}/></div>
            <div className="fgrp"><label>📧 Email Address</label><input className="finp" placeholder="support@yourbusiness.com" value={shopForm.email} onChange={e=>setSF("email",e.target.value)}/></div>
            <div className="fgrp"><label>📘 Facebook Page</label><input className="finp" placeholder="facebook.com/yourbusiness" value={shopForm.facebook} onChange={e=>setSF("facebook",e.target.value)}/></div>
            <div className="fgrp"><label>📸 Instagram Handle</label><input className="finp" placeholder="@yourbusiness" value={shopForm.instagram} onChange={e=>setSF("instagram",e.target.value)}/></div>
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:14}}>💳 Accepted Payment Methods</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:9}}>
            {PAY_OPTS.map(p=>(
              <div key={p.v} onClick={()=>togglePayment(p.v)}
                style={{padding:"10px 14px",borderRadius:"var(--r)",border:`2px solid ${shopForm.acceptedPayments.includes(p.v)?"var(--g1)":"var(--border2)"}`,background:shopForm.acceptedPayments.includes(p.v)?"var(--cream)":"transparent",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .13s",display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${shopForm.acceptedPayments.includes(p.v)?"var(--g1)":"var(--border)"}`,background:shopForm.acceptedPayments.includes(p.v)?"var(--g1)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {shopForm.acceptedPayments.includes(p.v)&&<span style={{color:"white",fontSize:11,fontWeight:900}}>✓</span>}
                </div>
                {p.label}
              </div>
            ))}
          </div>
        </div>

        {/* Delivery */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:6}}>🏍️ Delivery Information</h3>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:14,lineHeight:1.6}}>
            Set your delivery fee and any notes for customers. This appears on your shop page before customers place orders.
          </p>

          {/* NB disclaimer shown to customers */}
          <div style={{background:"rgba(245,158,11,.08)",border:"1.5px solid rgba(245,158,11,.25)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:13,color:"var(--amber2)",marginBottom:4}}>📢 Customer Notice Preview</div>
            <div style={{fontSize:12,color:"#555",lineHeight:1.7}}>
              This is what customers will see on your shop page:
            </div>
            <div style={{marginTop:8,background:"white",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--ink)",border:"1px solid var(--border2)",lineHeight:1.7}}>
              <strong>🏍️ Delivery Fee: </strong>
              {shopForm.riderFee ? `GH₵ ${shopForm.riderFee}` : "Free / Not set"}
              {shopForm.deliveryNote && <><br/><strong>📌 NB: </strong>{shopForm.deliveryNote}</>}
              {!shopForm.deliveryNote && <><br/><span style={{color:"var(--dim)"}}>No delivery note set — add one below</span></>}
            </div>
          </div>

          <div className="frow2">
            <div className="fgrp">
              <label>Rider Delivery Fee (GH₵)
                <span style={{fontSize:10,fontWeight:500,color:"var(--dim)",marginLeft:6}}>— type any amount e.g. 10, 15, 20</span>
              </label>
              <input className="finp" type="number" min="0" step="0.50"
                placeholder="e.g. 15"
                value={shopForm.riderFee}
                onChange={e=>setSF("riderFee",e.target.value)}/>
              <div style={{fontSize:11,color:"var(--dim)",marginTop:4}}>💡 Leave blank or 0 for free delivery</div>
            </div>
            <div className="fgrp">
              <label>📌 NB / Delivery Note to Customers
                <span style={{fontSize:10,fontWeight:500,color:"var(--dim)",marginLeft:6}}>— shown on your shop page</span>
              </label>
              <input className="finp"
                placeholder="e.g. Delivery within Accra only. Fee may vary by distance."
                value={shopForm.deliveryNote}
                onChange={e=>setSF("deliveryNote",e.target.value)}/>
              <div style={{fontSize:11,color:"var(--dim)",marginTop:4}}>
                💡 You can mention distance limits, zones, or any delivery conditions here
              </div>
            </div>
          </div>

          {/* Delivery zones helper */}
          <div style={{marginTop:12,background:"var(--cream)",borderRadius:8,padding:"10px 14px",border:"1px solid var(--border2)"}}>
            <div style={{fontWeight:700,fontSize:12,color:"var(--g1)",marginBottom:6}}>📝 Example delivery notes you can use:</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {[
                "Delivery within 5km of shop only",
                "Fee varies by distance — contact us first",
                "Free delivery on orders above GH₵100",
                "Same-day delivery within the municipality",
                "Delivery fee negotiable for bulk orders",
                "We deliver across the region — fee based on location",
              ].map(ex=>(
                <button key={ex} onClick={()=>setSF("deliveryNote",ex)}
                  style={{padding:"4px 10px",borderRadius:20,border:"1px solid var(--border2)",background:"white",fontSize:11,color:"var(--muted)",cursor:"pointer",fontFamily:"var(--fb)"}}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={saveShopProfile} disabled={savingProfile}
          style={{padding:"14px 0",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontSize:14,fontWeight:800,cursor:"pointer",width:"100%",marginBottom:16}}>
          {savingProfile?"Saving…":"💾 Save Shop Profile"}
        </button>

        {/* Share link section */}
        <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"18px",marginBottom:20,boxShadow:"var(--sh2)"}}>
          <div style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:16,color:"white",marginBottom:4}}>🔗 Promote Your Shop</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginBottom:14}}>Share this link with customers. They can browse your products and order directly — no app needed.</div>
          <ShareLinkWidget url={shopUrl} label={biz.name}/>
        </div>
      </div>}

      {/* INFO */}
      {bizTab==="info"&&<div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
        <h3 style={{fontFamily:"var(--ff)",fontSize:17,marginBottom:14}}>Business Info</h3>
        {[["Name",biz.name],["Category",biz.category],["Region",biz.region],["Owner",biz.ownerName],["Username","@"+(biz.ownerUsername||"—")],["Plan",PLANS[biz.plan||"free"]?.label],["Status",biz.status||"active"],["Phone",biz.contactPhone||"—"],["WhatsApp",biz.whatsapp||"—"],["Email",biz.contactEmail||"—"],["GPS",biz.location?`${biz.location.lat}, ${biz.location.lng}`:"Not set"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid var(--border2)",fontSize:13}}><span style={{color:"var(--muted)",fontWeight:600}}>{k}</span><span style={{fontWeight:700}}>{v||"—"}</span></div>
        ))}
      </div>}

      {/* SUBSCRIPTION */}
      {bizTab==="sub"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Current Plan Banner */}
        <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"22px 24px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:38}}>💎</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"var(--ff)",fontSize:20,fontWeight:900,color:"white"}}>Current Plan</div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6,flexWrap:"wrap"}}>
              <span style={{background:PLANS[biz.plan||"free"]?.bg,color:PLANS[biz.plan||"free"]?.color,padding:"4px 14px",borderRadius:20,fontSize:13,fontWeight:800}}>{PLANS[biz.plan||"free"]?.label}</span>
              <span style={{color:"rgba(255,255,255,.55)",fontSize:13}}>·</span>
              <span style={{color:"rgba(255,255,255,.7)",fontSize:13}}>{PLANS[biz.plan||"free"]?.desc}</span>
            </div>
          </div>
        </div>

        {/* Plan Cards */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:22,boxShadow:"var(--sh)"}}>
          <div style={{fontFamily:"var(--ff)",fontSize:17,fontWeight:900,marginBottom:4}}>Upgrade Your Plan</div>
          <div style={{fontSize:12,color:"var(--muted)",marginBottom:18}}>Pay securely with MoMo, Vodafone Cash, AirtelTigo or Card via Hubtel.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
            {[
              {key:"free",    ico:"🎁"},
              {key:"monthly", ico:"📅"},
              {key:"quarter", ico:"📦", badge:"SAVE GH₵50"},
              {key:"biannual",ico:"⚡", badge:"POPULAR"},
              {key:"annual",  ico:"👑", badge:"BEST VALUE"},
            ].map(({key,ico,badge})=>{
              const p = PLANS[key];
              const isCurrent = (biz.plan||"free")===key;
              const isLoading = hubtelLoading===key;
              return (
                <div key={key} style={{border:`2px solid ${isCurrent?"var(--g1)":p.color+"44"}`,borderRadius:"var(--r2)",padding:"18px 14px",textAlign:"center",position:"relative",background:isCurrent?"var(--cream)":"white",transition:"transform .16s,box-shadow .16s",cursor:"pointer"}}
                  onMouseEnter={e=>{if(!isCurrent){e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="var(--sh2)";}}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                  {isCurrent&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"var(--g1)",color:"white",fontSize:9,fontWeight:900,padding:"3px 11px",borderRadius:20,whiteSpace:"nowrap"}}>✓ CURRENT</div>}
                  {badge&&!isCurrent&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:p.color,color:"white",fontSize:9,fontWeight:900,padding:"3px 11px",borderRadius:20,whiteSpace:"nowrap"}}>{badge}</div>}
                  <div style={{fontSize:26,marginBottom:7}}>{ico}</div>
                  <div style={{fontFamily:"var(--ff)",fontSize:15,fontWeight:900,color:p.color,marginBottom:4}}>{p.label}</div>
                  <div style={{fontFamily:"var(--ff)",fontSize:24,fontWeight:900,color:"var(--ink)",marginBottom:2}}>{p.price===0?"Free":"GH₵"+p.price.toLocaleString()}</div>
                  <div style={{fontSize:11,color:"var(--dim)",marginBottom:4}}>{p.price===0?"1 month · no card":p.duration+(p.monthly!==p.price?" · GH₵"+p.monthly+"/mo":"")}</div>
                  <div style={{fontSize:11,color:p.color,fontWeight:700,marginBottom:14,minHeight:14}}>{p.desc}</div>
                  {p.price===0
                    ? <div style={{padding:"9px 0",borderRadius:"var(--r)",background:"var(--cream2)",fontSize:12,fontWeight:700,color:"var(--muted)"}}>{isCurrent?"✓ Active":"Free"}</div>
                    : <button
                        disabled={isCurrent||!!hubtelLoading}
                        onClick={()=>!isCurrent&&initiateSubscriptionPayment(key)}
                        style={{width:"100%",padding:"10px 0",borderRadius:"var(--r)",border:"none",background:isCurrent?"var(--g1)":hubtelLoading?p.color+"88":p.color,color:"white",fontFamily:"var(--fb)",fontSize:13,fontWeight:800,cursor:isCurrent||hubtelLoading?"not-allowed":"pointer",transition:"opacity .15s",opacity:isCurrent||hubtelLoading?0.7:1}}>
                        {isCurrent?"✓ Current":(isLoading?"Redirecting…":"Pay with Hubtel →")}
                      </button>
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Methods Info */}
        <div style={{background:"white",borderRadius:"var(--r2)",padding:18,boxShadow:"var(--sh)"}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>💳 Accepted Payment Methods</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
            {["📱 MTN MoMo","📱 Vodafone Cash","📱 AirtelTigo Money","💳 Visa / Mastercard"].map(m=>(
              <div key={m} style={{padding:"7px 14px",borderRadius:30,background:"var(--cream)",border:"1px solid var(--border2)",fontSize:12,fontWeight:600,color:"var(--ink)"}}>{m}</div>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:12}}>Payments are processed securely by Hubtel. You will be redirected to the Hubtel checkout page and returned here after payment.</div>
        </div>
      </div>}

      {/* Product Modal */}
      {showProd&&<div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setShowProd(false)}>
        <div className="modal-box">
          <h3>{editProd?"Edit Product":"Add Product"}</h3>
          <ImageUpload
            value={pf.image}
            onChange={url=>setPf(f=>({...f,image:url}))}
            path={`products/${biz.id}_${editProd?.id||"new"}`}
            label="Product Photo (JPG recommended)"
            hint="Upload a clear JPG photo so customers can see exactly what they're buying"
            previewHeight={150}
          />
          <div style={{height:12}}/>
          <div className="frow2">
            <div className="fgrp"><label>Product Name *</label><input className="finp" placeholder="e.g. Jollof Rice" value={pf.name} onChange={e=>setPf(f=>({...f,name:e.target.value}))}/></div>
            <div className="fgrp"><label>Regular Price (GH₵) *</label><input className="finp" type="number" placeholder="e.g. 25" value={pf.price} onChange={e=>setPf(f=>({...f,price:e.target.value}))}/></div>
            <div className="fgrp"><label>🏷️ Promo / Discount Price (GH₵)</label><input className="finp" type="number" placeholder="e.g. 20 — leave blank if no promo" value={pf.discountPrice} onChange={e=>setPf(f=>({...f,discountPrice:e.target.value}))}/></div>
            <div className="fgrp"><label>🏷️ Discount Tag Label</label><input className="finp" placeholder='e.g. "20% OFF" or "Flash Sale"' value={pf.discountTag} onChange={e=>setPf(f=>({...f,discountTag:e.target.value}))}/></div>
            <div className="fgrp"><label>Emoji (fallback icon)</label><input className="finp" value={pf.emoji} onChange={e=>setPf(f=>({...f,emoji:e.target.value}))}/></div>
            <div className="fgrp"><label>Category</label><input className="finp" placeholder="e.g. Rice Dishes" value={pf.category} onChange={e=>setPf(f=>({...f,category:e.target.value}))}/></div>
          </div>
          <div className="fgrp"><label>Description (optional)</label><textarea className="finp" rows={2} style={{resize:"none"}} placeholder="Short description customers will see" value={pf.description} onChange={e=>setPf(f=>({...f,description:e.target.value}))}/></div>
          {pf.discountPrice&&Number(pf.discountPrice)<Number(pf.price)&&<div style={{background:"rgba(239,68,68,.06)",border:"1.5px solid rgba(239,68,68,.2)",borderRadius:"var(--r)",padding:"9px 13px",fontSize:12,color:"#dc2626",marginBottom:6}}>🏷️ Customers will see <strong>{fmt(pf.discountPrice)}</strong> (was <strong>{fmt(pf.price)}</strong>) — saving <strong>{fmt(pf.price-pf.discountPrice)}</strong></div>}
          <div className="macts">
            <button className="mact-sec" onClick={()=>setShowProd(false)}>Cancel</button>
            <button className="mact-pri" onClick={saveProd} disabled={saving}>{saving?"Saving…":editProd?"Save Changes":"Add Product"}</button>
          </div>
        </div>
      </div>}

      {/* Rider Modal */}
      {riderModal&&<div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setRiderModal(null)}>
        <div className="modal-box">
          <h3>🏍️ Assign a Rider</h3>
          {riders.length===0?<p style={{textAlign:"center",color:"var(--muted)",fontSize:13,padding:20}}>No riders online in {biz.region} right now.</p>:
            riders.map(r=>(
              <div key={r.id} style={{marginBottom:10}}>
                <div className={`rider-opt ${selRider===r.id?"sel":""}`} onClick={()=>setSelRider(r.id)}
                  style={{marginBottom:0,borderRadius:"var(--r) var(--r) 0 0"}}>
                  <span className="ro2-ico">🏍️</span>
                  <div style={{flex:1}}>
                    <div className="ro2-name">{r.name}</div>
                    <div className="ro2-det">{r.vehicle} · {r.phone}</div>
                  </div>
                  <div className="ro2-rat">⭐ {Number(r.rating||5).toFixed(1)}</div>
                  {selRider===r.id&&<span style={{color:"var(--g1)",fontSize:18,marginLeft:6}}>✓</span>}
                </div>
                {/* Contact buttons */}
                <div style={{display:"flex",gap:6,padding:"6px 10px",background:"var(--cream2)",borderRadius:"0 0 var(--r) var(--r)",border:"1px solid var(--border2)",borderTop:"none",flexWrap:"wrap"}}>
                  <span style={{fontSize:10,color:"var(--muted)",fontWeight:700,alignSelf:"center"}}>Alert:</span>
                  {r.phone&&<a href={`tel:${r.phone}`} onClick={e=>e.stopPropagation()}
                    style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:20,background:"rgba(59,158,255,.12)",color:"var(--blue)",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                    📞 Call
                  </a>}
                  {r.phone&&<a href={`https://wa.me/${(r.phone||"").replace(/[^\d]/g,"").replace(/^0/,"233")}?text=${encodeURIComponent("Hi "+r.name+", a delivery job is ready for you at "+biz.name+". Please come to collect the order.")}`}
                    target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                    style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:20,background:"rgba(37,211,102,.15)",color:"#16a34a",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                    💬 WhatsApp
                  </a>}
                  {r.phone&&<a href={`sms:${r.phone}?body=${encodeURIComponent("Hi "+r.name+", delivery job ready at "+biz.name+".")}`}
                    onClick={e=>e.stopPropagation()}
                    style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:20,background:"rgba(168,85,247,.12)",color:"var(--purple)",fontSize:11,fontWeight:700,textDecoration:"none"}}>
                    ✉️ SMS
                  </a>}
                </div>
              </div>
            ))
          }
          <div className="macts">
            <button className="mact-sec" onClick={()=>setRiderModal(null)}>Cancel</button>
            <button className="mact-pri" disabled={!selRider} onClick={()=>assignRider(riderModal)}>Assign Rider</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RIDER APP  —  Full tabbed dashboard
// ══════════════════════════════════════════════════════════════════════════════
function RiderApp({user, profile, toast}) {
  const [rider,     setRider]    = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [myOrders,  setMyOrders] = useState([]);
  const [availJobs, setAvailJobs]= useState([]);
  const [businesses,setBusinesses]=useState([]);
  const [riderTab,  setRiderTab] = useState("dashboard");
  const [hubtelLoading, setHubtelLoading] = useState(null);

  async function initiateRiderSubscriptionPayment(planKey) {
    const plan = RIDER_PLANS[planKey];
    if (!plan || plan.price === 0) { toast("Free plan — no payment needed", "warn"); return; }
    setHubtelLoading(planKey);
    try {
      const clientRef = `RIDER-${rider.id||user.uid}-${planKey}-${Date.now()}`;
      const res = await fetch("https://us-central1-localbizgh.cloudfunctions.net/initiateHubtelCheckout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount:          plan.price,
          description:     `LocalBiz GH Rider ${plan.label} Subscription — ${profile?.name||"Rider"}`,
          clientReference: clientRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Payment error ${res.status}`);
      if (!data.checkoutUrl) throw new Error("No checkout URL returned");
      // Save clientRef to Firestore so we can confirm on return
      window.location.href = data.checkoutUrl;
    } catch(e) {
      toast("Payment failed: " + e.message, "error");
      setHubtelLoading(null);
    }
  }
  const [history,   setHistory]  = useState([]);
  const [partnerships, setPartnerships] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [pf, setPf] = useState({});
  const [savingPf, setSavingPf] = useState(false);

  useEffect(()=>{ if(!user)return; return listenMyRiderProfile(user.uid,r=>{setRider(r);setLoading(false);}); },[user]);
  useEffect(()=>{
    if(!rider)return;
    const u1=listenRiderOrders(rider.id, setMyOrders);
    const u2=listenAvailableJobs(rider.region, j=>setAvailJobs(j.filter(x=>!x.riderId)));
    const u3=listenRiderHistory(rider.id, user.uid, setHistory);
    const u4=listenRiderPartnerships(rider.id, setPartnerships);
    return()=>{u1();u2();u3();u4();};
  },[rider?.id,rider?.region]);
  useEffect(()=>listenBusinesses(setBusinesses),[]);

  const getBizLocation = bizId => { const b=businesses.find(x=>x.id===bizId); return b?.location||null; };

  async function toggleAvail(){ try{await updateRider(rider.id,{available:!rider.available});toast(rider.available?"You're offline":"You're online! 🏍️");}catch{toast("Failed","error");} }
  async function acceptJob(o){ try{await updateOrderStatus(o.id,"dispatched",{riderId:rider.id,riderName:rider.name,riderPhone:rider.phone});toast("Job accepted! 🚀");}catch{toast("Failed","error");} }
  async function confirmDel(oid){ try{await updateOrderStatus(oid,"delivered");toast("Delivered! Well done ✅");}catch{toast("Failed","error");} }

  async function applyToBiz(biz){
    try{
      await requestPartnership(rider.id, rider, biz.id, biz.name);
      toast(`Application sent to ${biz.name}! 📩`);
    }catch(e){toast(e.message||"Failed","error");}
  }

  async function saveProfile(){
    setSavingPf(true);
    try{
      await updateRider(rider.id,{
        name: pf.name||rider.name,
        phone: pf.phone||rider.phone,
        vehicle: pf.vehicle||rider.vehicle,
        region: pf.region||rider.region,
        licenseNo: pf.licenseNo||rider.licenseNo||"",
      });
      toast("Profile updated ✅");
      setEditingProfile(false);
    }catch{toast("Failed","error");}
    finally{setSavingPf(false);}
  }

  if(loading) return <div style={{padding:60,textAlign:"center",color:"var(--muted)"}}>Loading…</div>;
  if(!rider)  return <div className="rw"><div className="empty-st"><span className="ico">🏍️</span><h3>Rider profile not found</h3><p>Sign out and re-register as a Rider.</p></div></div>;

  const active = myOrders.filter(o=>["assigned","dispatched"].includes(o.status));
  const done   = history;
  const today  = new Date().toISOString().split("T")[0];
  const todayDone = done.filter(o=>{ const ts=o.updatedAt?.seconds?new Date(o.updatedAt.seconds*1000):new Date(o.timestamp||0); return ts.toISOString().split("T")[0]===today; });
  const todayEarnings = todayDone.reduce((s,o)=>s+(o.riderFee||0),0);
  const totalEarnings = done.reduce((s,o)=>s+(o.riderFee||0),0);
  const avgRating = done.filter(o=>o.driverRating).length>0
    ? (done.filter(o=>o.driverRating).reduce((s,o)=>s+o.driverRating,0)/done.filter(o=>o.driverRating).length).toFixed(1)
    : Number(rider.rating||5).toFixed(1);

  const RIDER_TABS = [
    ["dashboard","🏠","Dashboard"],
    ["jobs",     "🔍","Jobs"],
    ["history",  "📦","History"],
    ["partners", "🤝","Partners"],
    ["sub",      "💎","Plan"],
    ["profile",  "👤","Profile"],
  ];

  return (
    <div className="rw">

      {/* ── PROFILE HEADER ── */}
      <div className="rider-hdr">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {rider.photo
            ?<img src={rider.photo} alt={rider.name} className="rh-av-photo" onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
            :null}
          <div className="rh-av" style={{display:rider.photo?"none":"flex"}}>{(rider.name||"R")[0]}</div>
          <div>
            <div className="rh-name">{rider.name}</div>
            <div className="rh-det">{rider.vehicle} · {rider.region}</div>
            <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
              <span style={{fontSize:11,color:"var(--amber)",fontWeight:700}}>⭐ {avgRating}</span>
              <span style={{fontSize:10,color:"var(--muted)"}}>·</span>
              <span style={{fontSize:11,color:"var(--lime3)",fontWeight:700}}>{done.length} total deliveries</span>
            </div>
          </div>
        </div>
        <div className="toggle-row">
          <button className="toggle-track" style={{background:rider.available?"var(--lime2)":"var(--muted)"}} onClick={toggleAvail}>
            <div className="toggle-thumb" style={{left:rider.available?"23px":"3px"}}/>
          </button>
          <span className="avail-lbl" style={{color:rider.available?"var(--lime3)":"var(--muted)"}}>{rider.available?"Available":"Offline"}</span>
        </div>
      </div>

      {/* ── TAB NAV ── */}
      <div style={{display:"flex",gap:0,background:"var(--cream2)",borderRadius:"var(--r)",padding:3,marginBottom:18,overflowX:"auto"}}>
        {RIDER_TABS.map(([t,ico,lbl])=>(
          <button key={t} onClick={()=>setRiderTab(t)}
            style={{flex:1,minWidth:52,padding:"7px 4px",borderRadius:"var(--r)",border:"none",
              background:riderTab===t?"var(--g1)":"transparent",
              color:riderTab===t?"white":"var(--muted)",
              fontFamily:"var(--fb)",fontWeight:700,fontSize:10,cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .14s",whiteSpace:"nowrap"}}>
            <span style={{fontSize:16}}>{ico}</span>{lbl}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════ DASHBOARD ════════════════════════════ */}
      {riderTab==="dashboard"&&<div>

        {/* Stats grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:18}}>
          {[
            {ico:"🔥",label:"Active Now",     val:active.length,        color:"var(--coral)"},
            {ico:"✅",label:"Today's Trips",  val:todayDone.length,     color:"var(--g1)"},
            {ico:"💰",label:"Today's Revenue",val:fmt(todayEarnings),   color:"var(--amber2)"},
            {ico:"📦",label:"Total Delivered", val:done.length,          color:"var(--lime3)"},
            {ico:"⭐",label:"Avg Rating",      val:avgRating+"/5",       color:"var(--amber)"},
            {ico:"💵",label:"Total Earned",    val:fmt(totalEarnings),   color:"var(--g1)"},
          ].map(({ico,label,val,color})=>(
            <div key={label} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:"14px 16px",boxShadow:"var(--sh)",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:26,flexShrink:0}}>{ico}</span>
              <div>
                <div style={{fontFamily:"var(--ff)",fontSize:18,fontWeight:900,color}}>{val}</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Active deliveries */}
        {active.length>0&&<>
          <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:16,marginBottom:11}}>🔥 Active Deliveries</h3>
          {active.map(o=>{
            const loc=getBizLocation(o.businessId);
            const mapsUrl=loc?`https://maps.google.com/?q=${loc.lat},${loc.lng}`:`https://maps.google.com/?q=${encodeURIComponent(o.businessName+", "+o.region)}`;
            return (
            <div key={o.id} className="active-del">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                <span style={{fontFamily:"var(--ff)",fontSize:16,fontWeight:800,color:"var(--g1)"}}>{o.orderId||o.id}</span>
                <span className="sbadge" style={{background:ORDER_STATUS[o.status]?.bg,color:ORDER_STATUS[o.status]?.color}}>{ORDER_STATUS[o.status]?.label}</span>
              </div>
              <div className="jc-route"><div className="jr-pt">📍 {o.businessName}</div><div className="jr-line"/><div className="jr-pt">🏠 {o.customerName}</div></div>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>{o.address}</div>
              <div style={{marginBottom:8}}><strong style={{fontSize:12}}>{o.customerName}</strong> <span style={{color:"var(--muted)",fontSize:11}}>· {o.customerPhone}</span></div>
              <div className="jc-items">{(o.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <span style={{fontFamily:"var(--ff)",fontSize:19,fontWeight:900,color:"var(--g1)"}}>{fmt(o.total)}</span>
                <span className={`pay-badge ${o.payment==="cash"?"pb-cash":o.payment==="pos"?"pb-pos":"pb-paid"}`}>{o.payment==="cash"?"💵 Collect Cash":o.payment==="momo"||o.payment==="transfer"?"✅ Pre-Paid":"💳 Collect POS"}</span>
              </div>
              <div className="r-acts">
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-directions">📍 Directions to {o.businessName}</a>
                {o.status==="assigned"&&<button className="btn-deliver" onClick={async()=>{await updateOrderStatus(o.id,"dispatched");toast("Delivery started 🚀");}}>🚀 Start Delivery</button>}
                {o.status==="dispatched"&&<>
                  <button className="btn-call" onClick={()=>window.open(`tel:${o.customerPhone}`)}>📞 Call Customer</button>
                  <button className="btn-deliver" style={{background:"linear-gradient(135deg,var(--g1),var(--g3))"}} onClick={()=>confirmDel(o.id)}>✅ Confirm Delivered</button>
                </>}
              </div>
            </div>
          );})}
        </>}

        {active.length===0&&<div className="empty-st" style={{paddingTop:30}}><span className="ico">😴</span><h3>{rider.available?"No active deliveries":"You're offline"}</h3><p>{rider.available?"Accept a job from the Jobs tab":"Toggle Available above to start receiving jobs"}</p></div>}

        {/* ── Rider share link — always visible ── */}
        <RiderLinkBanner riderSlug={rider.username||""} riderName={rider.name} region={rider.region}/>
      </div>}

      {/* ════════════════════════════════ JOBS ═══════════════════════════════ */}
      {riderTab==="jobs"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:17,margin:0}}>
            {rider.available?`🔍 Jobs in ${rider.region}`:"Go online to see jobs"}
          </h3>
          {!rider.available&&<button onClick={toggleAvail} style={{padding:"8px 16px",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>Go Online</button>}
        </div>
        {!rider.available
          ?<div className="empty-st"><span className="ico">😴</span><h3>You're offline</h3><p>Tap "Go Online" to start seeing jobs.</p></div>
          :availJobs.length===0
            ?<div className="empty-st"><span className="ico">🔍</span><h3>No jobs right now</h3><p>New jobs in {rider.region} appear here in real-time.</p></div>
            :availJobs.map(o=>{
              const loc=getBizLocation(o.businessId);
              const mapsUrl=loc?`https://maps.google.com/?q=${loc.lat},${loc.lng}`:`https://maps.google.com/?q=${encodeURIComponent(o.businessName+", "+o.region)}`;
              return (
              <div key={o.id} className="job-card">
                <div className="jc-head"><span className="jc-id">{o.orderId||o.id}</span><span className="jc-earn">{fmt(o.total)}</span></div>
                <div className="jc-route"><div className="jr-pt">📍 {o.businessName}</div><div className="jr-line"/><div className="jr-pt">🏠 {o.customerName}</div></div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>{o.address}</div>
                {o.riderFee>0&&<div style={{fontSize:12,fontWeight:700,color:"var(--coral)",marginBottom:6}}>🏍️ Rider fee: {fmt(o.riderFee)}</div>}
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-directions" style={{display:"inline-flex",marginBottom:9}}>📍 Directions to Pickup</a>
                <div className="jc-items">{(o.items||[]).map(i=>`${i.emoji||"📦"} ${i.name} ×${i.qty}`).join(" · ")}</div>
                <button className="btn-accept" onClick={()=>acceptJob(o)}>✅ Accept Job →</button>
              </div>
            );})}
      </div>}

      {/* ════════════════════════════════ HISTORY ════════════════════════════ */}
      {riderTab==="history"&&<div>
        <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:17,marginBottom:16}}>📦 Delivery History</h3>

        {/* Quick totals */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
          {[
            {v:done.length, l:"Total Deliveries", c:"var(--g1)"},
            {v:fmt(totalEarnings), l:"Total Earned", c:"var(--amber2)"},
            {v:avgRating+"/5", l:"Avg Rating", c:"var(--amber)"},
          ].map(({v,l,c})=>(
            <div key={l} style={{background:"var(--white)",borderRadius:"var(--r)",padding:"12px 8px",textAlign:"center",boxShadow:"var(--sh)"}}>
              <div style={{fontFamily:"var(--ff)",fontSize:16,fontWeight:900,color:c}}>{v}</div>
              <div style={{fontSize:9,color:"var(--muted)",marginTop:2,lineHeight:1.2}}>{l}</div>
            </div>
          ))}
        </div>

        {done.length===0
          ?<div className="empty-st"><span className="ico">📦</span><h3>No completed deliveries yet</h3><p>Complete your first delivery to see history here.</p></div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {done.map(o=>(
              <div key={o.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:"14px",boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div>
                    <span style={{fontFamily:"var(--ff)",fontWeight:800,color:"var(--g1)",fontSize:14}}>{o.orderId||o.id}</span>
                    <span style={{marginLeft:8,fontSize:10,color:"var(--muted)"}}>{ago(o.updatedAt||o.timestamp)}</span>
                  </div>
                  <span style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:14,color:"var(--amber2)"}}>{fmt(o.total)}</span>
                </div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:4}}>🏪 {o.businessName} → 🏠 {o.customerName}</div>
                <div style={{fontSize:11,color:"var(--dim)",marginBottom:6}}>{o.address}</div>
                {o.riderFee>0&&<div style={{fontSize:11,fontWeight:700,color:"var(--g1)",marginBottom:6}}>🏍️ Earned: {fmt(o.riderFee)}</div>}
                {o.driverRating
                  ?<div style={{padding:"6px 10px",background:"rgba(251,191,36,.08)",borderRadius:8,fontSize:11}}>
                    <span style={{color:"var(--amber)",fontWeight:700}}>{"⭐".repeat(o.driverRating)} {o.driverRating}/5</span>
                    {o.driverRatingComment&&<span style={{color:"var(--muted)",marginLeft:6}}>"{o.driverRatingComment}"</span>}
                  </div>
                  :<div style={{fontSize:10,color:"var(--dim)"}}>Not yet rated by customer</div>
                }
              </div>
            ))}
          </div>
        }
      </div>}

      {/* ════════════════════════════════ PARTNERS ═══════════════════════════ */}
      {riderTab==="partners"&&<div>
        <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:17,marginBottom:6}}>🤝 Business Partnerships</h3>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:16}}>Apply to partner with businesses in your region. When approved, you become their preferred rider and appear first in their assignment list.</p>

        {/* My applications */}
        {partnerships.length>0&&(
          <div style={{marginBottom:20}}>
            <h4 style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:14,marginBottom:10}}>My Applications</h4>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {partnerships.map(p=>(
                <div key={p.id} style={{background:"var(--white)",borderRadius:"var(--r)",padding:"12px 14px",boxShadow:"var(--sh)",display:"flex",alignItems:"center",justifyContent:"space-between",border:"1.5px solid var(--border2)"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{p.bizName}</div>
                    <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{ago(p.createdAt||p.timestamp)}</div>
                  </div>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:800,
                    background:p.status==="pending"?"rgba(251,191,36,.12)":p.status==="approved"?"rgba(74,222,128,.12)":"rgba(239,68,68,.1)",
                    color:p.status==="pending"?"var(--amber)":p.status==="approved"?"var(--lime3)":"#ef4444"}}>
                    {p.status==="pending"?"⏳ Pending":p.status==="approved"?"✅ Approved":"✕ Declined"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Browse businesses in region to apply */}
        <h4 style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:14,marginBottom:10}}>📍 Businesses in {rider.region}</h4>
        {businesses.filter(b=>b.region===rider.region&&b.status!=="suspended").length===0
          ?<div className="empty-st"><span className="ico">🏪</span><h3>No businesses found</h3></div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {businesses.filter(b=>b.region===rider.region&&b.status!=="suspended").map(b=>{
              const existing=partnerships.find(p=>p.bizId===b.id);
              return (
              <div key={b.id} style={{background:"var(--white)",borderRadius:"var(--r2)",padding:"14px 16px",boxShadow:"var(--sh)",border:"1.5px solid var(--border2)"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:44,height:44,borderRadius:"var(--r)",overflow:"hidden",background:"var(--cream2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {b.logo?<img src={b.logo} alt={b.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:22}}>🏪</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14}}>{b.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{b.category} · {b.region}</div>
                    <div style={{fontSize:11,color:"var(--coral)",fontWeight:600,marginTop:2}}>🏍️ {b.riderFee?`Delivery: ${fmt(b.riderFee)}`:"Free delivery"}</div>
                {b.deliveryNote&&<div style={{fontSize:10,color:"var(--amber2)",fontWeight:600,marginTop:2,lineHeight:1.4}}>📌 {b.deliveryNote}</div>}
                  </div>
                </div>
                {existing
                  ?<div style={{padding:"7px 12px",borderRadius:"var(--r)",background:existing.status==="approved"?"rgba(74,222,128,.08)":"rgba(251,191,36,.08)",fontSize:12,fontWeight:700,color:existing.status==="approved"?"var(--lime3)":"var(--amber)"}}>
                    {existing.status==="pending"?"⏳ Application pending approval":existing.status==="approved"?"✅ You're a partner rider for this business":"✕ Application declined — you may re-apply after 7 days"}
                  </div>
                  :<button onClick={()=>applyToBiz(b)} style={{width:"100%",padding:"9px",borderRadius:"var(--r)",border:"none",background:"linear-gradient(135deg,var(--g1),var(--g3))",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                    🤝 Apply to Partner
                  </button>
                }
              </div>
            );})}
          </div>
        }
      </div>}

      {/* ════════════════════════════════ PROFILE ════════════════════════════ */}
      {/* ════════ SUBSCRIPTION TAB ════════ */}
      {riderTab==="sub"&&<div style={{paddingBottom:20}}>
        <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"22px 24px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginBottom:20,boxShadow:"var(--sh2)"}}>
          <div style={{flex:1}}>
            <div style={{fontFamily:"var(--ff)",fontSize:18,fontWeight:900,color:"white",marginBottom:4}}>💎 Rider Subscription</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.7)",lineHeight:1.5}}>
              Unlock priority job matching, partner with more businesses, and get verified rider badge.
            </div>
            <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.12)",borderRadius:20,padding:"5px 14px"}}>
              <span style={{fontSize:12,color:"rgba(255,255,255,.9)",fontWeight:700}}>Current plan:</span>
              <span style={{padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:800,background:RIDER_PLANS[rider.plan||"free"]?.bg,color:RIDER_PLANS[rider.plan||"free"]?.color}}>
                {RIDER_PLANS[rider.plan||"free"]?.label}
              </span>
            </div>
          </div>
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700,letterSpacing:1}}>RIDER PRICING</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.8)",fontWeight:600,marginTop:2}}>50% off business rates</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:12}}>
          {Object.entries(RIDER_PLANS).map(([key,p])=>{
            const isCurrent = (rider.plan||"free")===key;
            const [rHubtelLoading, setRHubtelLoading] = [hubtelLoading, setHubtelLoading];
            return(
            <div key={key} onClick={()=>!isCurrent&&p.price>0&&initiateRiderSubscriptionPayment(key)}
              style={{border:`2px solid ${isCurrent?"var(--g1)":p.color+"44"}`,borderRadius:"var(--r2)",padding:"16px 14px",textAlign:"center",position:"relative",background:isCurrent?"var(--cream)":"white",cursor:isCurrent||p.price===0?"default":"pointer",transition:"all .16s",boxShadow:isCurrent?"var(--sh2)":"var(--sh)"}}>
              {isCurrent&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"var(--g1)",color:"white",fontSize:9,fontWeight:900,padding:"3px 10px",borderRadius:20,letterSpacing:.5,whiteSpace:"nowrap"}}>YOUR PLAN</div>}
              <div style={{fontSize:22,marginBottom:6}}>
                {key==="free"?"🆓":key==="monthly"?"📅":key==="quarter"?"📆":key==="biannual"?"⭐":"🏆"}
              </div>
              <div style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:15,color:"var(--ink)",marginBottom:2}}>{p.label}</div>
              <div style={{fontSize:10,color:"var(--muted)",marginBottom:10}}>{p.duration}</div>
              <div style={{fontFamily:"var(--ff)",fontSize:22,fontWeight:900,color:p.color,marginBottom:4}}>
                {p.price===0?"FREE":`GH₵${p.price}`}
              </div>
              {p.price>0&&<div style={{fontSize:10,color:"var(--dim)",marginBottom:10}}>GH₵{p.monthly}/mo</div>}
              <div style={{fontSize:11,color:"var(--muted)",fontWeight:700,marginBottom:12,minHeight:16}}>{p.desc}</div>
              {!isCurrent&&p.price>0&&(
                <button onClick={e=>{e.stopPropagation();initiateRiderSubscriptionPayment(key);}}
                  disabled={!!hubtelLoading}
                  style={{width:"100%",padding:"9px 0",borderRadius:"var(--r)",border:"none",background:hubtelLoading===key?"#ccc":p.color,color:"white",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:hubtelLoading?"not-allowed":"pointer"}}>
                  {hubtelLoading===key?"Processing…":"Subscribe →"}
                </button>
              )}
              {!isCurrent&&p.price===0&&(
                <div style={{fontSize:11,color:"var(--lime3)",fontWeight:700}}>✓ Active</div>
              )}
            </div>
          );})}
        </div>

        <div style={{marginTop:16,background:"rgba(74,222,128,.06)",borderRadius:"var(--r2)",padding:"14px 16px",border:"1.5px solid rgba(74,222,128,.2)"}}>
          <div style={{fontWeight:800,fontSize:13,color:"var(--lime3)",marginBottom:8}}>💎 What you get with a paid plan:</div>
          {["Priority job assignments — you appear first to businesses","Verified rider badge on your profile","Partner with unlimited businesses","Access to premium delivery zones","Priority customer support"].map(b=>(
            <div key={b} style={{fontSize:12,color:"var(--muted)",marginBottom:4}}>✅ {b}</div>
          ))}
        </div>
      </div>}

      {riderTab==="profile"&&<div>
        <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"20px",marginBottom:16,boxShadow:"var(--sh2)",textAlign:"center"}}>
          <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",background:"rgba(255,255,255,.2)",margin:"0 auto 10px",border:"3px solid rgba(255,255,255,.3)"}}>
            {rider.photo?<img src={rider.photo} alt={rider.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
             :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:900,color:"white"}}>{rider.name[0]}</div>}
          </div>
          <div style={{fontFamily:"var(--ff)",fontSize:20,fontWeight:900,color:"white"}}>{rider.name}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:2}}>{rider.vehicle} · {rider.region}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.65)",marginTop:2}}>⭐ {avgRating} · {done.length} deliveries · {fmt(totalEarnings)} earned</div>
        </div>

        {!editingProfile?(
          <div style={{background:"var(--white)",borderRadius:"var(--r2)",padding:20,boxShadow:"var(--sh)",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:16,margin:0}}>My Details</h3>
              <button onClick={()=>{setPf({name:rider.name,phone:rider.phone,vehicle:rider.vehicle||"Motorbike 🏍️",region:rider.region,licenseNo:rider.licenseNo||""});setEditingProfile(true);}}
                style={{padding:"6px 14px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                ✏️ Edit
              </button>
            </div>
            {[
              ["Full Name", rider.name],
              ["Phone", rider.phone],
              ["Vehicle", rider.vehicle],
              ["Region", rider.region],
              ["License No.", rider.licenseNo||"Not set"],
              ["Email", rider.email||"Not set"],
              ["Member since", rider.createdAt?.seconds?new Date(rider.createdAt.seconds*1000).toLocaleDateString("en-GH"):"—"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid var(--border2)",fontSize:13}}>
                <span style={{color:"var(--muted)",fontWeight:600}}>{k}</span>
                <span style={{fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        ):(
          <div style={{background:"var(--white)",borderRadius:"var(--r2)",padding:20,boxShadow:"var(--sh)",marginBottom:12}}>
            <h3 style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:16,marginBottom:16}}>✏️ Edit Profile</h3>
            {[
              ["name","Full Name","text","Your full name"],
              ["phone","Phone Number","tel","e.g. 024 123 4567"],
              ["licenseNo","License No.","text","e.g. GHA-DL-12345"],
            ].map(([k,lbl,type,ph])=>(
              <div key={k} className="fgrp">
                <label style={{fontSize:11}}>{lbl}</label>
                <input className="finp" type={type} placeholder={ph} value={pf[k]||""} onChange={e=>setPf(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
            <div className="fgrp">
              <label style={{fontSize:11}}>Vehicle Type</label>
              <select className="finp" value={pf.vehicle||""} onChange={e=>setPf(f=>({...f,vehicle:e.target.value}))}>
                {["Motorbike 🏍️","Bicycle 🚲","Car 🚗","Van 🚐","Tricycle (Aboboyaa) 🛺","Truck 🚚"].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="fgrp">
              <label style={{fontSize:11}}>Region</label>
              <select className="finp" value={pf.region||""} onChange={e=>setPf(f=>({...f,region:e.target.value}))}>
                {["Greater Accra","Ashanti","Western","Central","Eastern","Northern","Upper East","Upper West","Volta","Brong-Ahafo","Oti","Ahafo","Bono East","North East","Savannah","Western North"].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button onClick={()=>setEditingProfile(false)} style={{flex:1,padding:"12px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",background:"var(--cream)",color:"var(--muted)",fontFamily:"var(--fb)",fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveProfile} disabled={savingPf} style={{flex:2,padding:"12px",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                {savingPf?"Saving…":"Save Changes ✅"}
              </button>
            </div>
          </div>
        )}

        {/* Partner status summary */}
        {partnerships.filter(p=>p.status==="approved").length>0&&(
          <div style={{background:"rgba(74,222,128,.08)",borderRadius:"var(--r2)",padding:"14px 16px",border:"1.5px solid rgba(74,222,128,.2)",marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:13,color:"var(--lime3)",marginBottom:8}}>✅ Approved Partner Businesses</div>
            {partnerships.filter(p=>p.status==="approved").map(p=>(
              <div key={p.id} style={{fontSize:12,fontWeight:600,padding:"4px 0",borderBottom:"1px solid rgba(74,222,128,.1)"}}>{p.bizName}</div>
            ))}
          </div>
        )}

        {/* Share link */}
        {rider.username&&(
          <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",borderRadius:"var(--r2)",padding:"18px",boxShadow:"var(--sh2)"}}>
            <div style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:15,color:"white",marginBottom:3}}>🔗 Share Your Rider Profile</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginBottom:14}}>Let businesses and customers find you directly online.</div>
            <ShareLinkWidget url={`https://localbizgh.web.app/?rider=${rider.username||""}`} label={rider.name}/>
          </div>
        )}
      </div>}

      <div style={{height:20}}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({toast}) {
  const [businesses,setBusinesses]=useState([]);
  const [allUsers,setAllUsers]=useState([]);
  const [allRiders,setAllRiders]=useState([]);
  const [allOrders,setAllOrders]=useState([]);
  const [payments,setPayments]=useState([]);
  const [devMsgs,setDevMsgs]=useState([]);
  const [reports,setReports]=useState([]);
  const [admTab,setAdmTab]=useState("subscriptions");
  const [showOnboard,setShowOnboard]=useState(false);
  const [selMsg,setSelMsg]=useState(null);
  const [selReport,setSelReport]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [bizFilter,setBizFilter]=useState("all");
  const [bizSearch,setBizSearch]=useState("");
  const [nb,setNb]=useState({name:"",owner:"",email:"",phone:"",type:"Food & Restaurant",plan:"free",region:"Greater Accra"});

  useEffect(()=>{
    const u1=listenBusinesses(setBusinesses);const u2=listenAllUsers(setAllUsers);
    const u3=listenAllRiders(setAllRiders);const u4=listenAllOrders(setAllOrders);
    const u5=listenAllPayments(setPayments);
    const u6=listenDevMessages(setDevMsgs);
    const u7=listenReports(setReports);
    return()=>{u1();u2();u3();u4();u5();u6();u7();};
  },[]);

  const totalMRR=businesses.filter(b=>b.status!=="suspended").reduce((s,b)=>s+(PLANS[b.plan||"free"]?.price||0),0);
  const custUsers=allUsers.filter(u=>u.role==="customer");

  async function setPlan(bizId,plan){ try{await updateSubscription(bizId,plan);toast("Plan updated!");}catch(e){toast("Failed","error");} }

  // Full business status control
  async function setBizStatus(id, newStatus, bizName) {
    const confirmMsgs = {
      suspended: `Suspend "${bizName}"? They will be hidden from customers but data is kept.`,
      revoked:   `Revoke "${bizName}"? Their shop will be deactivated indefinitely.`,
      active:    `Reactivate "${bizName}"? Their shop will be restored to active status.`,
      deleted:   `⚠️ PERMANENTLY DELETE "${bizName}"? This CANNOT be undone. All their data will be removed.`,
    };
    if (!window.confirm(confirmMsgs[newStatus] || `Set status to ${newStatus}?`)) return;
    try {
      if (newStatus === "deleted") {
        // Hard delete from Firestore
        const { getFirestore, doc, deleteDoc } = await import("firebase/firestore");
        const { getApp } = await import("firebase/app");
        const db = getFirestore(getApp());
        await deleteDoc(doc(db, "businesses", id));
        toast(`"${bizName}" has been permanently deleted.`, "warn");
      } else {
        await adminUpdateBusiness(id, {
          status: newStatus,
          statusUpdatedAt: new Date().toISOString(),
          statusNote: newStatus === "suspended" ? "Suspended by admin" :
                      newStatus === "revoked"   ? "Revoked by admin"   :
                      "Reactivated by admin",
        });
        toast(
          newStatus === "active"    ? `✅ "${bizName}" reactivated.` :
          newStatus === "suspended" ? `⏸️ "${bizName}" suspended.` :
          `🚫 "${bizName}" revoked.`, "warn"
        );
      }
    } catch(e) { toast("Failed: " + e.message, "error"); }
  }

  async function recordPayment(b){ const amt=PLANS[b.plan||"free"]?.price||0; if(amt===0){toast("Free plan — no payment to record","warn");return;} try{await logSubscriptionPayment(b.id,b.name,b.plan,amt);toast(`Payment of ${fmt(amt)} recorded for ${b.name}`);}catch(e){toast("Failed","error");} }

  // Identify idle shops: on free plan for >6 months (180 days)
  const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
  const idleShops = businesses.filter(b => {
    const isFreePlan = !b.plan || b.plan === "free";
    const createdTs  = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0);
    const isOld      = (Date.now() - createdTs) > SIX_MONTHS_MS;
    const isActive   = b.status === "active" || !b.status;
    return isFreePlan && isOld && isActive;
  });

  // Business selected for detail view in admin
  const [selAdminBiz, setSelAdminBiz] = useState(null);

  const reportedBizIds = new Set(reports.map(r => r.bizId));

  const filteredAdminBiz = businesses.filter(b => {
    const matchSearch = !bizSearch || b.name.toLowerCase().includes(bizSearch.toLowerCase()) || (b.ownerName||"").toLowerCase().includes(bizSearch.toLowerCase());
    const createdTs   = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0);
    const isIdle      = (!b.plan || b.plan === "free") && (Date.now() - createdTs) > SIX_MONTHS_MS && (b.status === "active" || !b.status);
    const matchFilter =
      bizFilter === "all"       ? true :
      bizFilter === "active"    ? (b.status === "active" || !b.status) :
      bizFilter === "suspended" ? b.status === "suspended" :
      bizFilter === "revoked"   ? b.status === "revoked" :
      bizFilter === "idle"      ? isIdle :
      bizFilter === "reported"  ? reportedBizIds.has(b.id) : true;
    return matchSearch && matchFilter;
  });
  async function doOnboard(){ if(!nb.name||!nb.owner){toast("Name and owner required","warn");return;} try{await adminAddBusiness({ownerId:"admin",ownerName:nb.owner,ownerEmail:nb.email,ownerPhone:nb.phone,name:nb.name,category:nb.type,region:nb.region,plan:nb.plan,status:"active",ordersCount:0,rating:0,products:[],description:"",logo:""});toast("Business onboarded! 🏪");setShowOnboard(false);setNb({name:"",owner:"",email:"",phone:"",type:"Food & Restaurant",plan:"free",region:"Greater Accra"});}catch(e){toast("Failed: "+e.message,"error");} }

  const months=["Aug","Sep","Oct","Nov","Dec","Jan"];
  const revHist=[0,0,100,350,700,totalMRR];
  const maxRev=Math.max(...revHist,1);

  return (
    <div className="aw">
      <div className="adm-hero">
        <div>
          <h1>Admin Command Center</h1>
          <p>Full platform control · Subscription management · Real-time Firebase</p>
          <div className="adm-badge2">⚡ Logged in as Admin · All Regions</div>
        </div>
        <div className="mrr-box">
          <div className="mrr-lab">Monthly Recurring Revenue</div>
          <div className="mrr-val">GH₵{(totalMRR).toLocaleString()}</div>
          <div className="mrr-sub">↑ Growing every month</div>
        </div>
      </div>

      <div className="adm-stats">
        {[{v:businesses.length,l:"Businesses",c:"as-amb",i:"🏪"},{v:custUsers.length,l:"Customers",c:"as-grn",i:"🛍️"},
          {v:allRiders.length,l:"Riders",c:"as-cor",i:"🏍️"},{v:allOrders.length,l:"Orders",c:"as-blu",i:"📦"},
          {v:businesses.filter(b=>["monthly","quarter","biannual","annual"].includes(b.plan)).length,l:"Paid Plans",c:"as-pur",i:"💎"},
          {v:idleShops.length,l:"Idle Shops",c:"as-amb",i:"⚠️"},
          {v:reports.filter(r=>r.status==="open").length,l:"Open Reports",c:"as-cor",i:"🚨"},
          {v:devMsgs.filter(m=>m.status==="unread").length,l:"New Messages",c:"as-blu",i:"📬"},
        ].map(({v,l,c,i})=><div key={l} className={`as ${c}`}><div className="as-v">{v}</div><div className="as-l">{l}</div><div className="as-ico">{i}</div></div>)}
      </div>

      <div style={{background:"white",borderRadius:"var(--r2)",padding:20,boxShadow:"var(--sh)",marginBottom:22}}>
        <h3 style={{fontFamily:"var(--ff)",fontSize:16,marginBottom:13}}>Revenue Trend</h3>
        <div className="rev-chart">{revHist.map((v,i)=><div key={i} className="rev-bw"><div className="rev-bar" style={{height:`${(v/maxRev)*86}px`}}/><div className="rev-bl">{months[i]}</div></div>)}</div>
        <p style={{fontSize:11,color:"var(--muted)",textAlign:"right",marginTop:6}}>Current MRR: <strong style={{color:"var(--amber2)"}}>{fmt(totalMRR)}</strong></p>
      </div>

      <div className="adm-tabs">
        {[["subscriptions","💰 Subscriptions"],["businesses","🏪 Businesses"],["users","👤 Users"],["riders","🏍️ Riders"],["orders","📦 Orders"],["payments","🧾 Payments"]].map(([t,l])=>(
          <button key={t} className={`adm-tab ${admTab===t?"act":""}`} onClick={()=>setAdmTab(t)}>{l}</button>
        ))}
      </div>

      {admTab==="subscriptions"&&<>
        <div className="sect-head"><span className="sect-h">Subscription Management</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:20}}>
          {Object.entries(PLANS).map(([k,p])=>{const cnt=businesses.filter(b=>b.plan===k&&b.status!=="suspended").length;return(
            <div key={k} style={{background:"white",borderRadius:"var(--r2)",padding:16,boxShadow:"var(--sh)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span className="plan-pill" style={{background:p.bg,color:p.color}}>{p.label}</span>
                <span style={{fontFamily:"var(--ff)",fontSize:22,fontWeight:900}}>{cnt}</span>
              </div>
              <div style={{fontSize:12,color:"var(--muted)"}}>{p.price===0?"Free tier":fmt(p.price)+"/mo"}</div>
              <div style={{fontSize:12,fontWeight:700,color:"var(--g1)",marginTop:4}}>{p.price===0?"—":fmt(cnt*p.price)+" revenue"}</div>
            </div>
          );})}
        </div>
        {businesses.map(b=>(
          <div key={b.id} className="sub-card">
            <div className="sub-head">
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {b.logo&&<img src={b.logo} style={{width:36,height:36,borderRadius:9,objectFit:"cover"}} alt="logo" onError={e=>e.target.style.display="none"}/>}
                <div>
                  <div className="sub-bname">{b.name}</div>
                  <div className="sub-meta">📍 {b.region} · {b.category} · Owner: {b.ownerName}</div>
                </div>
              </div>
              <span className="plan-pill" style={{background:PLANS[b.plan||"free"]?.bg,color:PLANS[b.plan||"free"]?.color,flexShrink:0}}>{PLANS[b.plan||"free"]?.label}</span>
            </div>
            <div className="sub-plans">
              {Object.entries(PLANS).map(([k,p])=>(
                <button key={k} className="sub-plan-btn"
                  style={{borderColor:p.color,color:(b.plan||"free")===k?"white":p.color,background:(b.plan||"free")===k?p.color:"transparent"}}
                  onClick={()=>setPlan(b.id,k)}>
                  {p.label}{p.price>0?" · "+fmt(p.price):""}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",paddingTop:8,borderTop:"1px solid var(--border2)"}}>
              <span style={{fontSize:11,color:"var(--muted)"}}>Status: <strong style={{color:b.status==="active"?"var(--lime3)":"var(--red)"}}>{b.status||"active"}</strong></span>
              <span style={{fontSize:11,color:"var(--muted)"}}>GPS: <strong>{b.location?"✅ Set":"—"}</strong></span>
              <div style={{marginLeft:"auto",display:"flex",gap:7}}>
                <button className="btn-record-pay" onClick={()=>recordPayment(b)}>🧾 Record Payment</button>
                <button className="adm-act" style={{background:b.status==="suspended"?"rgba(34,197,94,.08)":"rgba(239,68,68,.08)",color:b.status==="suspended"?"var(--lime3)":"var(--red)"}} onClick={()=>toggleBiz(b.id,b.status)}>
                  {b.status==="suspended"?"Activate":"Suspend"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {businesses.length===0&&<div className="empty-st"><span className="ico">🏪</span><h3>No businesses yet</h3></div>}
      </>}

      {admTab==="businesses"&&<>
        {/* ── Header + Summary ── */}
        <div className="sect-head">
          <span className="sect-h">All Businesses ({businesses.length})</span>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {idleShops.length>0&&(
              <span style={{padding:"4px 12px",borderRadius:20,background:"rgba(245,158,11,.15)",color:"var(--amber2)",fontSize:12,fontWeight:700}}>
                ⚠️ {idleShops.length} Idle Shop{idleShops.length>1?"s":""}
              </span>
            )}
            {reportedBizIds.size>0&&(
              <span style={{padding:"4px 12px",borderRadius:20,background:"rgba(239,68,68,.12)",color:"var(--red)",fontSize:12,fontWeight:700}}>
                🚨 {reportedBizIds.size} Reported
              </span>
            )}
            <button className="btn-onboard" onClick={()=>setShowOnboard(true)}>+ Onboard Business</button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <input value={bizSearch} onChange={e=>setBizSearch(e.target.value)}
            placeholder="Search businesses..."
            style={{flex:1,minWidth:160,padding:"8px 12px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",fontSize:13,fontFamily:"var(--fb)",outline:"none"}}/>
          {[
            ["all",      "All",       businesses.length],
            ["active",   "✅ Active",  businesses.filter(b=>b.status==="active"||!b.status).length],
            ["suspended","⏸️ Suspended",businesses.filter(b=>b.status==="suspended").length],
            ["revoked",  "🚫 Revoked", businesses.filter(b=>b.status==="revoked").length],
            ["idle",     "⚠️ Idle",    idleShops.length],
            ["reported", "🚨 Reported",reportedBizIds.size],
          ].map(([f,l,c])=>(
            <button key={f} onClick={()=>setBizFilter(f)}
              style={{padding:"6px 12px",borderRadius:"var(--r)",border:`1.5px solid ${bizFilter===f?"var(--g1)":"var(--border2)"}`,background:bizFilter===f?"var(--g1)":"white",color:bizFilter===f?"white":"var(--muted)",fontFamily:"var(--fb)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {l} <span style={{opacity:.7}}>({c})</span>
            </button>
          ))}
        </div>

        {/* ── Idle shops alert banner ── */}
        {bizFilter==="idle"&&idleShops.length>0&&(
          <div style={{background:"rgba(245,158,11,.08)",border:"1.5px solid rgba(245,158,11,.3)",borderRadius:"var(--r2)",padding:"14px 16px",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:14,color:"var(--amber2)",marginBottom:4}}>⚠️ Idle Shops — No Paid Subscription for 6+ Months</div>
            <p style={{fontSize:13,color:"var(--muted)",margin:"0 0 12px"}}>These businesses have been on the Free plan for over 6 months. You can notify, suspend, or remove them to maintain platform quality.</p>
            <button onClick={async()=>{
              if(!window.confirm(`Suspend all ${idleShops.length} idle shops? They can be reactivated later.`))return;
              for(const b of idleShops) await adminUpdateBusiness(b.id,{status:"suspended",statusNote:"Auto-suspended: inactive free plan >6 months"});
              toast(`${idleShops.length} idle shops suspended.`,"warn");
            }} style={{padding:"8px 16px",borderRadius:"var(--r)",border:"none",background:"var(--amber)",color:"var(--ink)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>
              ⏸️ Suspend All Idle Shops
            </button>
          </div>
        )}

        {filteredAdminBiz.length===0&&<div style={{padding:40,textAlign:"center",color:"var(--muted)",fontSize:14}}>No businesses match this filter.</div>}

        {/* ── Business cards ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {filteredAdminBiz.map(b=>{
            const isIdle     = (!b.plan||b.plan==="free") && ((Date.now()-(b.createdAt?.seconds?b.createdAt.seconds*1000:(b.createdAt||0)))>SIX_MONTHS_MS) && (b.status==="active"||!b.status);
            const isReported = reportedBizIds.has(b.id);
            const bizReports = reports.filter(r=>r.bizId===b.id);
            const statusColor= b.status==="active"||!b.status ? "#16a34a" : b.status==="suspended" ? "#d97706" : b.status==="revoked" ? "#ef4444" : "#6b7280";
            const statusBg   = b.status==="active"||!b.status ? "rgba(22,163,74,.1)" : b.status==="suspended" ? "rgba(217,119,6,.1)" : b.status==="revoked" ? "rgba(239,68,68,.1)" : "rgba(107,114,128,.1)";
            return (
            <div key={b.id} style={{background:"white",borderRadius:"var(--r2)",boxShadow:"var(--sh)",border:`1.5px solid ${isReported?"rgba(239,68,68,.3)":isIdle?"rgba(245,158,11,.3)":"var(--border2)"}`,overflow:"hidden"}}>
              {/* Top row */}
              <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                {b.logo
                  ? <img src={b.logo} style={{width:44,height:44,borderRadius:10,objectFit:"cover",flexShrink:0}} alt="" onError={e=>e.target.style.display="none"}/>
                  : <div style={{width:44,height:44,borderRadius:10,background:"var(--cream2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{catEmo(b.category)}</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:15,color:"var(--ink)"}}>{b.name}</div>
                  <div style={{fontSize:12,color:"var(--muted)",marginTop:1}}>👤 {b.ownerName} · 📞 {b.ownerPhone||b.ownerEmail||"—"}</div>
                  <div style={{fontSize:11,color:"var(--dim)",marginTop:1}}>📍 {b.region}{b.town?", "+b.town:""} · {b.category}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:800,background:statusBg,color:statusColor}}>
                    {b.status==="active"||!b.status?"✅ Active":b.status==="suspended"?"⏸️ Suspended":b.status==="revoked"?"🚫 Revoked":"🗑️ "+b.status}
                  </span>
                  {isIdle&&<span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:800,background:"rgba(245,158,11,.15)",color:"var(--amber2)"}}>⚠️ Idle 6mo+</span>}
                  {isReported&&<span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:800,background:"rgba(239,68,68,.1)",color:"var(--red)"}}>🚨 {bizReports.length} Report{bizReports.length>1?"s":""}</span>}
                </div>
              </div>

              {/* Stats row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:"1px solid var(--border2)",borderBottom:"1px solid var(--border2)"}}>
                {[
                  ["Plan",    <span style={{padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:800,background:PLANS[b.plan||"free"]?.bg,color:PLANS[b.plan||"free"]?.color}}>{PLANS[b.plan||"free"]?.label}</span>],
                  ["Orders",  b.ordersCount||0],
                  ["Revenue", fmt(b.revenue||0)],
                  ["Joined",  dstr(b.createdAt||0)],
                ].map(([l,v])=>(
                  <div key={l} style={{padding:"8px 12px",textAlign:"center",borderRight:"1px solid var(--border2)"}}>
                    <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--ink)"}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Reports preview */}
              {bizReports.length>0&&(
                <div style={{padding:"10px 16px",background:"rgba(239,68,68,.04)",borderBottom:"1px solid rgba(239,68,68,.12)"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"var(--red)",marginBottom:5}}>🚨 REPORTS ({bizReports.length})</div>
                  {bizReports.slice(0,2).map(r=>(
                    <div key={r.id} style={{fontSize:12,color:"var(--muted)",marginBottom:3}}>
                      • <strong>{r.reason}</strong> — {r.customerName} · {dstr(r.timestamp)}
                      {r.status==="resolved"&&<span style={{color:"var(--lime3)",marginLeft:4}}>✓ Resolved</span>}
                    </div>
                  ))}
                  {bizReports.length>2&&<div style={{fontSize:11,color:"var(--muted)"}}>+{bizReports.length-2} more reports</div>}
                </div>
              )}

              {/* Action buttons */}
              <div style={{padding:"10px 16px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {/* Plan changer */}
                <select value={b.plan||"free"} onChange={e=>setPlan(b.id,e.target.value)}
                  style={{padding:"6px 10px",borderRadius:"var(--r)",border:"1.5px solid var(--border2)",fontSize:12,fontWeight:700,cursor:"pointer",background:"white",fontFamily:"var(--fb)",color:"var(--ink)"}}>
                  {Object.entries(PLANS).map(([k,p])=><option key={k} value={k}>{p.label}</option>)}
                </select>

                {/* Status actions */}
                {(b.status==="suspended"||b.status==="revoked")&&(
                  <button onClick={()=>setBizStatus(b.id,"active",b.name)}
                    style={{padding:"6px 14px",borderRadius:"var(--r)",border:"none",background:"rgba(22,163,74,.12)",color:"#15803d",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>
                    ✅ Reactivate
                  </button>
                )}
                {(b.status==="active"||!b.status)&&(
                  <button onClick={()=>setBizStatus(b.id,"suspended",b.name)}
                    style={{padding:"6px 14px",borderRadius:"var(--r)",border:"none",background:"rgba(245,158,11,.12)",color:"var(--amber2)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>
                    ⏸️ Suspend
                  </button>
                )}
                {b.status!=="revoked"&&(
                  <button onClick={()=>setBizStatus(b.id,"revoked",b.name)}
                    style={{padding:"6px 14px",borderRadius:"var(--r)",border:"none",background:"rgba(239,68,68,.1)",color:"var(--red)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>
                    🚫 Revoke
                  </button>
                )}
                <button onClick={()=>setBizStatus(b.id,"deleted",b.name)}
                  style={{padding:"6px 14px",borderRadius:"var(--r)",border:"1.5px solid rgba(239,68,68,.3)",background:"white",color:"var(--red)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer",marginLeft:"auto"}}>
                  🗑️ Delete
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </>}

      {admTab==="users"&&<>
        <div className="sect-head"><span className="sect-h">All Users ({allUsers.length})</span></div>
        <div className="adm-tbl">
          <div className="tbl-hd" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr"}}><span>User</span><span>Username</span><span>Region</span><span>Role</span></div>
          {allUsers.map(u=>(<div key={u.id||u.uid} className="tbl-row" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr"}}><div><div className="t-name">{u.name}</div><div className="t-sub">{u.email}</div></div><div style={{fontSize:12,fontWeight:700}}>@{u.username||"—"}</div><div style={{fontSize:12}}>{u.region}</div><div><span className={`role-tag rt-${u.role}`}>{u.role}</span></div></div>))}
          {allUsers.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--muted)",fontSize:13}}>No users yet.</div>}
        </div>
      </>}

      {admTab==="riders"&&<>
        <div className="sect-head"><span className="sect-h">Registered Riders ({allRiders.length})</span></div>
        <div className="adm-tbl">
          <div className="tbl-hd" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr 60px"}}><span>Rider</span><span>Region</span><span>Vehicle</span><span>Trips</span><span>Status</span></div>
          {allRiders.map(r=>(<div key={r.id} className="tbl-row" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr 60px"}}><div><div className="t-name">{r.name}</div><div className="t-sub">@{r.username||"—"} · {r.phone}</div></div><div style={{fontSize:12}}>{r.region}</div><div style={{fontSize:11,color:"var(--muted)"}}>{r.vehicle}</div><div style={{fontFamily:"var(--ff)",fontWeight:700}}>{r.trips||0}</div><div><span style={{padding:"3px 8px",borderRadius:20,fontSize:10,fontWeight:800,background:r.available?"rgba(74,222,128,.12)":"rgba(100,116,139,.1)",color:r.available?"var(--lime3)":"var(--muted)"}}>{r.available?"On":"Off"}</span></div></div>))}
          {allRiders.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--muted)",fontSize:13}}>No riders yet.</div>}
        </div>
      </>}

      {admTab==="orders"&&<>
        <div className="sect-head"><span className="sect-h">All Orders ({allOrders.length})</span></div>
        <div className="adm-tbl">
          <div className="tbl-hd" style={{gridTemplateColumns:"1.2fr 1.5fr 1fr 1fr 1fr"}}><span>Order</span><span>Business</span><span>Customer</span><span>Total</span><span>Status</span></div>
          {allOrders.slice(0,50).map(o=>{const sc=ORDER_STATUS[o.status]||ORDER_STATUS.pending;return(
            <div key={o.id} className="tbl-row" style={{gridTemplateColumns:"1.2fr 1.5fr 1fr 1fr 1fr"}}>
              <div><div style={{fontWeight:700,fontSize:12}}>{o.orderId||o.id}</div><div style={{fontSize:10,color:"var(--dim)"}}>{ago(o.createdAt||o.timestamp)}</div></div>
              <div style={{fontSize:12}}>{o.businessName}</div><div style={{fontSize:12}}>{o.customerName}</div>
              <div style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:13}}>{fmt(o.total)}</div>
              <div><span className="sbadge" style={{background:sc.bg,color:sc.color}}>{sc.label}</span></div>
            </div>
          );})}
          {allOrders.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--muted)",fontSize:13}}>No orders yet.</div>}
        </div>
      </>}

      {admTab==="payments"&&<>
        <div className="sect-head"><span className="sect-h">Payment Records ({payments.length})</span></div>
        <div className="adm-tbl">
          <div className="tbl-hd" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr"}}><span>Business</span><span>Plan</span><span>Amount</span><span>Date</span></div>
          {payments.map(p=>(<div key={p.id} className="tbl-row" style={{gridTemplateColumns:"2fr 1fr 1fr 1fr"}}><div className="t-name">{p.bizName}</div><div><span className="plan-pill" style={{background:PLANS[p.plan||"free"]?.bg,color:PLANS[p.plan||"free"]?.color}}>{PLANS[p.plan||"free"]?.label}</span></div><div style={{fontFamily:"var(--ff)",fontWeight:700,fontSize:13}}>{fmt(p.amount)}</div><div style={{fontSize:11,color:"var(--dim)"}}>{dstr(p.paidAt||p.timestamp)}</div></div>))}
          {payments.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--muted)",fontSize:13}}>No payments recorded yet.</div>}
        </div>
      </>}

      {showOnboard&&<div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setShowOnboard(false)}>
        <div className="modal-box"><h3>🏪 Onboard Business</h3>
          <div className="frow2">
            <div className="fgrp"><label>Business Name *</label><input className="finp" value={nb.name} onChange={e=>setNb(n=>({...n,name:e.target.value}))}/></div>
            <div className="fgrp"><label>Owner Name *</label><input className="finp" value={nb.owner} onChange={e=>setNb(n=>({...n,owner:e.target.value}))}/></div>
            <div className="fgrp"><label>Email</label><input className="finp" value={nb.email} onChange={e=>setNb(n=>({...n,email:e.target.value}))}/></div>
            <div className="fgrp"><label>Phone</label><input className="finp" value={nb.phone} onChange={e=>setNb(n=>({...n,phone:e.target.value}))}/></div>
            <div className="fgrp"><label>Region</label><select className="finp" value={nb.region} onChange={e=>setNb(n=>({...n,region:e.target.value}))}><option value="">— Select Region —</option>{REGIONS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
            <div className="fgrp"><label>Category</label><select className="finp" value={nb.type} onChange={e=>setNb(n=>({...n,type:e.target.value}))}>{BIZ_CATEGORIES.map(c=><option key={c.label}>{c.label}</option>)}</select></div>
          </div>
          <div className="macts"><button className="mact-sec" onClick={()=>setShowOnboard(false)}>Cancel</button><button className="mact-pri" onClick={doOnboard}>Onboard</button></div>
        </div>
      </div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// SHOP LINK BANNER  —  always visible, no conditions
// ══════════════════════════════════════════════════════════════════════════════
function ShopLinkBanner({shopUrl, shopSlug, bizName}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if(!shopUrl) return;
    try {
      navigator.clipboard.writeText(shopUrl)
        .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 2500); })
        .catch(fallback);
    } catch { fallback(); }
    function fallback() {
      const el=document.createElement("textarea");
      el.value=shopUrl; document.body.appendChild(el);
      el.select(); document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true); setTimeout(()=>setCopied(false), 2500);
    }
  }

  const waText = `Check out ${bizName} on LocalBiz GH! 🛍️ Browse and order here: ${shopUrl}\n\nPowered by AMTECH SOFTWARE SOLUTIONS`;

  return (
    <div style={{
      background:"linear-gradient(135deg,#1a3d2b,#2d6a4f)",
      borderRadius:14, padding:"16px", marginBottom:16,
      boxShadow:"0 4px 20px rgba(26,61,43,.35)"
    }}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{width:36,height:36,borderRadius:10,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔗</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:15,color:"white",lineHeight:1}}>Your Shop Link</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>Share with anyone — they can browse &amp; order without an account</div>
        </div>
        <div style={{fontSize:22,flexShrink:0}}>🛍️</div>
      </div>

      {/* URL row — always rendered */}
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        background:"rgba(0,0,0,.3)", borderRadius:9,
        padding:"10px 12px", marginBottom:10,
        border:"1px solid rgba(255,255,255,.12)"
      }}>
        <span style={{
          flex:1, fontSize:11, fontWeight:700,
          color: shopSlug ? "#a7f3d0" : "rgba(255,255,255,.35)",
          fontFamily:"monospace", overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap", letterSpacing:.3
        }}>
          {shopSlug
            ? `localbizgh.web.app/?shop=${shopSlug}`
            : "loading your link…"}
        </span>
        {shopSlug && (
          <button onClick={copy} style={{
            flexShrink:0, padding:"5px 13px", borderRadius:7,
            border:"none", cursor:"pointer", fontFamily:"var(--fb)",
            fontSize:11, fontWeight:800, transition:"all .15s",
            background: copied ? "#4ade80" : "rgba(255,255,255,.2)",
            color: copied ? "#052e16" : "white"
          }}>
            {copied ? "✅ Copied!" : "📋 Copy"}
          </button>
        )}
      </div>

      {/* Action buttons — always rendered */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <a href={shopSlug ? `https://wa.me/?text=${encodeURIComponent(waText)}` : "#"}
          target={shopSlug?"_blank":undefined} rel="noreferrer"
          onClick={e=>{ if(!shopSlug) e.preventDefault(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:6, padding:"10px", borderRadius:9,
            background: shopSlug ? "#25d366" : "rgba(255,255,255,.1)",
            color:"white", fontFamily:"var(--fb)", fontWeight:800, fontSize:12,
            textDecoration:"none", opacity: shopSlug ? 1 : .5,
            boxShadow: shopSlug ? "0 2px 8px rgba(37,211,102,.3)" : "none"
          }}>
          💬 Share on WhatsApp
        </a>
        <a href={shopUrl||"#"} target={shopUrl?"_blank":undefined} rel="noreferrer"
          onClick={e=>{ if(!shopUrl) e.preventDefault(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:6, padding:"10px", borderRadius:9,
            border:"1.5px solid rgba(255,255,255,.2)",
            background:"rgba(255,255,255,.08)",
            color:"white", fontFamily:"var(--fb)", fontWeight:800,
            fontSize:12, textDecoration:"none", opacity: shopUrl ? 1 : .5
          }}>
          👁 Preview Shop
        </a>
      </div>

      {/* AMTECH credit */}
      <div style={{marginTop:10,fontSize:9,color:"rgba(255,255,255,.25)",textAlign:"center",letterSpacing:.8,fontFamily:"var(--fb)",fontWeight:700}}>
        POWERED BY AMTECH SOFTWARE SOLUTIONS
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RIDER LINK BANNER  —  always visible, no conditions
// ══════════════════════════════════════════════════════════════════════════════
function RiderLinkBanner({riderSlug, riderName, region}) {
  const [copied, setCopied] = useState(false);
  const riderUrl = riderSlug ? `https://localbizgh.web.app/?rider=${riderSlug}` : "";

  function copy() {
    if(!riderUrl) return;
    try {
      navigator.clipboard.writeText(riderUrl)
        .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 2500); })
        .catch(fallback);
    } catch { fallback(); }
    function fallback() {
      const el=document.createElement("textarea");
      el.value=riderUrl; document.body.appendChild(el);
      el.select(); document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true); setTimeout(()=>setCopied(false), 2500);
    }
  }

  const waText = `I'm a delivery rider in ${region}! Hire me on LocalBiz GH 🏍️: ${riderUrl}\n\nPowered by AMTECH SOFTWARE SOLUTIONS`;

  return (
    <div style={{
      background:"linear-gradient(135deg,#1a3d2b,#2d6a4f)",
      borderRadius:14, padding:"16px", marginTop:20,
      boxShadow:"0 4px 20px rgba(26,61,43,.35)"
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{width:36,height:36,borderRadius:10,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔗</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:15,color:"white",lineHeight:1}}>Your Rider Profile Link</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>Share with businesses &amp; customers to promote yourself</div>
        </div>
        <div style={{fontSize:22,flexShrink:0}}>🏍️</div>
      </div>

      <div style={{
        display:"flex", alignItems:"center", gap:8,
        background:"rgba(0,0,0,.3)", borderRadius:9,
        padding:"10px 12px", marginBottom:10,
        border:"1px solid rgba(255,255,255,.12)"
      }}>
        <span style={{
          flex:1, fontSize:11, fontWeight:700,
          color: riderSlug ? "#a7f3d0" : "rgba(255,255,255,.35)",
          fontFamily:"monospace", overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap", letterSpacing:.3
        }}>
          {riderSlug
            ? `localbizgh.web.app/?rider=${riderSlug}`
            : "loading your link…"}
        </span>
        {riderSlug && (
          <button onClick={copy} style={{
            flexShrink:0, padding:"5px 13px", borderRadius:7,
            border:"none", cursor:"pointer", fontFamily:"var(--fb)",
            fontSize:11, fontWeight:800, transition:"all .15s",
            background: copied ? "#4ade80" : "rgba(255,255,255,.2)",
            color: copied ? "#052e16" : "white"
          }}>
            {copied ? "✅ Copied!" : "📋 Copy"}
          </button>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <a href={riderSlug ? `https://wa.me/?text=${encodeURIComponent(waText)}` : "#"}
          target={riderSlug?"_blank":undefined} rel="noreferrer"
          onClick={e=>{ if(!riderSlug) e.preventDefault(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:6, padding:"10px", borderRadius:9,
            background: riderSlug ? "#25d366" : "rgba(255,255,255,.1)",
            color:"white", fontFamily:"var(--fb)", fontWeight:800, fontSize:12,
            textDecoration:"none", opacity: riderSlug ? 1 : .5,
            boxShadow: riderSlug ? "0 2px 8px rgba(37,211,102,.3)" : "none"
          }}>
          💬 Share on WhatsApp
        </a>
        <a href={riderUrl||"#"} target={riderUrl?"_blank":undefined} rel="noreferrer"
          onClick={e=>{ if(!riderUrl) e.preventDefault(); }}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:6, padding:"10px", borderRadius:9,
            border:"1.5px solid rgba(255,255,255,.2)",
            background:"rgba(255,255,255,.08)",
            color:"white", fontFamily:"var(--fb)", fontWeight:800,
            fontSize:12, textDecoration:"none", opacity: riderUrl ? 1 : .5
          }}>
          👁 Preview Profile
        </a>
      </div>
      <div style={{marginTop:10,fontSize:9,color:"rgba(255,255,255,.25)",textAlign:"center",letterSpacing:.8,fontFamily:"var(--fb)",fontWeight:700}}>
        POWERED BY AMTECH SOFTWARE SOLUTIONS
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE COPY BUTTON
// ══════════════════════════════════════════════════════════════════════════════
function CopyLinkBtn({url, label}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if(navigator.clipboard) {
      navigator.clipboard.writeText(url).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
    } else {
      const el=document.createElement("textarea"); el.value=url;
      document.body.appendChild(el); el.select(); document.execCommand("copy");
      document.body.removeChild(el); setCopied(true); setTimeout(()=>setCopied(false),2500);
    }
  }
  return (
    <button onClick={copy} style={{flexShrink:0,padding:"5px 12px",borderRadius:6,border:"none",
      background:copied?"#4ade80":"rgba(255,255,255,.2)",
      color:copied?"var(--g1)":"white",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,
      cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
      {copied?"✅ Copied!":label||"📋 Copy"}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARE LINK WIDGET  — reusable copy-link button
// ══════════════════════════════════════════════════════════════════════════════
function ShareLinkWidget({url, label, color="#1a3d2b"}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(url).then(()=>{
      setCopied(true);
      setTimeout(()=>setCopied(false), 2500);
    }).catch(()=>{
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = url; document.body.appendChild(el);
      el.select(); document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true); setTimeout(()=>setCopied(false),2500);
    });
  }

  const waMsg = `Check out ${label} on LocalBiz GH! 🛍️ Place your order here: ${url}\n\nPowered by AMTECH SOFTWARE SOLUTIONS`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;

  return (
    <div style={{background:"rgba(255,255,255,.1)",borderRadius:"var(--r2)",padding:"16px 18px",border:"1.5px solid rgba(255,255,255,.18)"}}>
      <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>🔗 Your Public Shop Link</div>
      {/* URL display box */}
      <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,.25)",borderRadius:"var(--r)",padding:"9px 12px",marginBottom:10,overflow:"hidden"}}>
        <span style={{flex:1,fontSize:12,fontWeight:600,color:"white",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{url}</span>
        <button onClick={copyLink}
          style={{flexShrink:0,padding:"5px 12px",borderRadius:6,border:"none",
            background:copied?"var(--lime2)":"rgba(255,255,255,.2)",
            color:"white",fontFamily:"var(--fb)",fontSize:11,fontWeight:700,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
          {copied?"✅ Copied!":"📋 Copy"}
        </button>
      </div>
      {/* Share buttons */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <a href={waUrl} target="_blank" rel="noreferrer"
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"9px",borderRadius:"var(--r)",background:"#25d366",color:"white",fontFamily:"var(--fb)",fontWeight:700,fontSize:12,textDecoration:"none"}}>
          💬 Share on WhatsApp
        </a>
        <button onClick={copyLink}
          style={{padding:"9px",borderRadius:"var(--r)",border:"1.5px solid rgba(255,255,255,.25)",background:"transparent",color:"white",fontFamily:"var(--fb)",fontWeight:700,fontSize:12,cursor:"pointer"}}>
          {copied?"✅ Link Copied!":"🔗 Copy Link"}
        </button>
      </div>
      <div style={{marginTop:10,fontSize:10,color:"rgba(255,255,255,.45)",textAlign:"center"}}>
        Share this link anywhere — customers can browse and order without an account
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SHOP PAGE  — accessible via ?shop=username
// ══════════════════════════════════════════════════════════════════════════════
function PublicShopPage({biz, toast, onClose, user, profile}) {
  const [cart,       setCart]       = useState({});
  const [showCart,   setShowCart]   = useState(false);
  const [placing,    setPlacing]    = useState(false);
  const [receipt,    setReceipt]    = useState(null);
  const [search,     setSearch]     = useState("");
  const [form,       setForm]       = useState({address:"",payment:"cash",deliveryType:"delivery"});
  const [authPrompt, setAuthPrompt] = useState(false);

  const products = (biz.products||[]).filter(p=>p.available);
  const filtered = products.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase()));

  const cartItems   = Object.entries(cart).map(([id,qty])=>({...products.find(p=>p.id===id),qty})).filter(i=>i&&i.id&&i.qty>0);
  const cartSubtotal= cartItems.reduce((s,i)=>s+(i.discountPrice||i.price)*i.qty,0);
  const riderFee    = form.deliveryType==="delivery"&&biz.riderFee?parseFloat(biz.riderFee)||0:0;
  const cartTotal   = cartSubtotal + riderFee;
  const itemCount   = cartItems.reduce((s,i)=>s+i.qty,0);

  function addToCart(id){
    if(!user){ setAuthPrompt(true); return; }
    setCart(c=>({...c,[id]:(c[id]||0)+1}));
  }
  function setQty(id,delta){ setCart(c=>({...c,[id]:Math.max(0,(c[id]||0)+delta)})); }

  async function doPlace(){
    if(!user){ setAuthPrompt(true); return; }
    if(form.deliveryType==="delivery"&&!form.address){ toast("Please enter delivery address","error"); return; }
    setPlacing(true);
    try{
      const orderId = "ORD-"+Math.random().toString(36).slice(2,8).toUpperCase();
      const orderData = {
        orderId, customerId:user.uid, customerName:profile?.name||"Guest",
        customerPhone:profile?.phone||"",
        businessId:biz.id, businessName:biz.name, businessLogo:biz.logo||"",
        items:cartItems, subtotal:cartSubtotal, riderFee, total:cartTotal,
        address:form.deliveryType==="walkin"?"Walk-in / Self-pickup":form.address,
        payment:form.payment, deliveryType:form.deliveryType, region:biz.region,
      };
      await placeOrder(orderData);
      setReceipt({order:{...orderData,status:"pending",timestamp:Date.now()},biz});
      setCart({}); setShowCart(false);
      toast("Order placed! 🎉");
    }catch(e){toast("Failed: "+e.message,"error");}
    finally{setPlacing(false);}
  }

  if(receipt) return (
    <div style={{minHeight:"100vh",background:"var(--cream)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",background:"var(--white)",boxShadow:"var(--sh)"}}>
        <button onClick={onClose} style={{border:"none",background:"none",fontSize:22,cursor:"pointer",color:"var(--g1)"}}>←</button>
        <span style={{fontFamily:"var(--ff)",fontWeight:800,fontSize:16}}>Order Confirmed</span>
      </div>
      <Receipt order={receipt.order} biz={receipt.biz} onClose={onClose}/>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--cream)"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",padding:"14px 16px 18px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,.18)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <button onClick={onClose} style={{width:34,height:34,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.1)",color:"white",fontSize:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
          <div style={{flex:1,fontFamily:"var(--ff)",fontSize:11,color:"rgba(255,255,255,.55)",fontWeight:600}}>localbizgh.web.app/?shop={biz.ownerUsername||profile?.username||""}</div>
          {itemCount>0&&<button onClick={()=>setShowCart(true)} style={{padding:"7px 14px",borderRadius:"var(--r)",border:"none",background:"var(--lime)",color:"var(--g1)",fontFamily:"var(--fb)",fontWeight:800,fontSize:12,cursor:"pointer",flexShrink:0}}>🛒 {itemCount} · {fmt(cartTotal)}</button>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:60,height:60,borderRadius:14,overflow:"hidden",border:"2.5px solid rgba(255,255,255,.25)",flexShrink:0,background:"rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {biz.logo?<img src={biz.logo} alt={biz.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:28}}>{catEmo(biz.category)}</span>}
          </div>
          <div>
            <div style={{fontFamily:"var(--ff)",fontSize:20,fontWeight:900,color:"white"}}>{biz.name}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.65)",marginTop:2}}>{biz.category} · {biz.region}{biz.town?", "+biz.town:""}</div>
            {biz.rating>0&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:2}}>⭐ {Number(biz.rating).toFixed(1)}</div>}
          </div>
        </div>
        {biz.description&&<div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:10,lineHeight:1.5}}>{biz.description}</div>}
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
          {biz.contactPhone&&<a href={`tel:${biz.contactPhone}`} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(255,255,255,.12)",color:"white",fontWeight:600,textDecoration:"none"}}>📞 {biz.contactPhone}</a>}
          {biz.whatsapp&&<a href={`https://wa.me/${(biz.whatsapp||"").replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(37,211,102,.2)",color:"#4ade80",fontWeight:600,textDecoration:"none"}}>💬 WhatsApp</a>}
          <span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.7)",fontWeight:600}}>🏍️ {biz.riderFee?`Delivery: ${fmt(biz.riderFee)}`:"Free Delivery"}</span>
          {biz.deliveryNote&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(245,158,11,.15)",color:"#fbbf24",fontWeight:600}}>📌 {biz.deliveryNote}</span>}
        </div>
      </div>

      {/* Auth prompt */}
      {authPrompt&&(
        <div style={{margin:"12px 14px",background:"rgba(251,191,36,.1)",border:"1.5px solid rgba(251,191,36,.3)",borderRadius:"var(--r2)",padding:"14px 16px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:22}}>🔐</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:13}}>Sign in to order</div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Create a free account or sign in to place your order.</div>
          </div>
          <button onClick={()=>setAuthPrompt(false)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"var(--amber2)",color:"white",fontFamily:"var(--fb)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sign Up</button>
        </div>
      )}

      {/* Search */}
      <div style={{padding:"12px 14px 0"}}>
        <div className="sbox"><span>🔍</span><input placeholder={`Search ${biz.name} products…`} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button style={{border:"none",background:"none",cursor:"pointer",fontSize:15}} onClick={()=>setSearch("")}>✕</button>}</div>
      </div>

      {/* Products grid */}
      <div style={{padding:"12px 14px 100px"}}>
        {filtered.length===0
          ?<div className="empty-st"><span className="ico">📦</span><h3>No products found</h3></div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
            {filtered.map(p=>{
              const qty=cart[p.id]||0;
              const saving=p.discountPrice&&p.price>p.discountPrice?p.price-p.discountPrice:0;
              return(
              <div key={p.id} className="prod-item" style={{position:"relative"}}>
                {p.discountTag&&<div className="disc-badge">{p.discountTag}</div>}
                <div className="pi-img">{p.image?<img src={p.image} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div className="pi-emo">{p.emoji||"📦"}</div>}</div>
                <div className="pi-body">
                  <div className="pi-name">{p.name}</div>
                  {p.description&&<div className="pi-desc">{p.description}</div>}
                  <div className="pi-foot">
                    {saving>0
                      ?<div><div className="disc-orig">{fmt(p.price)}</div><div style={{fontFamily:"var(--ff)",fontWeight:900,color:"var(--g1)",fontSize:16}}>{fmt(p.discountPrice)}</div><div className="disc-save">-{fmt(saving)}</div></div>
                      :<div className="pi-price">{fmt(p.price)}</div>
                    }
                    {qty===0
                      ?<button className="pi-add" onClick={()=>addToCart(p.id)}>+</button>
                      :<div className="pi-qty"><button onClick={()=>setQty(p.id,-1)}>−</button><span>{qty}</span><button onClick={()=>addToCart(p.id)}>+</button></div>
                    }
                  </div>
                </div>
              </div>
            );})}
          </div>
        }
      </div>

      {/* Cart FAB */}
      {itemCount>0&&!showCart&&(
        <div onClick={()=>setShowCart(true)} style={{position:"fixed",bottom:20,right:16,left:16,background:"var(--g1)",borderRadius:50,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 6px 24px rgba(26,61,43,.4)",cursor:"pointer",zIndex:200}}>
          <span style={{color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:14}}>🛒 {itemCount} item{itemCount>1?"s":""}</span>
          <span style={{color:"var(--lime)",fontFamily:"var(--ff)",fontWeight:900,fontSize:16}}>{fmt(cartTotal)} →</span>
        </div>
      )}

      {/* Cart panel */}
      {showCart&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:500}} onClick={()=>setShowCart(false)}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"var(--white)",borderRadius:"var(--r2) var(--r2) 0 0",padding:"20px 16px",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontFamily:"var(--ff)",fontWeight:900,fontSize:18,margin:0}}>Your Cart</h3>
              <button onClick={()=>setShowCart(false)} style={{width:30,height:30,borderRadius:"50%",border:"none",background:"var(--cream2)",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            {cartItems.map(i=>(
              <div key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--border2)"}}>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{i.emoji} {i.name}</div><div style={{fontSize:11,color:"var(--muted)"}}>{fmt(i.discountPrice||i.price)} each</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>setQty(i.id,-1)} style={{width:26,height:26,borderRadius:"50%",border:"1.5px solid var(--border2)",background:"var(--cream)",cursor:"pointer",fontWeight:700}}>−</button>
                  <span style={{fontWeight:700,minWidth:18,textAlign:"center"}}>{i.qty}</span>
                  <button onClick={()=>setQty(i.id,1)} style={{width:26,height:26,borderRadius:"50%",border:"none",background:"var(--g1)",color:"white",cursor:"pointer",fontWeight:700}}>+</button>
                </div>
                <div style={{fontFamily:"var(--ff)",fontWeight:700,minWidth:60,textAlign:"right"}}>{fmt((i.discountPrice||i.price)*i.qty)}</div>
              </div>
            ))}
            <div style={{paddingTop:12,marginTop:4}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"var(--muted)"}}>Subtotal</span><span style={{fontWeight:700}}>{fmt(cartSubtotal)}</span></div>
              {riderFee>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"var(--muted)"}}>🏍️ Rider fee</span><span style={{fontWeight:700,color:"var(--coral)"}}>{fmt(riderFee)}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:900,fontFamily:"var(--ff)",paddingTop:8,borderTop:"2px solid var(--border2)",marginTop:4}}><span>Total</span><span style={{color:"var(--amber2)"}}>{fmt(cartTotal)}</span></div>
            </div>
            {/* Delivery type */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,margin:"14px 0"}}>
              {[["delivery","🏍️","Delivery",biz.riderFee?`+${fmt(biz.riderFee)}`:""],["walkin","🚶","Walk-in","No fee"]].map(([t,ico,lbl,sub])=>(
                <div key={t} onClick={()=>setForm(f=>({...f,deliveryType:t,address:""}))}
                  style={{padding:"10px",borderRadius:"var(--r)",border:`2px solid ${form.deliveryType===t?"var(--g1)":"var(--border2)"}`,background:form.deliveryType===t?"var(--cream)":"transparent",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:20}}>{ico}</div>
                  <div style={{fontSize:12,fontWeight:800,color:form.deliveryType===t?"var(--g1)":"var(--muted)"}}>{lbl}</div>
                  {sub&&<div style={{fontSize:10,color:t==="walkin"?"var(--lime3)":"var(--coral)",fontWeight:700,marginTop:1}}>{sub}</div>}
                </div>
              ))}
            </div>
            {form.deliveryType==="delivery"&&<div className="fgrp"><label>Delivery Address *</label><textarea className="finp" rows={2} style={{resize:"none"}} placeholder="Full delivery address" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>}
            {form.deliveryType==="walkin"&&<div style={{background:"rgba(74,222,128,.08)",border:"1.5px solid rgba(74,222,128,.2)",borderRadius:"var(--r)",padding:"10px 13px",marginBottom:10,fontSize:12,color:"var(--lime3)",fontWeight:600}}>🚶 You'll collect from <strong>{biz.name}</strong></div>}
            <div className="fgrp"><label>Payment Method</label>
              <select className="finp" value={form.payment} onChange={e=>setForm(f=>({...f,payment:e.target.value}))}>
                {PAYMENTS.map(p=><option key={p.v} value={p.v}>{p.label}</option>)}
              </select>
            </div>
            {!user&&<div style={{background:"rgba(251,191,36,.1)",border:"1.5px solid rgba(251,191,36,.3)",borderRadius:"var(--r)",padding:"10px 13px",marginBottom:10,fontSize:12,color:"var(--amber)",fontWeight:600}}>⚠️ Sign in or create a free account to place your order</div>}
            <button onClick={doPlace} disabled={placing||!user} style={{width:"100%",padding:"14px",borderRadius:"var(--r)",border:"none",background:user?"var(--g1)":"var(--border)",color:user?"white":"var(--muted)",fontFamily:"var(--fb)",fontWeight:800,fontSize:14,cursor:user?"pointer":"not-allowed"}}>
              {placing?"Placing…":user?`Place Order · ${fmt(cartTotal)}`:"Sign in to Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC RIDER PAGE  — accessible via ?rider=username
// ══════════════════════════════════════════════════════════════════════════════
function PublicRiderPage({rider, toast, onClose}) {
  const shareUrl = `https://localbizgh.web.app/?rider=${rider.username||""}`;
  return (
    <div style={{minHeight:"100vh",background:"var(--cream)"}}>
      <div style={{background:"linear-gradient(135deg,var(--g1),var(--g2))",padding:"50px 20px 30px"}}>
        <button onClick={onClose} style={{position:"absolute",top:16,left:14,width:34,height:34,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.1)",color:"white",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div style={{textAlign:"center"}}>
          <div style={{width:88,height:88,borderRadius:"50%",overflow:"hidden",border:"3px solid rgba(255,255,255,.3)",margin:"0 auto 12px"}}>
            {rider.photo?<img src={rider.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={rider.name}/>:<div style={{width:"100%",height:"100%",background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,fontWeight:900,color:"white"}}>{rider.name[0]}</div>}
          </div>
          <div style={{fontFamily:"var(--ff)",fontSize:24,fontWeight:900,color:"white"}}>{rider.name}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.65)",marginTop:4}}>{rider.vehicle} · {rider.region}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.7)",marginTop:4}}>⭐ {Number(rider.rating||5).toFixed(1)} · {rider.trips||0} deliveries</div>
          {rider.available?<div style={{display:"inline-block",marginTop:10,padding:"4px 14px",borderRadius:20,background:"rgba(74,222,128,.2)",color:"var(--lime)",fontSize:12,fontWeight:700}}>🟢 Available for deliveries</div>
           :<div style={{display:"inline-block",marginTop:10,padding:"4px 14px",borderRadius:20,background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",fontSize:12,fontWeight:700}}>⚫ Currently offline</div>}
        </div>
        <div style={{marginTop:18}}>
          <ShareLinkWidget url={shareUrl} label={rider.name}/>
        </div>
      </div>
      <div style={{padding:16}}>
        {rider.phone&&<a href={`tel:${rider.phone}`} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:"var(--white)",borderRadius:"var(--r2)",boxShadow:"var(--sh)",marginBottom:10,textDecoration:"none",color:"var(--ink)"}}>
          <span style={{fontSize:22}}>📞</span><div><div style={{fontWeight:700,fontSize:14}}>Call {rider.name}</div><div style={{fontSize:12,color:"var(--muted)"}}>{rider.phone}</div></div>
        </a>}
        {rider.phone&&<a href={`https://wa.me/${(rider.phone||"").replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:"#25d366",borderRadius:"var(--r2)",boxShadow:"var(--sh)",marginBottom:10,textDecoration:"none",color:"white"}}>
          <span style={{fontSize:22}}>💬</span><div><div style={{fontWeight:700,fontSize:14}}>WhatsApp {rider.name}</div><div style={{fontSize:12,color:"rgba(255,255,255,.75)"}}>Send a delivery request</div></div>
        </a>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NOT FOUND PAGE
// ══════════════════════════════════════════════════════════════════════════════
function PublicNotFound({username, type}) {
  return (
    <div style={{minHeight:"100vh",background:"var(--cream)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>🔍</div>
      <h2 style={{fontFamily:"var(--ff)",fontSize:22,fontWeight:900,color:"var(--ink)",marginBottom:8}}>
        {type==="shop"?"Shop not found":"Rider not found"}
      </h2>
      <p style={{fontSize:14,color:"var(--muted)",marginBottom:20}}>
        No {type==="shop"?"business":"rider"} found with the username <strong>@{username}</strong>.<br/>
        The link may be incorrect or this account may have been removed.
      </p>
      <button onClick={()=>window.location.href=window.location.pathname}
        style={{padding:"12px 24px",borderRadius:"var(--r)",border:"none",background:"var(--g1)",color:"white",fontFamily:"var(--fb)",fontWeight:800,fontSize:14,cursor:"pointer"}}>
        ← Go to LocalBiz Home
      </button>
    </div>
  );
}

export default function App() {
  const [fbUser,  setFbUser]  = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authMode,setAuthMode]= useState(null);
  const [authRole,setAuthRole]= useState(null);
  const [tab,     setTab]     = useState(null);
  const [devRole, setDevRole] = useState("admin");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(()=>localStorage.getItem("lbDark")==="1");
  const [deepLink, setDeepLink] = useState(null); // {type:"shop"|"rider", username, data}
  const {toasts, toast}       = useToast();

  // Apply dark mode class to body
  useEffect(()=>{
    document.body.classList.toggle("dark-mode", darkMode);
    localStorage.setItem("lbDark", darkMode?"1":"0");
  },[darkMode]);

  // Handle deep links: ?shop=username or ?rider=username
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const shopSlug  = params.get("shop");
    const riderSlug = params.get("rider");
    if(shopSlug){
      getBusinessByUsername(shopSlug).then(biz=>{
        if(biz) setDeepLink({type:"shop", username:shopSlug, data:biz});
        else    setDeepLink({type:"shop", username:shopSlug, data:null, notFound:true});
      });
    } else if(riderSlug){
      getRiderByUsername(riderSlug).then(rider=>{
        if(rider) setDeepLink({type:"rider", username:riderSlug, data:rider});
        else      setDeepLink({type:"rider", username:riderSlug, data:null, notFound:true});
      });
    }
  },[]);

  useEffect(()=>{
    return onAuthChange(async user=>{
      setFbUser(user||null);
      if(user){
        const p=await fetchUserProfile(user.uid);
        setProfile(p);
        setTab(p?.role==="business"?"store":p?.role==="rider"?"rider":"browse");
        // Request browser notification permission for business owners and riders
        if(p?.role==="business"||p?.role==="rider") requestNotificationPermission();
      } else { setProfile(null); setTab(null); setIsAdmin(false); }
    });
  },[]);

  if(fbUser===undefined) return <>
    <style>{CSS}</style>
    <div className="loader"><div className="ld-logo">Local<em>Biz</em></div><div className="ld-spin"/><p style={{color:"rgba(255,255,255,.35)",fontSize:13}}>Connecting…</p><p style={{color:"rgba(255,255,255,.18)",fontSize:10,marginTop:8,fontFamily:"var(--fb)",letterSpacing:1}}>AMTECH SOFTWARE SOLUTIONS</p></div>
  </>;

  function goAdmin(){ setIsAdmin(true); setDevRole("admin"); setTab("admin"); setAuthMode(null); }
  async function signOut(){ await logoutUser(); setIsAdmin(false); toast("Signed out. See you! 👋"); }

  const getNavTabs = () => {
    if(isAdmin) return ADMIN_ROLES.map(r=>({id:r.id==="admin"?"admin":r.id,ico:r.ico,label:r.label,isAdm:r.id==="admin"}));
    if(profile?.role==="business") return [{id:"store",ico:"🏪",label:"My Store"},{id:"admin",ico:"⚡",label:"Admin",isAdm:true}];
    if(profile?.role==="rider")    return [{id:"rider",ico:"🏍️",label:"Deliveries"},{id:"admin",ico:"⚡",label:"Admin",isAdm:true}];
    return [{id:"browse",ico:"🛒",label:"Shop"},{id:"orders",ico:"📋",label:"Orders"},{id:"admin",ico:"⚡",label:"Admin",isAdm:true}];
  };

  const renderMain = () => {
    // Deep link — public shop or rider page (no auth required)
    if(deepLink) {
      if(deepLink.notFound) return <PublicNotFound username={deepLink.username} type={deepLink.type}/>;
      if(deepLink.type==="shop"  && deepLink.data) return <PublicShopPage  biz={deepLink.data}   toast={toast} onClose={()=>{setDeepLink(null);window.history.replaceState({},"",window.location.pathname);}} user={fbUser} profile={profile}/>;
      if(deepLink.type==="rider" && deepLink.data) return <PublicRiderPage rider={deepLink.data} toast={toast} onClose={()=>{setDeepLink(null);window.history.replaceState({},"",window.location.pathname);}}/>;
      return null;
    }
    if(isAdmin && devRole==="customer") {
      const mockProfile={name:ADMIN_CREDS.username, phone:"000", region:"Greater Accra"};
      const mockUser={uid:"admin"};
      return <CustomerApp user={mockUser} profile={mockProfile} tab={tab==="orders"?"orders":"browse"} setTab={setTab} toast={toast}/>;
    }
    if(isAdmin && devRole==="store") return <AdminBizProxy toast={toast}/>;
    if(isAdmin && devRole==="rider") return <AdminRiderProxy toast={toast}/>;
    if((isAdmin && (devRole==="admin"||tab==="admin")) || tab==="admin") {
      if(!isAdmin) return <AdminLoginGate onSuccess={goAdmin} toast={toast}/>;
      return <AdminDashboard toast={toast}/>;
    }
    if(profile?.role==="customer"||(!profile&&fbUser)) return <CustomerApp user={fbUser} profile={profile} tab={tab||"browse"} setTab={setTab} toast={toast}/>;
    if(profile?.role==="business"&&tab==="store") return <BusinessApp key={fbUser?.uid} user={fbUser} profile={profile} toast={toast}/>;
    if(profile?.role==="rider"&&tab==="rider") return <RiderApp user={fbUser} profile={profile} toast={toast}/>;
    return null;
  };

  const navTabs = getNavTabs();

  function handleTabClick(t) {
    if(t.isAdm){ setTab("admin"); if(isAdmin)setDevRole("admin"); }
    else { setTab(t.id); if(isAdmin)setDevRole(t.id); }
    setMobileMenu(false);
  }

  return (
    <>
      <style>{CSS}</style>
      <Toasts toasts={toasts}/>
      {/* Onboarding tour — shown once after sign up */}
      {profile && <OnboardingTour role={profile.role} />}
      {authMode&&<AuthModal mode={authMode} defaultRole={authRole} onClose={()=>{setAuthMode(null);setAuthRole(null);}} toast={toast} onAdminAccess={goAdmin}/>}
      {!fbUser&&!isAdmin&&<Landing onAuth={(m,r=null)=>{setAuthMode(m);setAuthRole(r);}} onAdminDirect={goAdmin}/>}
      {(fbUser||isAdmin)&&<div className="shell">
        {/* ── VERSION STAMP — remove after confirming deploy ── */}
        <div style={{background:"#d97706",color:"white",textAlign:"center",fontSize:11,fontWeight:800,padding:"4px 0",letterSpacing:.5,flexShrink:0}}>
          ✅ AMTECH SOFTWARE SOLUTIONS · LocalBiz GH · v5.0 · {new Date().toLocaleDateString("en-GH")}
        </div>
        <header className="topbar">
          <div className="tb-brand" onClick={()=>setTab(isAdmin?"admin":profile?.role==="business"?"store":profile?.role==="rider"?"rider":"browse")} style={{flexDirection:"column",alignItems:"flex-start",gap:0}}>
            <span>Local<em>Biz</em><sup>GH</sup></span>
            <span style={{fontSize:8,fontFamily:"var(--fb)",fontWeight:800,color:"#d97706",letterSpacing:.6,lineHeight:1,marginTop:1}}>BY AMTECH SOFTWARE SOLUTIONS</span>
          </div>
          {/* Desktop tabs */}
          <div className="tb-tabs">
            {navTabs.map(t=>(
              <button key={t.id} className={`tb-tab ${t.isAdm?"adm":""} ${(isAdmin?devRole===t.id:tab===t.id)?"act":""}`}
                onClick={()=>handleTabClick(t)}>
                {t.ico} <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="tb-right">
            {profile&&<div className="user-chip" style={{display:"flex"}}><span style={{maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(profile.name||"").split(" ")[0]}</span><span className="role-tag rt-admin" style={{background:"rgba(74,222,128,.14)",color:"var(--lime3)",marginLeft:4}}>@{profile.username||profile.role}</span></div>}
            {isAdmin&&!profile&&<div className="user-chip"><span>Admin</span><span className="role-tag rt-admin">admin</span></div>}
            {/* Dark mode toggle */}
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Switch to Light Mode":"Switch to Dark Mode"}
              style={{width:34,height:34,borderRadius:"50%",border:"1.5px solid var(--border)",background:darkMode?"#1e2a3a":"var(--cream2)",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0}}>
              {darkMode?"☀️":"🌙"}
            </button>
            {/* Mobile menu button */}
            <button className="tb-menu-btn" onClick={()=>setMobileMenu(true)}>☰</button>
            <button className="btn-out" onClick={signOut}>Sign Out</button>
          </div>
        </header>
        {/* Mobile drawer */}
        {mobileMenu&&<div className="tb-mobile-drawer" onClick={()=>setMobileMenu(false)}>
          <div className="tmd-backdrop"/>
          <div className="tmd-panel" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"var(--ff)",fontSize:17,fontWeight:900,color:"var(--g1)",marginBottom:8,padding:"0 0 10px",borderBottom:"1px solid var(--border2)"}}>
              Local<span style={{color:"var(--amber)"}}>Biz</span><sup style={{fontSize:10,background:"var(--lime)",color:"var(--g1)",borderRadius:5,padding:"1px 5px",fontFamily:"var(--fb)",fontWeight:900}}>GH</sup>
              <div style={{fontSize:8,color:"var(--muted)",fontFamily:"var(--fb)",fontWeight:700,letterSpacing:.8,marginTop:2}}>BY AMTECH SOFTWARE SOLUTIONS</div>
            </div>
            {profile&&<div style={{fontSize:12,color:"var(--muted)",marginBottom:10,padding:"0 4px"}}>👤 {profile.name} · {profile.region}{profile.town?`, ${profile.town}`:""}</div>}
            {navTabs.map(t=>(
              <button key={t.id} className={`tmd-btn ${(isAdmin?devRole===t.id:tab===t.id)?"act":""}`} onClick={()=>handleTabClick(t)}>
                <span style={{fontSize:18}}>{t.ico}</span> {t.label}
              </button>
            ))}
            <button className="tmd-btn" style={{color:"var(--red)",marginTop:8,borderTop:"1px solid var(--border2)",paddingTop:14}} onClick={()=>{signOut();setMobileMenu(false);}}>
              <span style={{fontSize:18}}>🚪</span> Sign Out
            </button>
          </div>
        </div>}
        {isAdmin&&<div className="dev-bar">
          <span className="dev-bar-label">⚡ Dev Mode:</span>
          {ADMIN_ROLES.map(r=>(
            <button key={r.id} className={`dev-role-btn ${devRole===r.id?"act":""}`}
              onClick={()=>{ setDevRole(r.id); setTab(r.id==="admin"?"admin":r.id); }}>
              {r.ico} {r.label}
            </button>
          ))}
          <span className="dev-info">Unlimited access to all views</span>
        </div>}
        <main style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>{renderMain()}</main>
      </div>}
    </>
  );
}

function AdminBizProxy({toast}) {
  const [businesses,setBiz]=useState([]);
  useEffect(()=>listenBusinesses(setBiz),[]);
  if(businesses.length===0) return <div className="empty-st" style={{paddingTop:80}}><span className="ico">🏪</span><h3>No businesses yet</h3></div>;
  const mockUser={uid:businesses[0].ownerId};
  const mockProfile={name:businesses[0].ownerName,phone:businesses[0].ownerPhone,region:businesses[0].region,username:businesses[0].ownerUsername||""};
  return <BusinessApp key={businesses[0].id} user={mockUser} profile={mockProfile} toast={toast}/>;
}
function AdminRiderProxy({toast}) {
  const [riders,setRiders]=useState([]);
  useEffect(()=>listenAllRiders(setRiders),[]);
  if(riders.length===0) return <div className="empty-st" style={{paddingTop:80}}><span className="ico">🏍️</span><h3>No riders yet</h3></div>;
  const mockUser={uid:riders[0].userId};
  const mockProfile={name:riders[0].name,phone:riders[0].phone,region:riders[0].region,username:riders[0].username||""};
  return <RiderApp user={mockUser} profile={mockProfile} toast={toast}/>;
}
function AdminLoginGate({onSuccess, toast}) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [loading,setL]=useState(false);
  function attempt(){ setL(true); setTimeout(()=>{ if(u===ADMIN_CREDS.username&&p===ADMIN_CREDS.password){onSuccess();toast("Welcome, Admin ⚡");}else{setErr("Invalid credentials.");} setL(false); },700); }
  return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:"#0d1117",borderRadius:"var(--r3)",padding:38,width:"100%",maxWidth:380,boxShadow:"var(--sh3)"}}>
      <div style={{textAlign:"center",marginBottom:26}}><div style={{fontSize:34,marginBottom:9}}>⚡</div><h2 style={{fontFamily:"var(--ff)",color:"var(--amber)",fontSize:20}}>Admin Access</h2></div>
      {err&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.22)",borderRadius:9,padding:"8px 12px",color:"#fca5a5",fontSize:12,marginBottom:11}}>{err}</div>}
      <input style={{width:"100%",padding:"11px 13px",borderRadius:"var(--r)",border:"1.5px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.07)",color:"white",fontFamily:"var(--fb)",fontSize:14,outline:"none",marginBottom:9}} placeholder="Username" value={u} onChange={e=>{setU(e.target.value);setErr("");}}/>
      <input style={{width:"100%",padding:"11px 13px",borderRadius:"var(--r)",border:"1.5px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.07)",color:"white",fontFamily:"var(--fb)",fontSize:14,outline:"none",marginBottom:0}} type="password" placeholder="Password" value={p} onChange={e=>{setP(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&attempt()}/>
      <button onClick={attempt} disabled={loading} style={{width:"100%",marginTop:16,padding:13,borderRadius:"var(--r)",border:"none",background:"linear-gradient(135deg,var(--amber),var(--amber2))",color:"var(--ink)",fontFamily:"var(--fb)",fontSize:14,fontWeight:800,cursor:"pointer"}}>
        {loading?"Authenticating…":"Access Dashboard →"}
      </button>
    </div>
  </div>;
}
