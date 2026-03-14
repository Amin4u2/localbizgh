// ─────────────────────────────────────────────────────────────────────────────
// src/firebase.js  —  LocalBiz GH · Firebase service layer  v3.0
// Changes in this version:
//   ✅ MoMo payment flow with transaction ID confirmation
//   ✅ Receipt generation → WhatsApp DM / SMS
//   ✅ WhatsApp DM direct link (wa.me, no platform redirect)
//   ✅ Business category supports custom "Other" entry + update
//   ✅ Delivery fee set by business owner (flat / per-district / per-region)
//   ✅ Order status fix (stale-read race condition resolved)
//   ✅ Notifications (new_order, status changes, rider jobs, partnerships)
//   ✅ Reviews & ratings with auto-recalc
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }                          from "firebase/app";
import { getAnalytics, logEvent }                 from "firebase/analytics";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
}                                                 from "firebase/auth";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, serverTimestamp, getDocs,
  writeBatch,
}                                                 from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
}                                                 from "firebase/storage";

// ── Config ────────────────────────────────────────────────────────────────────
// ── Firebase config from environment variables (keeps keys out of GitHub) ──────
// These are set in .env.local for development and as GitHub Secrets for production.
// NOTE: Firebase web API keys are safe to be public (they identify your project,
// not grant admin access). Security comes from Firestore Rules, not key secrecy.
// Google's warning is about abuse monitoring — restricting the key in Google Cloud
// Console (HTTP referrer restrictions) is the proper fix.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyDAAoqgHoK_bUaxnmbAnLCmBMiFJKZNtnk",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "localbizgh.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "localbizgh",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "localbizgh.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "481227507557",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:481227507557:web:5357590d23939dd16a038c",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || "G-029DW0639J",
};

const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth      = getAuth(app);
const db        = getFirestore(app);
const storage   = getStorage(app);

// ── Analytics ─────────────────────────────────────────────────────────────────
export const track = (event, params = {}) => {
  try { logEvent(analytics, event, params); } catch {}
};

// ══════════════════════════════════════════════════════════════════════════════
// FORM VALIDATION HELPERS  ✅
// Import and use these in your UI components before submitting any form.
// ══════════════════════════════════════════════════════════════════════════════

/** Validate an email address */
export function validateEmail(email) {
  if (!email || !email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
  return null;
}

/** Validate a Ghanaian phone number (starts with 0 or +233, 10–13 digits) */
export function validatePhone(phone) {
  if (!phone || !phone.trim()) return "Phone number is required.";
  const cleaned = phone.replace(/\s/g, "");
  if (!/^(\+?233|0)\d{9}$/.test(cleaned)) return "Enter a valid Ghanaian phone number (e.g. 024 000 0000).";
  return null;
}

/** Validate a username (3–20 chars, letters/numbers/underscores only) */
export function validateUsername(username) {
  if (!username || !username.trim()) return "Username is required.";
  if (username.length < 3)  return "Username must be at least 3 characters.";
  if (username.length > 20) return "Username must be 20 characters or fewer.";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Username can only contain letters, numbers and underscores.";
  return null;
}

/** Validate a password (min 8 chars, at least one letter and one number) */
export function validatePassword(password) {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(password))    return "Password must contain at least one number.";
  return null;
}

/** Validate a required text field */
export function validateRequired(value, fieldName = "This field") {
  if (!value || !value.toString().trim()) return `${fieldName} is required.`;
  return null;
}

/** Validate a price value */
export function validatePrice(value, fieldName = "Price") {
  if (value === "" || value === null || value === undefined) return `${fieldName} is required.`;
  if (isNaN(Number(value)) || Number(value) < 0) return `${fieldName} must be a positive number.`;
  return null;
}

/**
 * Validate an entire form object.
 * @param {object} fields  - { fieldName: errorStringOrNull }
 * @returns {{ valid: boolean, errors: object }}
 *
 * Usage example in a component:
 *   const { valid, errors } = validateForm({
 *     email:    validateEmail(formData.email),
 *     phone:    validatePhone(formData.phone),
 *     username: validateUsername(formData.username),
 *     password: validatePassword(formData.password),
 *     name:     validateRequired(formData.name, "Full name"),
 *   });
 *   if (!valid) { setErrors(errors); return; }
 */
export function validateForm(fields) {
  const errors = {};
  let valid = true;
  Object.entries(fields).forEach(([key, err]) => {
    if (err) { errors[key] = err; valid = false; }
  });
  return { valid, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE — Image uploads
// ══════════════════════════════════════════════════════════════════════════════

export async function uploadImage(file, path) {
  const ext      = file.name.split(".").pop();
  const fullPath = `${path}_${Date.now()}.${ext}`;
  const ref      = storageRef(storage, fullPath);
  const snap     = await uploadBytes(ref, file);
  return getDownloadURL(snap.ref);
}

// ══════════════════════════════════════════════════════════════════════════════
// WHATSAPP UTILITIES  ✅
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normalise a Ghanaian phone number to international format (233XXXXXXXXX).
 * Strips spaces, dashes, parentheses.
 */
export function normalisePhone(phone = "") {
  let p = phone.replace(/[\s\-().]/g, "");
  if (p.startsWith("0"))    p = "233" + p.slice(1);
  if (p.startsWith("+233")) p = p.slice(1);          // remove leading +
  return p;                                           // e.g. "233244123456"
}

/**
 * Build a WhatsApp DM link that opens directly in the chat
 * (wa.me deep-link — skips the WhatsApp web/app homepage).
 * @param {string} phone   - any Ghanaian format
 * @param {string} message - pre-filled message (optional)
 */
export function whatsappDMLink(phone, message = "") {
  const number = normalisePhone(phone);
  const base   = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * Open a WhatsApp DM to a business owner directly.
 * Call this from a "Chat on WhatsApp" button.
 * @param {string} ownerPhone
 * @param {string} businessName
 */
export function openWhatsAppChat(ownerPhone, businessName = "") {
  const msg  = businessName
    ? `Hi, I found your business "${businessName}" on LocalBiz GH. I'd like to enquire.`
    : "Hi, I found you on LocalBiz GH. I'd like to enquire.";
  window.open(whatsappDMLink(ownerPhone, msg), "_blank", "noopener,noreferrer");
}

// ══════════════════════════════════════════════════════════════════════════════
// RECEIPT GENERATION  ✅
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a plain-text receipt string from an order object.
 * This text is sent via WhatsApp or SMS.
 */
export function buildReceiptText(order, business = {}) {
  const divider = "─────────────────────";
  const items   = (order.items || [])
    .map(i => `  • ${i.name} x${i.qty || 1}  →  GHS ${(i.price * (i.qty || 1)).toFixed(2)}`)
    .join("\n");

  return [
    `🧾 *RECEIPT — ${(business.name || order.businessName || "LocalBiz GH").toUpperCase()}*`,
    divider,
    `📅 Date:      ${new Date(order.timestamp || Date.now()).toLocaleString("en-GH")}`,
    `🔖 Order ID:  ${order.orderId || order.id || "—"}`,
    `👤 Customer:  ${order.customerName || "—"}`,
    `📞 Phone:     ${order.customerPhone || "—"}`,
    `📍 Address:   ${order.address || "—"}`,
    divider,
    `*ITEMS*`,
    items,
    divider,
    `Subtotal:     GHS ${(order.subtotal ?? order.total ?? 0).toFixed(2)}`,
    order.deliveryFee ? `Delivery:     GHS ${Number(order.deliveryFee).toFixed(2)}` : "",
    `*TOTAL:       GHS ${Number(order.total || 0).toFixed(2)}*`,
    divider,
    `💳 Payment:   ${order.paymentMethod === "momo" ? "Mobile Money (MoMo)" : order.paymentMethod || "—"}`,
    order.momoTransactionId ? `📲 Txn ID:    ${order.momoTransactionId}` : "",
    order.momoConfirmed     ? `✅ Payment Confirmed` : "",
    divider,
    `Thank you for shopping with us! 🛍️`,
    `Powered by LocalBiz GH — localbizgh.web.app`,
  ].filter(Boolean).join("\n");
}

/**
 * Send a receipt to the customer via WhatsApp DM.
 * Opens a pre-filled WhatsApp message in a new tab.
 * @param {object} order     - order data from Firestore
 * @param {object} business  - business data (name, logo, phone)
 */
export function sendReceiptWhatsApp(order, business = {}) {
  const phone = order.customerPhone;
  if (!phone) throw new Error("Customer phone number is missing.");
  const text = buildReceiptText(order, business);
  window.open(whatsappDMLink(phone, text), "_blank", "noopener,noreferrer");
}

/**
 * Send a receipt via SMS using Arkesel (popular Ghanaian SMS gateway).
 * You need an Arkesel API key set in your environment variables.
 * @param {object} order
 * @param {object} business
 * @param {string} arkeselApiKey  - process.env.VITE_ARKESEL_API_KEY
 */
export async function sendReceiptSMS(order, business = {}, arkeselApiKey) {
  const phone   = normalisePhone(order.customerPhone || "");
  const message = buildReceiptText(order, business)
    .replace(/\*/g, "")    // strip markdown bold markers for SMS
    .replace(/🧾|📅|🔖|👤|📞|📍|💳|📲|✅|🛍️/gu, ""); // strip emojis for SMS

  if (!phone) throw new Error("Customer phone number is missing.");
  if (!arkeselApiKey) throw new Error("Arkesel API key not provided.");

  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method:  "POST",
    headers: {
      "api-key":     arkeselApiKey,
      "Content-Type":"application/json",
    },
    body: JSON.stringify({
      sender:     "LocalBizGH",
      message,
      recipients: [phone],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "SMS send failed.");
  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

export async function isUsernameTaken(username) {
  const q    = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function registerUser(email, password, name, username, role, region, phone, extra = {}) {
  // Full validation before touching Firebase Auth
  const { valid, errors } = validateForm({
    name:     validateRequired(name, "Full name"),
    email:    validateEmail(email),
    phone:    validatePhone(phone),
    username: validateUsername(username),
    password: validatePassword(password),
    region:   validateRequired(region, "Region"),
    role:     validateRequired(role, "Account type"),
  });
  if (!valid) {
    const firstError = Object.values(errors)[0];
    throw new Error(firstError);
  }

  if (await isUsernameTaken(username)) {
    throw new Error("That username is already taken. Please choose another.");
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  const uid = cred.user.uid;

  await setDoc(doc(db, "users", uid), {
    uid, name, username: username.toLowerCase(),
    email, phone, role, region, town: extra.town || "",
    joined: serverTimestamp(), createdAt: Date.now(),
  });
  await setDoc(doc(db, "usernames", username.toLowerCase()), { uid, email });

  if (role === "business" && extra.businessName) {
    if (!extra.businessName.trim()) throw new Error("Business name is required.");
    let logoUrl = "";
    if (extra.logoFile) {
      try { logoUrl = await uploadImage(extra.logoFile, `logos/${uid}`); } catch {}
    }
    // Handle custom category: if category is "Other (specify)", use extra.customCategory
    const finalCategory = extra.category === "Other (specify)" && extra.customCategory
      ? extra.customCategory.trim()
      : (extra.category || "Other");

    const bizRef = doc(collection(db, "businesses"));
    await setDoc(bizRef, {
      id: bizRef.id, ownerId: uid, ownerName: name,
      ownerEmail: email, ownerPhone: phone, ownerUsername: username.toLowerCase(),
      name: extra.businessName, category: finalCategory,
      region, town: extra.town || "", description: "", plan: "free", status: "active",
      rating: 0, ratingCount: 0, ordersCount: 0, products: [],
      logo: logoUrl, location: null,
      // Delivery fee defaults — business owner can update later
      deliveryFeeType: "flat",       // "flat" | "per_district" | "free"
      deliveryFeeFlat: 0,
      deliveryFeeMap: {},            // { "districtName": amount }
      createdAt: serverTimestamp(),
    });
    track("business_registered", { region, category: finalCategory });
  }

  if (role === "rider") {
    if (!extra.vehicle)   throw new Error("Vehicle type is required for riders.");
    if (!extra.licenseNo) throw new Error("License number is required for riders.");
    let photoUrl = "";
    if (extra.photoFile) {
      try { photoUrl = await uploadImage(extra.photoFile, `riders/photos/${uid}`); } catch {}
    }
    const riderRef = doc(collection(db, "riders"));
    await setDoc(riderRef, {
      id: riderRef.id, userId: uid, name, email, phone,
      username: username.toLowerCase(), region, town: extra.town || "",
      vehicle:   extra.vehicle || "Motorbike 🏍️",
      licenseNo: extra.licenseNo || "",
      photo: photoUrl,
      available: true, rating: 5.0, trips: 0, earnings: 0,
      createdAt: serverTimestamp(),
    });
    track("rider_registered", { region });
  }

  track("sign_up", { role });
  return cred.user;
}

export async function loginUser(usernameOrEmail, password) {
  const trimmed = usernameOrEmail.trim();
  if (!trimmed)  throw new Error("Please enter your username or email.");
  if (!password) throw new Error("Please enter your password.");

  let email = trimmed;
  if (!email.includes("@")) {
    const snap = await getDoc(doc(db, "usernames", email.toLowerCase()));
    if (!snap.exists()) throw new Error("No account found with that username.");
    email = snap.data().email;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  track("login");
  return cred.user;
}

export async function logoutUser()        { await fbSignOut(auth); track("logout"); }
export function  onAuthChange(callback)   { return onAuthStateChanged(auth, callback); }
export async function fetchUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// BUSINESSES
// ══════════════════════════════════════════════════════════════════════════════

export function listenBusinesses(callback) {
  const q = query(collection(db, "businesses"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenMyBusiness(ownerId, callback) {
  const q = query(collection(db, "businesses"), where("ownerId", "==", ownerId));
  return onSnapshot(q, snap => {
    callback(snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
  }, err => { console.error("listenMyBusiness error:", err); callback(null); });
}

export async function updateBusiness(bizId, data) {
  // If category is custom, store the custom value
  if (data.category === "Other (specify)" && data.customCategory) {
    data.category = data.customCategory.trim();
    delete data.customCategory;
  }
  await updateDoc(doc(db, "businesses", bizId), data);
}

export async function addProduct(bizId, product) {
  const snap    = await getDoc(doc(db, "businesses", bizId));
  const newProd = {
    id:            `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name:          product.name,
    price:         Number(product.price),
    discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
    discountTag:   product.discountTag   || "",
    emoji:         product.emoji         || "📦",
    image:         product.image         || "",
    category:      product.category      || "General",
    description:   product.description   || "",
    available:     true,
    createdAt:     Date.now(),
  };
  await updateDoc(doc(db, "businesses", bizId), {
    products: [...(snap.data().products || []), newProd],
  });
  return newProd;
}

export async function updateProduct(bizId, productId, changes) {
  const snap  = await getDoc(doc(db, "businesses", bizId));
  const prods = (snap.data().products || []).map(p =>
    p.id === productId ? { ...p, ...changes, price: Number(changes.price ?? p.price) } : p
  );
  await updateDoc(doc(db, "businesses", bizId), { products: prods });
}

export async function deleteProduct(bizId, productId) {
  const snap  = await getDoc(doc(db, "businesses", bizId));
  const prods = (snap.data().products || []).filter(p => p.id !== productId);
  await updateDoc(doc(db, "businesses", bizId), { products: prods });
}

// ══════════════════════════════════════════════════════════════════════════════
// DELIVERY FEE  ✅
// Business owners set their own delivery fee structure.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Update a business's delivery fee settings.
 *
 * @param {string} bizId
 * @param {"flat"|"per_district"|"free"} type
 * @param {number}  flatAmount      - used when type === "flat"
 * @param {object}  districtMap     - { "districtName": amount } for type === "per_district"
 *
 * Example (flat): setDeliveryFee(bizId, "flat", 15)
 * Example (per district):
 *   setDeliveryFee(bizId, "per_district", 0, {
 *     "Accra Metropolitan": 10,
 *     "Tema Metropolitan": 20,
 *   })
 */
export async function setDeliveryFee(bizId, type = "flat", flatAmount = 0, districtMap = {}) {
  await updateDoc(doc(db, "businesses", bizId), {
    deliveryFeeType: type,
    deliveryFeeFlat: Number(flatAmount) || 0,
    deliveryFeeMap:  districtMap,
    deliveryFeeUpdatedAt: serverTimestamp(),
  });
}

/**
 * Calculate the delivery fee for a customer given their district.
 * Returns the fee amount (number). Returns 0 if type is "free" or not found.
 *
 * @param {object} business       - business Firestore document data
 * @param {string} customerDistrict - the customer's selected district
 */
export function calculateDeliveryFee(business = {}, customerDistrict = "") {
  const type = business.deliveryFeeType || "flat";
  if (type === "free") return 0;
  if (type === "flat") return Number(business.deliveryFeeFlat || 0);
  if (type === "per_district") {
    const map = business.deliveryFeeMap || {};
    // Exact match first, then fallback to flat
    if (map[customerDistrict] !== undefined) return Number(map[customerDistrict]);
    return Number(business.deliveryFeeFlat || 0);
  }
  return 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOMO PAYMENT  ✅
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Customer submits a MoMo transaction ID after making payment.
 * This marks the order as "payment_pending_confirmation".
 *
 * @param {string} orderId
 * @param {string} transactionId  - MoMo reference/transaction ID from the customer
 * @param {string} momoPhone      - phone number used to make payment
 * @param {number} amount         - amount paid
 * @param {string} network        - "MTN" | "Vodafone" | "AirtelTigo"
 */
export async function submitMomoTransactionId(orderId, transactionId, momoPhone, amount, network = "MTN") {
  if (!transactionId || !transactionId.trim()) throw new Error("Please enter your MoMo transaction ID.");
  if (!momoPhone) throw new Error("Please enter the MoMo phone number used for payment.");

  await updateDoc(doc(db, "orders", orderId), {
    paymentMethod:              "momo",
    momoTransactionId:          transactionId.trim(),
    momoPhone:                  normalisePhone(momoPhone),
    momoNetwork:                network,
    momoAmount:                 Number(amount),
    momoSubmittedAt:            serverTimestamp(),
    momoConfirmed:              false,
    status:                     "payment_pending_confirmation",
    updatedAt:                  serverTimestamp(),
  });

  // Notify business owner to confirm payment
  try {
    const orderSnap = await getDoc(doc(db, "orders", orderId));
    if (orderSnap.exists()) {
      const order = orderSnap.data();
      if (order.businessId) {
        const bizSnap = await getDoc(doc(db, "businesses", order.businessId));
        if (bizSnap.exists()) {
          await createNotification(
            bizSnap.data().ownerId,
            "momo_confirmation_needed",
            "💳 MoMo Payment Submitted",
            `${order.customerName || "A customer"} submitted MoMo Txn ID: ${transactionId.trim()} for GHS ${amount}. Please confirm.`,
            { orderId, transactionId: transactionId.trim() }
          );
        }
      }
    }
  } catch {}

  track("momo_txn_submitted", { network });
}

/**
 * Business owner confirms (or rejects) a MoMo payment.
 * On confirmation: order moves to "confirmed" and receipt is returned.
 *
 * @param {string}  orderId
 * @param {boolean} confirmed    - true = accept, false = reject
 * @param {string}  confirmedBy  - UID of the business owner
 * @returns {{ order: object, business: object }} so UI can show/send receipt
 */
export async function confirmMomoPayment(orderId, confirmed, confirmedBy) {
  const newStatus = confirmed ? "confirmed" : "payment_rejected";

  await updateDoc(doc(db, "orders", orderId), {
    momoConfirmed:       confirmed,
    momoConfirmedAt:     serverTimestamp(),
    momoConfirmedBy:     confirmedBy,
    status:              newStatus,
    updatedAt:           serverTimestamp(),
  });

  const orderSnap = await getDoc(doc(db, "orders", orderId));
  const order     = orderSnap.exists() ? orderSnap.data() : {};

  // Fetch business for receipt branding
  let business = {};
  if (order.businessId) {
    try {
      const bSnap = await getDoc(doc(db, "businesses", order.businessId));
      if (bSnap.exists()) business = bSnap.data();
    } catch {}
  }

  // Notify customer
  if (order.customerId) {
    try {
      await createNotification(
        order.customerId,
        confirmed ? "payment_confirmed" : "payment_rejected",
        confirmed ? "✅ Payment Confirmed!" : "❌ Payment Not Confirmed",
        confirmed
          ? `Your MoMo payment for your order from ${business.name || order.businessName} has been confirmed!`
          : `Your MoMo payment for your order from ${business.name || order.businessName} could not be confirmed. Please contact the business.`,
        { orderId }
      );
    } catch {}
  }

  track("momo_payment_confirmed", { confirmed });

  // Return order + business so the caller can send the receipt immediately
  return { order: { ...order, id: orderId }, business };
}

/**
 * Listen to all orders awaiting MoMo confirmation for a business.
 * Use this in the business dashboard to show a "confirm payment" panel.
 */
export function listenPendingMomoOrders(bizId, callback) {
  const q = query(
    collection(db, "orders"),
    where("businessId", "==", bizId),
    where("status", "==", "payment_pending_confirmation")
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS  ✅ FIXED
// ══════════════════════════════════════════════════════════════════════════════

export async function placeOrder(orderData) {
  // Validate required order fields
  if (!orderData.customerId)   throw new Error("You must be logged in to place an order.");
  if (!orderData.customerName) throw new Error("Customer name is required.");
  if (!orderData.customerPhone || validatePhone(orderData.customerPhone)) {
    const phoneErr = validatePhone(orderData.customerPhone || "");
    if (phoneErr) throw new Error(phoneErr);
  }
  if (!orderData.businessId)   throw new Error("Business information is missing.");
  if (!orderData.items?.length) throw new Error("Your cart is empty.");

  const ref = await addDoc(collection(db, "orders"), {
    ...orderData,
    status: "pending", riderId: null, riderName: null, riderPhone: null,
    momoConfirmed: false, momoTransactionId: "",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), timestamp: Date.now(),
  });

  // Increment business ordersCount
  try {
    const bizSnap = await getDoc(doc(db, "businesses", orderData.businessId));
    if (bizSnap.exists()) {
      await updateDoc(doc(db, "businesses", orderData.businessId), {
        ordersCount: (bizSnap.data().ordersCount || 0) + 1,
      });
      // Notify business owner
      await createNotification(bizSnap.data().ownerId, "new_order", "🛍️ New Order Received",
        `${orderData.customerName} placed an order worth GHS ${orderData.total || 0}`,
        { orderId: ref.id, businessId: orderData.businessId }
      );
    }
  } catch {}

  track("purchase", { value: orderData.total, currency: "GHS" });
  return ref.id;
}

export async function getBusinessWhatsApp(bizId) {
  try {
    const snap = await getDoc(doc(db, "businesses", bizId));
    if (snap.exists()) {
      const d = snap.data();
      return d.whatsapp || d.ownerPhone || d.contactPhone || null;
    }
  } catch {}
  return null;
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  // Read order first (avoid stale-read race condition)
  const orderSnap = await getDoc(doc(db, "orders", orderId));
  if (!orderSnap.exists()) throw new Error("Order not found: " + orderId);
  const order = { ...orderSnap.data(), ...extra };

  await updateDoc(doc(db, "orders", orderId), {
    status, updatedAt: serverTimestamp(), ...extra,
  });

  // Notify customer of status change
  const statusMessages = {
    confirmed:                    { title: "✅ Order Confirmed",       body: `Your order from ${order.businessName || "the business"} has been confirmed!` },
    preparing:                    { title: "👨‍🍳 Being Prepared",        body: `Your order from ${order.businessName || "the business"} is being prepared.` },
    assigned:                     { title: "🏍️ Rider Assigned",         body: `Rider ${extra.riderName || order.riderName || ""} has been assigned to your delivery.` },
    dispatched:                   { title: "🚀 Order On The Way",       body: `Your order is on the way! Rider: ${extra.riderName || order.riderName || "en route"}.` },
    delivered:                    { title: "🎉 Order Delivered!",       body: `Your order from ${order.businessName || "the business"} was delivered. Enjoy!` },
    cancelled:                    { title: "❌ Order Cancelled",        body: `Your order from ${order.businessName || "the business"} was cancelled.` },
    payment_pending_confirmation: { title: "⏳ Awaiting Payment Check", body: `Your MoMo payment is being verified by ${order.businessName || "the business"}.` },
    payment_rejected:             { title: "❌ Payment Not Confirmed",  body: `Your MoMo payment for your order from ${order.businessName} could not be confirmed.` },
  };
  if (order.customerId && statusMessages[status]) {
    const msg = statusMessages[status];
    try {
      await createNotification(order.customerId, `order_${status}`, msg.title, msg.body,
        { orderId, businessId: order.businessId }
      );
    } catch {}
  }

  // When delivered: update business revenue + rider stats
  if (status === "delivered") {
    try {
      if (order.businessId) {
        const bizSnap = await getDoc(doc(db, "businesses", order.businessId));
        if (bizSnap.exists()) {
          const biz = bizSnap.data();
          await updateDoc(doc(db, "businesses", order.businessId), {
            revenue:        (biz.revenue        || 0) + (order.total || 0),
            deliveredCount: (biz.deliveredCount  || 0) + 1,
          });
        }
      }
    } catch (e) { console.error("revenue update error:", e); }

    const riderId = extra.riderId || order.riderId;
    if (riderId) {
      try {
        const riderQ = query(collection(db, "riders"), where("id", "==", riderId));
        const rSnap  = await getDocs(riderQ);
        let rRef, rData;
        if (!rSnap.empty) {
          rRef  = rSnap.docs[0].ref;
          rData = rSnap.docs[0].data();
        } else {
          const directSnap = await getDoc(doc(db, "riders", riderId));
          if (directSnap.exists()) { rRef = directSnap.ref; rData = directSnap.data(); }
        }
        if (rRef && rData) {
          await updateDoc(rRef, {
            trips:    (rData.trips    || 0) + 1,
            earnings: (rData.earnings || 0) + (order.riderFee || 0),
          });
        }
      } catch (e) { console.error("rider stats update error:", e); }
    }
  }

  // Log dispatch record
  if (status === "assigned" || status === "dispatched") {
    try {
      if (order.businessId) {
        await addDoc(collection(db, "dispatchLogs"), {
          orderId:       order.orderId    || orderId,
          orderDocId:    orderId,
          businessId:    order.businessId,
          businessName:  order.businessName  || "",
          customerId:    order.customerId    || "",
          customerName:  order.customerName  || "",
          customerPhone: order.customerPhone || "",
          address:       order.address       || "",
          items:         order.items         || [],
          total:         order.total         || 0,
          riderFee:      order.riderFee      || 0,
          riderId:       extra.riderId       || order.riderId    || null,
          riderName:     extra.riderName     || order.riderName  || null,
          riderPhone:    extra.riderPhone    || order.riderPhone || null,
          deliveryType:  order.deliveryType  || "delivery",
          status, dispatchedAt: serverTimestamp(), timestamp: Date.now(),
        });

        // Notify rider
        const assignedRiderId = extra.riderId || order.riderId;
        if (assignedRiderId) {
          try {
            const rQ = query(collection(db, "riders"), where("id", "==", assignedRiderId));
            const rS = await getDocs(rQ);
            if (!rS.empty) {
              const riderUserId = rS.docs[0].data().userId;
              if (riderUserId) {
                await createNotification(riderUserId, "job_assigned", "🏍️ New Delivery Job",
                  `You have a delivery for ${order.businessName || "a business"} → ${order.address || "customer"}.`,
                  { orderId, businessId: order.businessId }
                );
              }
            }
          } catch {}
        }
      }
    } catch (e) { console.error("dispatch log error:", e); }
  }
}

export function listenDispatchLogs(bizId, callback) {
  const q = query(collection(db, "dispatchLogs"), where("businessId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

export function listenBusinessOrders(bizId, callback) {
  const q = query(collection(db, "orders"), where("businessId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenCustomerOrders(customerId, callback) {
  const q = query(collection(db, "orders"), where("customerId", "==", customerId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenRiderOrders(riderId, callback) {
  const q = query(collection(db, "orders"), where("riderId", "==", riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenAvailableJobs(region, callback) {
  const q = query(collection(db, "orders"), where("status", "==", "assigned"), where("region", "==", region));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function listenAllOrders(callback) {
  const q = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(500));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS  ✅
// ══════════════════════════════════════════════════════════════════════════════

export async function createNotification(userId, type, title, message, data = {}) {
  const ref = doc(collection(db, "notifications"));
  await setDoc(ref, {
    id: ref.id, userId, type, title, message, data,
    read: false, createdAt: serverTimestamp(), timestamp: Date.now(),
  });
  return ref.id;
}

export function listenNotifications(userId, callback) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(50)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenUnreadCount(userId, callback) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    where("read", "==", false)
  );
  return onSnapshot(q, snap => callback(snap.size));
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true, readAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(userId) {
  const q    = query(collection(db, "notifications"), where("userId", "==", userId), where("read", "==", false));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true, readAt: serverTimestamp() }));
  await batch.commit();
}

export async function deleteNotification(notificationId) {
  await deleteDoc(doc(db, "notifications", notificationId));
}

export async function clearAllNotifications(userId) {
  const q    = query(collection(db, "notifications"), where("userId", "==", userId));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ══════════════════════════════════════════════════════════════════════════════
// REVIEWS & COMMENTS  ✅
// ══════════════════════════════════════════════════════════════════════════════

export async function hasCustomerReviewed(bizId, customerId) {
  const q    = query(collection(db, "reviews"), where("bizId", "==", bizId), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function addReview(bizId, customerId, customerName, rating, comment, orderId = "", customerPhoto = "") {
  if (await hasCustomerReviewed(bizId, customerId)) {
    throw new Error("You have already reviewed this business. Edit your existing review instead.");
  }
  const ratingNum = Number(rating);
  if (ratingNum < 1 || ratingNum > 5) throw new Error("Rating must be between 1 and 5.");
  if (!comment || !comment.trim()) throw new Error("Please write a comment before submitting.");

  const ref = doc(collection(db, "reviews"));
  await setDoc(ref, {
    id: ref.id, bizId, customerId, customerName, customerPhoto: customerPhoto || "",
    rating: ratingNum, comment: comment.trim(), orderId: orderId || "",
    likes: 0, edited: false, createdAt: serverTimestamp(), timestamp: Date.now(),
  });

  await _recalcBusinessRating(bizId);

  try {
    const bizSnap = await getDoc(doc(db, "businesses", bizId));
    if (bizSnap.exists()) {
      const biz = bizSnap.data();
      const stars = "⭐".repeat(ratingNum);
      await createNotification(biz.ownerId, "new_review", "⭐ New Review",
        `${customerName} gave ${stars}: "${comment.slice(0, 60)}${comment.length > 60 ? "…" : ""}"`,
        { bizId, reviewId: ref.id }
      );
    }
  } catch {}

  track("review_added", { bizId, rating: ratingNum });
  return ref.id;
}

export async function editReview(reviewId, bizId, rating, comment) {
  if (Number(rating) < 1 || Number(rating) > 5) throw new Error("Rating must be between 1 and 5.");
  await updateDoc(doc(db, "reviews", reviewId), {
    rating: Number(rating), comment: comment || "", edited: true, updatedAt: serverTimestamp(),
  });
  await _recalcBusinessRating(bizId);
}

export async function deleteReview(reviewId, bizId) {
  await deleteDoc(doc(db, "reviews", reviewId));
  await _recalcBusinessRating(bizId);
}

export async function likeReview(reviewId, delta = 1) {
  const snap = await getDoc(doc(db, "reviews", reviewId));
  if (!snap.exists()) return;
  await updateDoc(doc(db, "reviews", reviewId), {
    likes: Math.max(0, (snap.data().likes || 0) + delta),
  });
}

export function listenBusinessReviews(bizId, callback) {
  const q = query(collection(db, "reviews"), where("bizId", "==", bizId), orderBy("timestamp", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function getCustomerReview(bizId, customerId) {
  const q    = query(collection(db, "reviews"), where("bizId", "==", bizId), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function _recalcBusinessRating(bizId) {
  try {
    const q    = query(collection(db, "reviews"), where("bizId", "==", bizId));
    const snap = await getDocs(q);
    if (snap.empty) {
      await updateDoc(doc(db, "businesses", bizId), { rating: 0, ratingCount: 0 });
      return;
    }
    const total = snap.docs.reduce((sum, d) => sum + (d.data().rating || 0), 0);
    await updateDoc(doc(db, "businesses", bizId), {
      rating:      Math.round((total / snap.size) * 10) / 10,
      ratingCount: snap.size,
    });
  } catch (e) { console.error("_recalcBusinessRating error:", e); }
}

// ══════════════════════════════════════════════════════════════════════════════
// RIDERS
// ══════════════════════════════════════════════════════════════════════════════

export function listenMyRiderProfile(userId, callback) {
  const q = query(collection(db, "riders"), where("userId", "==", userId));
  return onSnapshot(q, snap => {
    callback(snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
  });
}
export function listenRidersInRegion(region, callback) {
  const q = query(collection(db, "riders"), where("region", "==", region), where("available", "==", true));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function listenAllRiders(callback) {
  const q = query(collection(db, "riders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function updateRider(riderId, data) {
  await updateDoc(doc(db, "riders", riderId), data);
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════════════════

export function listenAllUsers(callback) {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function adminUpdateBusiness(bizId, data) {
  await updateDoc(doc(db, "businesses", bizId), data);
}
export async function adminAddBusiness(data) {
  const ref = doc(collection(db, "businesses"));
  await setDoc(ref, { ...data, id: ref.id, createdAt: serverTimestamp(), products: [] });
  return ref.id;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function updateSubscription(bizId, plan, extra = {}) {
  await updateDoc(doc(db, "businesses", bizId), {
    plan, planUpdatedAt: serverTimestamp(), planUpdatedBy: "admin", ...extra,
  });
  track("subscription_changed", { bizId, plan });
}
export async function logSubscriptionPayment(bizId, bizName, plan, amount) {
  await addDoc(collection(db, "payments"), {
    bizId, bizName, plan, amount,
    paidAt: serverTimestamp(), timestamp: Date.now(), recordedBy: "admin",
  });
}
export function listenAllPayments(callback) {
  const q = query(collection(db, "payments"), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ══════════════════════════════════════════════════════════════════════════════
// FLEET DRIVERS
// ══════════════════════════════════════════════════════════════════════════════

export async function addFleetDriver(bizId, data) {
  const ref = doc(collection(db, "fleetDrivers"));
  await setDoc(ref, {
    id: ref.id, bizId,
    name: data.name || "", phone: data.phone || "", email: data.email || "",
    photo: data.photo || "", vehicle: data.vehicle || "Motorbike 🏍️",
    licenseNo: data.licenseNo || "", idNumber: data.idNumber || "",
    address: data.address || "", emergencyContact: data.emergencyContact || "",
    available: true, status: "active",
    totalTrips: 0, totalEarnings: 0, todayTrips: 0, todayEarnings: 0,
    lastActiveDate: "", rating: 5.0, ratingCount: 0,
    createdAt: serverTimestamp(), timestamp: Date.now(),
  });
  return ref.id;
}

export async function updateFleetDriver(driverId, data) {
  await updateDoc(doc(db, "fleetDrivers", driverId), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteFleetDriver(driverId) {
  await deleteDoc(doc(db, "fleetDrivers", driverId));
}

export function listenFleetDrivers(bizId, callback) {
  const q = query(collection(db, "fleetDrivers"), where("bizId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    callback(docs);
  });
}

export async function recordFleetDelivery(driverId, bizId, deliveryData) {
  const today = new Date().toISOString().split("T")[0];
  const ref   = doc(collection(db, "driverDeliveries"));
  await setDoc(ref, {
    id: ref.id, driverId, bizId,
    orderId: deliveryData.orderId || "", orderDocId: deliveryData.orderDocId || "",
    customerName: deliveryData.customerName || "", customerPhone: deliveryData.customerPhone || "",
    address: deliveryData.address || "", items: deliveryData.items || [],
    total: deliveryData.total || 0, riderFee: deliveryData.riderFee || 0,
    date: today, deliveredAt: serverTimestamp(), timestamp: Date.now(),
    rated: false, rating: null, ratingComment: "",
  });

  const driverSnap = await getDoc(doc(db, "fleetDrivers", driverId));
  if (driverSnap.exists()) {
    const d = driverSnap.data();
    const isNewDay = d.lastActiveDate !== today;
    await updateDoc(doc(db, "fleetDrivers", driverId), {
      totalTrips:    (d.totalTrips    || 0) + 1,
      totalEarnings: (d.totalEarnings || 0) + (deliveryData.riderFee || 0),
      todayTrips:    isNewDay ? 1 : (d.todayTrips || 0) + 1,
      todayEarnings: isNewDay ? (deliveryData.riderFee || 0) : (d.todayEarnings || 0) + (deliveryData.riderFee || 0),
      lastActiveDate: today,
    });
  }
  return ref.id;
}

export function listenDriverDeliveries(driverId, callback) {
  const q = query(collection(db, "driverDeliveries"), where("driverId", "==", driverId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenBizDeliveries(bizId, callback) {
  const q = query(collection(db, "driverDeliveries"), where("bizId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

export async function rateFleetDelivery(deliveryId, driverId, rating, comment) {
  await updateDoc(doc(db, "driverDeliveries", deliveryId), {
    rated: true, rating: Number(rating), ratingComment: comment || "", ratedAt: serverTimestamp(),
  });
  const dSnap = await getDoc(doc(db, "fleetDrivers", driverId));
  if (dSnap.exists()) {
    const d     = dSnap.data();
    const count = (d.ratingCount || 0) + 1;
    const avg   = ((d.rating || 5.0) * (d.ratingCount || 0) + Number(rating)) / count;
    await updateDoc(doc(db, "fleetDrivers", driverId), {
      rating: Math.round(avg * 10) / 10, ratingCount: count,
    });
  }
}

export async function rateOrderDriver(orderDocId, rating, comment) {
  const q    = query(collection(db, "driverDeliveries"), where("orderDocId", "==", orderDocId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const del = snap.docs[0];
    await rateFleetDelivery(del.id, del.data().driverId, rating, comment);
  }
  await updateDoc(doc(db, "orders", orderDocId), {
    driverRating: Number(rating), driverRatingComment: comment || "", ratedAt: serverTimestamp(),
  });
}

export function listenDriverDailyStats(driverId, callback) {
  const q = query(collection(db, "driverDeliveries"), where("driverId", "==", driverId));
  return onSnapshot(q, snap => {
    const docs   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byDate = {};
    docs.forEach(d => {
      const dt = d.date || "unknown";
      if (!byDate[dt]) byDate[dt] = { date: dt, trips: 0, earnings: 0, deliveries: [] };
      byDate[dt].trips++;
      byDate[dt].earnings += (d.riderFee || 0);
      byDate[dt].deliveries.push(d);
    });
    callback(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RIDER ↔ BUSINESS PARTNERSHIPS
// ══════════════════════════════════════════════════════════════════════════════

export async function requestPartnership(riderId, riderData, bizId, bizName) {
  const q    = query(collection(db, "partnerships"), where("riderId", "==", riderId), where("bizId", "==", bizId));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("You have already applied to this business.");

  const ref = doc(collection(db, "partnerships"));
  await setDoc(ref, {
    id: ref.id, riderId, bizId, bizName,
    riderName: riderData.name || "", riderPhone: riderData.phone || "",
    riderPhoto: riderData.photo || "", vehicle: riderData.vehicle || "",
    region: riderData.region || "", rating: riderData.rating || 5.0, trips: riderData.trips || 0,
    status: "pending", createdAt: serverTimestamp(), timestamp: Date.now(),
  });

  try {
    const bizSnap = await getDoc(doc(db, "businesses", bizId));
    if (bizSnap.exists()) {
      await createNotification(bizSnap.data().ownerId, "partnership_request", "🤝 New Rider Application",
        `${riderData.name || "A rider"} has applied to partner with your business.`,
        { riderId, bizId, partnershipId: ref.id }
      );
    }
  } catch {}
  return ref.id;
}

export async function respondPartnership(partnershipId, status) {
  await updateDoc(doc(db, "partnerships", partnershipId), { status, respondedAt: serverTimestamp() });
  try {
    const pSnap = await getDoc(doc(db, "partnerships", partnershipId));
    if (pSnap.exists()) {
      const p   = pSnap.data();
      const rQ  = query(collection(db, "riders"), where("id", "==", p.riderId));
      const rS  = await getDocs(rQ);
      if (!rS.empty) {
        const riderUserId = rS.docs[0].data().userId;
        if (riderUserId) {
          const accepted = status === "approved";
          await createNotification(riderUserId,
            accepted ? "partnership_approved" : "partnership_rejected",
            accepted ? "✅ Partnership Approved" : "❌ Application Not Accepted",
            accepted
              ? `Your application to partner with ${p.bizName || "the business"} was approved!`
              : `Your application to ${p.bizName || "the business"} was not accepted this time.`,
            { bizId: p.bizId, partnershipId }
          );
        }
      }
    }
  } catch {}
}

export function listenBizPartnerships(bizId, callback) {
  const q = query(collection(db, "partnerships"), where("bizId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenRiderPartnerships(riderId, callback) {
  const q = query(collection(db, "partnerships"), where("riderId", "==", riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export function listenRiderHistory(riderId, userId, callback) {
  const q = query(collection(db, "orders"), where("riderId", "==", riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.status === "delivered");
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}
export async function updateRiderProfile(riderId, data) {
  await updateDoc(doc(db, "riders", riderId), { ...data, updatedAt: serverTimestamp() });
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC DEEP LINK LOOKUPS
// ══════════════════════════════════════════════════════════════════════════════

export async function getBusinessByUsername(username) {
  const uname = username.toLowerCase();
  const q     = query(collection(db, "businesses"), where("ownerUsername", "==", uname));
  const snap  = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  try {
    const unSnap = await getDoc(doc(db, "usernames", uname));
    if (unSnap.exists()) {
      const uid   = unSnap.data().uid;
      const bq    = query(collection(db, "businesses"), where("ownerId", "==", uid));
      const bSnap = await getDocs(bq);
      if (!bSnap.empty) {
        await updateDoc(doc(db, "businesses", bSnap.docs[0].id), { ownerUsername: uname });
        return { id: bSnap.docs[0].id, ownerUsername: uname, ...bSnap.docs[0].data() };
      }
    }
  } catch {}
  return null;
}

export async function getRiderByUsername(username) {
  const q    = query(collection(db, "riders"), where("username", "==", username.toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT A BUSINESS
// ══════════════════════════════════════════════════════════════════════════════
export async function reportBusiness(bizId, bizName, reporterId, reporterName, reason, details) {
  const ref = doc(collection(db, "reports"));
  await setDoc(ref, {
    id: ref.id, bizId, bizName,
    reporterId, reporterName,
    reason, details,
    status: "pending", // pending | reviewed | actioned
    createdAt: serverTimestamp(), timestamp: Date.now(),
  });
  return ref.id;
}

export function listenReports(callback) {
  const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function updateReportStatus(reportId, status, adminNote = "") {
  await updateDoc(doc(db, "reports", reportId), {
    status, adminNote, reviewedAt: serverTimestamp(),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// DEVELOPER MESSAGE INBOX
// ══════════════════════════════════════════════════════════════════════════════
export async function sendMessageToDeveloper(senderId, senderName, senderEmail, subject, message) {
  const ref = doc(collection(db, "devMessages"));
  await setDoc(ref, {
    id: ref.id, senderId, senderName, senderEmail,
    subject, message,
    status: "unread", // unread | read | replied
    reply: "", repliedAt: null,
    createdAt: serverTimestamp(), timestamp: Date.now(),
  });
  return ref.id;
}

export function listenDevMessages(callback) {
  const q = query(collection(db, "devMessages"), orderBy("timestamp", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenMyMessages(senderId, callback) {
  const q = query(collection(db, "devMessages"), where("senderId", "==", senderId), orderBy("timestamp", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function replyToMessage(messageId, reply) {
  await updateDoc(doc(db, "devMessages", messageId), {
    reply, status: "replied", repliedAt: serverTimestamp(),
  });
}

export async function markMessageRead(messageId) {
  await updateDoc(doc(db, "devMessages", messageId), { status: "read" });
}

export { auth, db, storage, analytics };
