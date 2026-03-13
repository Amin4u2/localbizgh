// ─────────────────────────────────────────────────────────────────────────────
// src/newFeatures.jsx  —  LocalBiz GH
// Contains:
//   1. ForgotPasswordModal    — reset password by email
//   2. OrderNotifyPanel       — business owner order alert (WhatsApp + in-app)
//   3. OnboardingTour         — step-by-step guide shown once after sign up
//   4. RegionDistrictSelect   — fixed region+district dropdowns (all 16)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { GHANA_REGIONS, REGION_NAMES, getDistricts, BUSINESS_CATEGORIES } from "./regions";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";

// ══════════════════════════════════════════════════════════════════════════════
// 1. FORGOT PASSWORD MODAL
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Add this to your sign-in form:
 *   <ForgotPasswordModal />
 *
 * It renders as a clickable "Forgot password?" link.
 * On click → modal opens → user enters email → reset link sent.
 */
export function ForgotPasswordModal() {
  const [open,    setOpen]    = useState(false);
  const [email,   setEmail]   = useState("");
  const [status,  setStatus]  = useState("idle"); // idle | loading | sent | error
  const [errMsg,  setErrMsg]  = useState("");

  async function handleReset() {
    if (!email.trim()) { setErrMsg("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErrMsg("Enter a valid email address."); return; }
    setStatus("loading");
    setErrMsg("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("sent");
    } catch (e) {
      setErrMsg(
        e.code === "auth/user-not-found"
          ? "No account found with that email."
          : "Failed to send reset email. Please try again."
      );
      setStatus("error");
    }
  }

  function close() { setOpen(false); setEmail(""); setStatus("idle"); setErrMsg(""); }

  return (
    <>
      {/* Trigger link */}
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", color: "#4f46e5",
          fontSize: 13, cursor: "pointer", padding: 0,
          textDecoration: "underline", marginTop: 4,
        }}
      >
        Forgot password?
      </button>

      {/* Modal */}
      {open && (
        <div style={OVERLAY} onClick={close}>
          <div style={CARD} onClick={e => e.stopPropagation()}>
            <button onClick={close} style={CLOSE_BTN}>✕</button>

            {status === "sent" ? (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
                <h3 style={{ margin: "0 0 8px", color: "#16a34a" }}>Reset Link Sent!</h3>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 20px" }}>
                  Check your email <strong>{email}</strong> for a password reset link.
                  It may take a minute to arrive.
                </p>
                <button onClick={close} style={BTN_PRIMARY}>Close</button>
              </div>
            ) : (
              <>
                <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>🔐 Reset Password</h2>
                <p style={{ margin: "0 0 20px", color: "#666", fontSize: 14 }}>
                  Enter the email address on your account and we'll send you a reset link.
                </p>

                <label style={LABEL}>Email Address</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrMsg(""); }}
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                  style={{ ...INPUT, borderColor: errMsg ? "#e53e3e" : "#ddd" }}
                  autoFocus
                />
                {errMsg && <p style={ERR_TEXT}>{errMsg}</p>}

                <button
                  onClick={handleReset}
                  disabled={status === "loading"}
                  style={{ ...BTN_PRIMARY, marginTop: 16, opacity: status === "loading" ? 0.7 : 1 }}
                >
                  {status === "loading" ? "Sending…" : "Send Reset Link"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ORDER NOTIFICATION PANEL — for business owners
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Place this wherever a new order is detected in your business dashboard.
 * It shows an in-app alert AND offers WhatsApp notification buttons.
 *
 * Usage:
 *   <OrderNotifyPanel
 *     order={newOrder}
 *     business={myBusiness}
 *     onDismiss={() => setNewOrder(null)}
 *   />
 */
export function OrderNotifyPanel({ order, business, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!order) return;
    // Play a soft notification sound using Web Audio API
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {}

    // Browser push notification if permission granted
    if (Notification.permission === "granted") {
      new Notification("🛍️ New Order — LocalBiz GH", {
        body: `${order.customerName || "A customer"} placed an order worth GHS ${order.total || 0}`,
        icon: business?.logo || "/favicon.ico",
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, [order]);

  if (!order || !visible) return null;

  const items  = (order.items || []).map(i => `${i.name} x${i.qty || 1}`).join(", ");
  const waMsg  = encodeURIComponent(
    `🛍️ *New Order Alert — ${business?.name || "LocalBiz GH"}*\n\n` +
    `Customer: ${order.customerName || "—"}\n` +
    `Phone: ${order.customerPhone || "—"}\n` +
    `Address: ${order.address || "—"}\n` +
    `Items: ${items}\n` +
    `Total: GHS ${order.total || 0}\n` +
    `Payment: ${order.paymentMethod === "momo" ? "Mobile Money" : order.paymentMethod || "—"}\n\n` +
    `Order ID: ${order.id || "—"}`
  );

  // WhatsApp DM to business owner's own number (self-notification)
  const ownerPhone = (business?.ownerPhone || "").replace(/\D/g, "").replace(/^0/, "233");
  const waLink     = `https://wa.me/${ownerPhone}?text=${waMsg}`;

  function dismiss() { setVisible(false); if (onDismiss) onDismiss(); }

  return (
    <div style={{
      position:   "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "#fff", borderRadius: 16, padding: "18px 20px",
      boxShadow:  "0 8px 40px rgba(0,0,0,0.18)",
      border:     "2px solid #16a34a",
      maxWidth:   340, width: "calc(100vw - 48px)",
      animation:  "slideUp 0.4s ease",
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(80px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#16a34a" }}>
            🛍️ New Order Received!
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>
            <strong>{order.customerName || "Customer"}</strong> — GHS {order.total || 0}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>
            {items.slice(0, 60)}{items.length > 60 ? "…" : ""}
          </p>
        </div>
        <button onClick={dismiss} style={{ ...CLOSE_BTN, position: "relative", top: 0, right: 0 }}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {/* WhatsApp self-notification */}
        {ownerPhone && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, background: "#25D366", color: "#fff",
              borderRadius: 8, padding: "8px 0", textAlign: "center",
              fontWeight: 700, fontSize: 13, textDecoration: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            📲 WhatsApp
          </a>
        )}
        <button
          onClick={dismiss}
          style={{
            flex: 1, background: "#f3f4f6", border: "none",
            borderRadius: 8, padding: "8px 0", fontWeight: 600,
            fontSize: 13, cursor: "pointer", color: "#374151",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/**
 * Request browser notification permission.
 * Call this once when business owner logs in.
 */
export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. ONBOARDING TOUR — shown once after sign up
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Add this to your main App layout.
 * It shows a step-by-step guide overlay the FIRST TIME a user signs up.
 *
 * Usage:
 *   <OnboardingTour role={user.role} onComplete={() => {}} />
 *
 * It auto-hides after completion and saves to localStorage so it only shows once.
 */

const TOUR_STEPS = {
  customer: [
    {
      icon: "🏪",
      title: "Welcome to LocalBiz GH!",
      body:  "Discover and shop from local businesses near you across Ghana. Let's show you around!",
    },
    {
      icon: "🔍",
      title: "Browse Businesses",
      body:  "Use the search and filter to find businesses by region, category, or name. Tap any business to see their products.",
    },
    {
      icon: "🛒",
      title: "Add to Cart & Order",
      body:  "Browse a business's products, add items to your cart, then place your order with delivery to your doorstep.",
    },
    {
      icon: "💳",
      title: "Pay with MoMo",
      body:  "Pay securely using Mobile Money. After sending payment, enter your transaction ID so the business can confirm.",
    },
    {
      icon: "📦",
      title: "Track Your Order",
      body:  "Go to 'My Orders' to see real-time status: Pending → Confirmed → Dispatched → Delivered.",
    },
    {
      icon: "⭐",
      title: "Rate & Review",
      body:  "After delivery, leave a star rating and review to help other customers and reward great businesses.",
    },
    {
      icon: "🔔",
      title: "Stay Notified",
      body:  "Allow notifications so you never miss an order update. Check your notification bell for alerts.",
    },
  ],
  business: [
    {
      icon: "🎉",
      title: "Welcome, Business Owner!",
      body:  "Your LocalBiz GH dashboard is ready. Let's get you set up to start receiving orders!",
    },
    {
      icon: "🏪",
      title: "Set Up Your Shop",
      body:  "Go to 'My Business' to add your logo, description, contact details, and WhatsApp number.",
    },
    {
      icon: "📦",
      title: "Add Your Products",
      body:  "Click 'Add Product' to list what you sell — add a name, price, photo, and category.",
    },
    {
      icon: "🚚",
      title: "Set Delivery Fees",
      body:  "Go to Settings → Delivery Fee to set a flat rate or custom fees per district for your region.",
    },
    {
      icon: "🛍️",
      title: "Receive & Manage Orders",
      body:  "When customers order, you'll get a notification. Go to 'Orders' to confirm, prepare, and dispatch.",
    },
    {
      icon: "💳",
      title: "Confirm MoMo Payments",
      body:  "For MoMo orders, check the transaction ID the customer provides and click Confirm Payment to proceed.",
    },
    {
      icon: "🏍️",
      title: "Assign Riders",
      body:  "Assign orders to your fleet drivers or partner riders from the dispatch panel.",
    },
    {
      icon: "📊",
      title: "Track Revenue",
      body:  "Your dashboard shows total orders, revenue, and delivery stats in real time.",
    },
  ],
  rider: [
    {
      icon: "🏍️",
      title: "Welcome, Rider!",
      body:  "You're now part of the LocalBiz GH delivery network. Here's how to get started.",
    },
    {
      icon: "✅",
      title: "Set Yourself Available",
      body:  "Toggle your availability in your profile so businesses and dispatchers can assign jobs to you.",
    },
    {
      icon: "📋",
      title: "View Available Jobs",
      body:  "Check 'Available Jobs' to see delivery requests in your region that need a rider.",
    },
    {
      icon: "🤝",
      title: "Partner with Businesses",
      body:  "Apply to partner with local businesses to get regular deliveries from their orders.",
    },
    {
      icon: "📦",
      title: "Complete Deliveries",
      body:  "Accept a job, pick up the package, deliver to the customer, and mark as delivered.",
    },
    {
      icon: "💰",
      title: "Track Your Earnings",
      body:  "Your dashboard shows today's trips, earnings, and your full delivery history.",
    },
  ],
};

export function OnboardingTour({ role = "customer", onComplete }) {
  const KEY   = `localbizgh_tour_done_${role}`;
  const steps = TOUR_STEPS[role] || TOUR_STEPS.customer;

  const [step,    setStep]    = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(KEY)) setVisible(true);
  }, []);

  function next() {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  }

  function finish() {
    localStorage.setItem(KEY, "1");
    setVisible(false);
    if (onComplete) onComplete();
  }

  if (!visible) return null;

  const current  = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div style={{ ...OVERLAY, background: "rgba(0,0,0,0.7)" }}>
      <div style={{
        ...CARD,
        maxWidth: 400,
        textAlign: "center",
        padding: "32px 28px",
      }}>
        {/* Progress bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 4, background: "#e5e7eb", borderRadius: "16px 16px 0 0",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
            transition: "width 0.4s ease",
          }} />
        </div>

        {/* Step counter */}
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>
          STEP {step + 1} OF {steps.length}
        </p>

        {/* Icon */}
        <div style={{ fontSize: 56, marginBottom: 16, lineHeight: 1 }}>{current.icon}</div>

        {/* Title */}
        <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#111" }}>
          {current.title}
        </h2>

        {/* Body */}
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#555", lineHeight: 1.6 }}>
          {current.body}
        </p>

        {/* Dot indicators */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i === step ? "#4f46e5" : "#d1d5db",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={finish}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              border: "1.5px solid #e5e7eb", background: "#fff",
              fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#6b7280",
            }}
          >
            Skip Tour
          </button>
          <button
            onClick={next}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {step === steps.length - 1 ? "Get Started 🚀" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. REGION + DISTRICT SELECT — fixed, all 16 regions
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Drop-in replacement for any region/district select fields.
 *
 * Usage:
 *   <RegionDistrictSelect
 *     region={form.region}
 *     district={form.district}
 *     onRegionChange={val => setForm(f => ({...f, region: val, district: ""}))}
 *     onDistrictChange={val => setForm(f => ({...f, district: val}))}
 *     regionError={errors.region}
 *     districtError={errors.district}
 *   />
 */
export function RegionDistrictSelect({
  region, district,
  onRegionChange, onDistrictChange,
  regionError, districtError,
  required = true,
}) {
  const districts = getDistricts(region || "");

  return (
    <>
      {/* Region */}
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL}>
          Region {required && <span style={{ color: "#e53e3e" }}>*</span>}
        </label>
        <select
          value={region || ""}
          onChange={e => onRegionChange(e.target.value)}
          style={{ ...INPUT, borderColor: regionError ? "#e53e3e" : "#ddd" }}
        >
          <option value="">— Select Region —</option>
          {GHANA_REGIONS.map(r => (
            <option key={r.region} value={r.region}>{r.region}</option>
          ))}
        </select>
        {regionError && <p style={ERR_TEXT}>{regionError}</p>}
      </div>

      {/* District — only shown after region selected */}
      {region && (
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>
            District / Town {required && <span style={{ color: "#e53e3e" }}>*</span>}
          </label>
          <select
            value={district || ""}
            onChange={e => onDistrictChange(e.target.value)}
            style={{ ...INPUT, borderColor: districtError ? "#e53e3e" : "#ddd" }}
          >
            <option value="">— Select District —</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {districtError && <p style={ERR_TEXT}>{districtError}</p>}
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CATEGORY PICKER with custom Other input
// ══════════════════════════════════════════════════════════════════════════════
export function CategoryPicker({ category, customCategory, onCategoryChange, onCustomChange, error }) {
  const isOther = category === "Other (specify)";
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={LABEL}>Business Category <span style={{ color: "#e53e3e" }}>*</span></label>
      <select
        value={category || ""}
        onChange={e => onCategoryChange(e.target.value)}
        style={{ ...INPUT, borderColor: error ? "#e53e3e" : "#ddd" }}
      >
        <option value="">— Select Category —</option>
        {BUSINESS_CATEGORIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {isOther && (
        <input
          type="text"
          placeholder="Type your business category"
          value={customCategory || ""}
          onChange={e => onCustomChange(e.target.value)}
          style={{ ...INPUT, marginTop: 8 }}
        />
      )}
      {error && <p style={ERR_TEXT}>{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared styles
// ══════════════════════════════════════════════════════════════════════════════
const OVERLAY = {
  position:        "fixed", inset: 0, zIndex: 9999,
  background:      "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
  display:         "flex", alignItems: "center", justifyContent: "center",
  padding:         16,
};
const CARD = {
  background:    "#fff", borderRadius: 18, width: "100%",
  maxWidth:       480,   maxHeight: "92vh", overflowY: "auto",
  boxShadow:     "0 24px 64px rgba(0,0,0,0.22)",
  padding:       "28px 24px", position: "relative",
};
const CLOSE_BTN = {
  position: "absolute", top: 14, right: 16,
  background: "none", border: "none", fontSize: 20,
  cursor: "pointer", color: "#9ca3af", lineHeight: 1,
};
const LABEL = {
  display: "block", fontWeight: 600, fontSize: 14,
  color: "#374151", marginBottom: 6,
};
const INPUT = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1.5px solid #ddd", fontSize: 15,
  outline: "none", boxSizing: "border-box", background: "#fafafa",
};
const ERR_TEXT = {
  color: "#e53e3e", fontSize: 12, margin: "4px 0 0", fontWeight: 500,
};
const BTN_PRIMARY = {
  width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
};
