// ─────────────────────────────────────────────────────────────────────────────
// src/uiHelpers.jsx  —  LocalBiz GH · Reusable UI patterns
//
// Covers:
//   1. Modal  — click-outside disabled (won't close accidentally)
//   2. FormField — shows validation errors inline
//   3. RegionDistrictPicker — 16 regions + live district dropdown
//   4. CategoryPicker — with custom "Other" text input
//   5. WhatsAppButton — opens DM directly
//   6. MomoPaymentFlow — customer submits transaction ID
//   7. MomoConfirmPanel — business owner confirms
//   8. ReceiptModal — branded receipt with WhatsApp / SMS send
//   9. DeliveryFeeSettings — business owner sets fee structure
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { GHANA_REGIONS, BUSINESS_CATEGORIES, getDistricts } from "./regions";
import {
  openWhatsAppChat, sendReceiptWhatsApp,
  submitMomoTransactionId, confirmMomoPayment,
  setDeliveryFee, calculateDeliveryFee,
  validateEmail, validatePhone, validateUsername,
  validatePassword, validateRequired,
} from "./firebase";

// ══════════════════════════════════════════════════════════════════════════════
// 1. MODAL  — does NOT close on backdrop click  ✅
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage:
 *   <Modal open={showLogin} onClose={() => setShowLogin(false)} title="Sign In">
 *     ...form contents...
 *   </Modal>
 *
 * Clicking outside the modal card does NOTHING (stopPropagation on the card).
 * Only the explicit ✕ button or calling onClose() closes it.
 */
export function Modal({ open, onClose, title, children, maxWidth = "480px" }) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position:        "fixed", inset: 0, zIndex: 9999,
        background:      "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display:         "flex", alignItems: "center", justifyContent: "center",
        padding:         "16px",
        // ✅ NO onClick here — backdrop click does nothing
      }}
    >
      <div
        onClick={e => e.stopPropagation()}   // ✅ card click also does nothing upward
        style={{
          background:    "#fff", borderRadius: "16px", width: "100%",
          maxWidth, maxHeight: "90vh", overflowY: "auto",
          boxShadow:     "0 24px 64px rgba(0,0,0,0.25)",
          padding:       "28px 24px",
          position:      "relative",
        }}
      >
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 14, right: 16,
              background: "none", border: "none", fontSize: 22,
              cursor: "pointer", color: "#666", lineHeight: 1,
            }}
            aria-label="Close"
          >✕</button>
        )}
        {title && (
          <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700 }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. FORM FIELD with inline validation error  ✅
// ══════════════════════════════════════════════════════════════════════════════
export function FormField({ label, error, children, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ display: "block", fontWeight: 600, marginBottom: 5, fontSize: 14, color: "#333" }}>
          {label}{required && <span style={{ color: "#e53e3e" }}> *</span>}
        </label>
      )}
      {children}
      {error && (
        <p style={{ color: "#e53e3e", fontSize: 12, margin: "4px 0 0", fontWeight: 500 }}>
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

/** Standard text/email/password input styled consistently */
export function Input({ error, ...props }) {
  return (
    <input
      {...props}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 15,
        border: `1.5px solid ${error ? "#e53e3e" : "#ddd"}`,
        outline: "none", boxSizing: "border-box",
        background: "#fafafa", transition: "border 0.2s",
      }}
      onFocus={e => (e.target.style.borderColor = error ? "#e53e3e" : "#4f46e5")}
      onBlur={e  => (e.target.style.borderColor = error ? "#e53e3e" : "#ddd")}
    />
  );
}

export function Select({ error, children, ...props }) {
  return (
    <select
      {...props}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 15,
        border: `1.5px solid ${error ? "#e53e3e" : "#ddd"}`,
        outline: "none", boxSizing: "border-box", background: "#fafafa",
      }}
    >
      {children}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. REGION + DISTRICT PICKER  ✅ (all 16 regions)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage:
 *   <RegionDistrictPicker
 *     region={form.region} district={form.district}
 *     onRegionChange={r => setForm(f => ({ ...f, region: r, district: "" }))}
 *     onDistrictChange={d => setForm(f => ({ ...f, district: d }))}
 *     regionError={errors.region} districtError={errors.district}
 *   />
 */
export function RegionDistrictPicker({
  region, district,
  onRegionChange, onDistrictChange,
  regionError, districtError,
  showDistrict = true,
}) {
  const districts = getDistricts(region);

  return (
    <>
      <FormField label="Region" error={regionError} required>
        <Select value={region || ""} onChange={e => onRegionChange(e.target.value)} error={regionError}>
          <option value="">— Select Region —</option>
          {GHANA_REGIONS.map(r => (
            <option key={r.region} value={r.region}>{r.region}</option>
          ))}
        </Select>
      </FormField>

      {showDistrict && region && (
        <FormField label="District / Municipality" error={districtError} required>
          <Select value={district || ""} onChange={e => onDistrictChange(e.target.value)} error={districtError}>
            <option value="">— Select District —</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </FormField>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CATEGORY PICKER with custom "Other"  ✅
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage:
 *   <CategoryPicker
 *     category={form.category} customCategory={form.customCategory}
 *     onCategoryChange={v => setForm(f => ({ ...f, category: v }))}
 *     onCustomChange={v => setForm(f => ({ ...f, customCategory: v }))}
 *     error={errors.category}
 *   />
 */
export function CategoryPicker({ category, customCategory, onCategoryChange, onCustomChange, error }) {
  const isOther = category === "Other (specify)";
  return (
    <FormField label="Business Category" error={error} required>
      <Select value={category || ""} onChange={e => onCategoryChange(e.target.value)} error={error}>
        <option value="">— Select Category —</option>
        {BUSINESS_CATEGORIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      {isOther && (
        <Input
          style={{ marginTop: 8 }}
          placeholder="Enter your business category"
          value={customCategory || ""}
          onChange={e => onCustomChange(e.target.value)}
        />
      )}
    </FormField>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. WHATSAPP DM BUTTON  ✅
// Opens the owner's DM directly — no WhatsApp homepage
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage:
 *   <WhatsAppButton phone={business.ownerPhone} businessName={business.name} />
 */
export function WhatsAppButton({ phone, businessName, label = "Chat on WhatsApp", style = {} }) {
  return (
    <button
      onClick={() => openWhatsAppChat(phone, businessName)}
      style={{
        display:       "inline-flex", alignItems: "center", gap: 8,
        background:    "#25D366", color: "#fff",
        border:        "none", borderRadius: 10, padding: "10px 18px",
        fontWeight:    700, fontSize: 14, cursor: "pointer",
        ...style,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
      </svg>
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. MOMO PAYMENT FLOW — Customer side  ✅
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Show this after customer selects "Mobile Money" at checkout.
 * Usage:
 *   <MomoPaymentFlow
 *     orderId={orderId} total={order.total}
 *     businessMomoNumber="024XXXXXXX"
 *     onDone={() => setStep("tracking")}
 *   />
 */
export function MomoPaymentFlow({ orderId, total, businessMomoNumber, businessMomoName = "LocalBiz GH", onDone }) {
  const [txnId,   setTxnId]   = useState("");
  const [phone,   setPhone]   = useState("");
  const [network, setNetwork] = useState("MTN");
  const [errors,  setErrors]  = useState({});
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const networks = ["MTN", "Vodafone", "AirtelTigo"];

  async function handleSubmit() {
    const errs = {};
    if (!txnId.trim()) errs.txnId   = "Enter your MoMo transaction ID / reference.";
    const pe = validatePhone(phone);
    if (pe) errs.phone = pe;
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      await submitMomoTransactionId(orderId, txnId, phone, total, network);
      setSent(true);
      if (onDone) setTimeout(onDone, 2500);
    } catch (e) {
      setErrors({ general: e.message });
    } finally { setLoading(false); }
  }

  if (sent) return (
    <div style={{ textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <h3 style={{ color: "#16a34a" }}>Transaction ID Submitted!</h3>
      <p style={{ color: "#555" }}>The business will confirm your payment shortly. You'll get a notification once confirmed.</p>
    </div>
  );

  return (
    <div>
      <div style={{
        background: "#f0fdf4", border: "1.5px solid #86efac",
        borderRadius: 12, padding: "14px 16px", marginBottom: 18,
      }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>📱 Send GHS {Number(total).toFixed(2)} via MoMo</p>
        <p style={{ margin: "6px 0 0", color: "#555", fontSize: 14 }}>
          Send to: <strong>{businessMomoNumber}</strong> ({businessMomoName})
        </p>
        <p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>
          After payment, enter your transaction reference below so the business can verify.
        </p>
      </div>

      <FormField label="MoMo Network" error={errors.network}>
        <Select value={network} onChange={e => setNetwork(e.target.value)}>
          {networks.map(n => <option key={n} value={n}>{n} Mobile Money</option>)}
        </Select>
      </FormField>

      <FormField label="Phone Used for Payment" error={errors.phone} required>
        <Input
          type="tel" placeholder="024 000 0000"
          value={phone} onChange={e => setPhone(e.target.value)}
          error={errors.phone}
        />
      </FormField>

      <FormField label="Transaction ID / Reference" error={errors.txnId} required>
        <Input
          placeholder="e.g. A1234567890"
          value={txnId} onChange={e => setTxnId(e.target.value.toUpperCase())}
          error={errors.txnId}
        />
        <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>
          Find this in your MoMo SMS confirmation message.
        </p>
      </FormField>

      {errors.general && (
        <p style={{ color: "#e53e3e", fontSize: 13, marginBottom: 12 }}>⚠ {errors.general}</p>
      )}

      <button
        onClick={handleSubmit} disabled={loading}
        style={{
          width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: loading ? "#ccc" : "#16a34a", color: "#fff",
          fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Submitting…" : "Submit Transaction ID"}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. MOMO CONFIRM PANEL — Business dashboard  ✅
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage in business dashboard:
 *   <MomoConfirmPanel order={order} business={myBusiness} ownerId={user.uid} />
 */
export function MomoConfirmPanel({ order, business, ownerId }) {
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [result,  setResult]  = useState(null);

  async function handle(confirmed) {
    setLoading(true);
    try {
      const res = await confirmMomoPayment(order.id, confirmed, ownerId);
      setResult({ ...res, confirmed });
      setDone(true);
      // Auto-send receipt via WhatsApp if confirmed
      if (confirmed) {
        sendReceiptWhatsApp(res.order, res.business);
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally { setLoading(false); }
  }

  if (done) return (
    <div style={{ padding: "12px 0", textAlign: "center" }}>
      {result?.confirmed
        ? <><p style={{ color: "#16a34a", fontWeight: 700 }}>✅ Payment confirmed. Receipt sent to customer on WhatsApp!</p></>
        : <p style={{ color: "#e53e3e", fontWeight: 700 }}>❌ Payment rejected. Customer has been notified.</p>
      }
    </div>
  );

  return (
    <div style={{
      background: "#fffbeb", border: "1.5px solid #fbbf24",
      borderRadius: 12, padding: 16, marginBottom: 12,
    }}>
      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>💳 MoMo Payment Pending — {order.customerName}</p>
      <p style={{ margin: "0 0 2px", fontSize: 14, color: "#555" }}>
        Amount: <strong>GHS {Number(order.total).toFixed(2)}</strong>
        {" | "}Network: {order.momoNetwork || "—"}
        {" | "}Phone: {order.momoPhone || "—"}
      </p>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#555" }}>
        Txn ID: <strong style={{ letterSpacing: 1 }}>{order.momoTransactionId || "—"}</strong>
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => handle(true)} disabled={loading}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >✅ Confirm Payment</button>
        <button
          onClick={() => handle(false)} disabled={loading}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >❌ Reject</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. RECEIPT MODAL  ✅ (shows business name + logo)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage:
 *   <ReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)}
 *     order={order} business={business} />
 */
export function ReceiptModal({ open, onClose, order, business = {} }) {
  if (!open || !order) return null;

  const items = order.items || [];
  const date  = new Date(order.timestamp || Date.now()).toLocaleString("en-GH", {
    dateStyle: "medium", timeStyle: "short",
  });

  function handleSendWhatsApp() {
    try { sendReceiptWhatsApp(order, business); }
    catch (e) { alert(e.message); }
  }

  return (
    <Modal open={open} onClose={onClose} title="" maxWidth="420px">
      {/* Business branding */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        {business.logo && (
          <img src={business.logo} alt="logo"
            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 12, marginBottom: 8 }} />
        )}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e1e2e" }}>
          {business.name || order.businessName || "LocalBiz GH"}
        </h2>
        <p style={{ margin: "2px 0 0", color: "#888", fontSize: 13 }}>Official Receipt</p>
      </div>

      <div style={{ border: "1px dashed #ddd", margin: "12px 0" }} />

      {/* Order details */}
      <div style={{ fontSize: 14, color: "#444", lineHeight: 1.8 }}>
        <Row label="📅 Date"     value={date} />
        <Row label="🔖 Order ID" value={order.orderId || order.id} />
        <Row label="👤 Customer" value={order.customerName} />
        <Row label="📞 Phone"    value={order.customerPhone} />
        <Row label="📍 Address"  value={order.address} />
      </div>

      <div style={{ border: "1px dashed #ddd", margin: "12px 0" }} />

      {/* Items */}
      <div style={{ fontSize: 14 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>{item.name} × {item.qty || 1}</span>
            <span style={{ fontWeight: 600 }}>GHS {(item.price * (item.qty || 1)).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div style={{ border: "1px dashed #ddd", margin: "12px 0" }} />

      {/* Totals */}
      <div style={{ fontSize: 14, color: "#444" }}>
        {order.deliveryFee > 0 && <Row label="Delivery" value={`GHS ${Number(order.deliveryFee).toFixed(2)}`} />}
        <Row label="💳 Payment" value={order.paymentMethod === "momo" ? "Mobile Money" : (order.paymentMethod || "—")} />
        {order.momoTransactionId && <Row label="Txn ID" value={order.momoTransactionId} />}
        {order.momoConfirmed && <Row label="Status" value="✅ Payment Confirmed" />}
      </div>

      <div style={{
        background: "#f0fdf4", borderRadius: 10, padding: "10px 14px",
        display: "flex", justifyContent: "space-between", margin: "12px 0 0", fontWeight: 800, fontSize: 16,
      }}>
        <span>TOTAL</span>
        <span>GHS {Number(order.total || 0).toFixed(2)}</span>
      </div>

      <p style={{ textAlign: "center", color: "#888", fontSize: 12, margin: "12px 0 16px" }}>
        Thank you for shopping! 🛍️ Powered by LocalBiz GH
      </p>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSendWhatsApp}
          style={{
            flex: 1, padding: 11, borderRadius: 10, border: "none",
            background: "#25D366", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14,
          }}
        >📲 Send via WhatsApp</button>
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: 11, borderRadius: 10, border: "1.5px solid #ddd",
            background: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14,
          }}
        >Close</button>
      </div>
    </Modal>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. DELIVERY FEE SETTINGS — Business dashboard  ✅
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage in business settings page:
 *   <DeliveryFeeSettings bizId={business.id} current={business} region={business.region} />
 */
export function DeliveryFeeSettings({ bizId, current = {}, region }) {
  const [type,     setType]     = useState(current.deliveryFeeType || "flat");
  const [flat,     setFlat]     = useState(current.deliveryFeeFlat || "");
  const [map,      setMap]      = useState(current.deliveryFeeMap  || {});
  const [loading,  setLoading]  = useState(false);
  const [saved,    setSaved]    = useState(false);

  const districts = getDistricts(region || "");

  function updateDistrictFee(district, value) {
    setMap(prev => ({ ...prev, [district]: value === "" ? undefined : Number(value) }));
  }

  async function handleSave() {
    setLoading(true);
    try {
      await setDeliveryFee(bizId, type, flat, map);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h3 style={{ margin: "0 0 16px" }}>🚚 Delivery Fee Settings</h3>

      <FormField label="Fee Type">
        <Select value={type} onChange={e => setType(e.target.value)}>
          <option value="free">Free delivery (no charge)</option>
          <option value="flat">Flat rate (same for all)</option>
          <option value="per_district">Per district (custom per area)</option>
        </Select>
      </FormField>

      {type === "flat" && (
        <FormField label="Flat Delivery Fee (GHS)">
          <Input type="number" min="0" placeholder="e.g. 15"
            value={flat} onChange={e => setFlat(e.target.value)} />
        </FormField>
      )}

      {type === "per_district" && (
        <div>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 10px" }}>
            Set the fee for each district in your region. Leave blank to use the fallback flat rate.
          </p>
          <FormField label="Fallback flat rate (GHS) — used if district not listed">
            <Input type="number" min="0" placeholder="e.g. 20"
              value={flat} onChange={e => setFlat(e.target.value)} />
          </FormField>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
            {districts.map(d => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{d}</span>
                <input
                  type="number" min="0" placeholder="GHS"
                  value={map[d] ?? ""}
                  onChange={e => updateDistrictFee(d, e.target.value)}
                  style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSave} disabled={loading}
        style={{
          marginTop: 16, padding: "11px 24px", borderRadius: 10, border: "none",
          background: saved ? "#16a34a" : "#4f46e5", color: "#fff",
          fontWeight: 700, cursor: "pointer", fontSize: 14,
        }}
      >
        {loading ? "Saving…" : saved ? "✅ Saved!" : "Save Delivery Settings"}
      </button>
    </div>
  );
}
