// ─────────────────────────────────────────────────────────────────────────────
// src/firebase.js  —  LocalBiz GH · Firebase service layer
// Supports: username OR email login, Firestore, Analytics, Storage uploads
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
}                                                 from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
}                                                 from "firebase/storage";

// ── Config ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDAAoqgHoK_bUaxnmbAnLCmBMiFJKZNtnk",
  authDomain:        "localbizgh.firebaseapp.com",
  projectId:         "localbizgh",
  storageBucket:     "localbizgh.firebasestorage.app",
  messagingSenderId: "481227507557",
  appId:             "1:481227507557:web:5357590d23939dd16a038c",
  measurementId:     "G-029DW0639J",
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
// STORAGE — Image uploads
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Upload an image file to Firebase Storage and return its public URL.
 * @param {File}   file - The image file to upload
 * @param {string} path - Storage path prefix e.g. "logos/bizId" or "products/bizId_prodId"
 * @returns {Promise<string>} public download URL
 */
export async function uploadImage(file, path) {
  const ext      = file.name.split(".").pop();
  const fullPath = `${path}_${Date.now()}.${ext}`;
  const ref      = storageRef(storage, fullPath);
  const snap     = await uploadBytes(ref, file);
  return getDownloadURL(snap.ref);
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
  if (await isUsernameTaken(username)) {
    throw new Error("That username is already taken. Please choose another.");
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  const uid = cred.user.uid;

  await setDoc(doc(db, "users", uid), {
    uid, name, username: username.toLowerCase(),
    email, phone, role, region, town: extra.town || "", joined: serverTimestamp(), createdAt: Date.now(),
  });
  await setDoc(doc(db, "usernames", username.toLowerCase()), { uid, email });

  if (role === "business" && extra.businessName) {
    // Upload logo image if provided (File object)
    let logoUrl = "";
    if (extra.logoFile) {
      try { logoUrl = await uploadImage(extra.logoFile, `logos/${uid}`); } catch {}
    }
    const bizRef = doc(collection(db, "businesses"));
    await setDoc(bizRef, {
      id: bizRef.id, ownerId: uid, ownerName: name,
      ownerEmail: email, ownerPhone: phone, ownerUsername: username.toLowerCase(),
      name: extra.businessName, category: extra.category || "Other",
      region, town: extra.town || "", description: "", plan: "free", status: "active",
      rating: 0, ratingCount: 0, ordersCount: 0, products: [],
      logo: logoUrl, location: null, createdAt: serverTimestamp(),
    });
    track("business_registered", { region, category: extra.category });
  }

  if (role === "rider") {
    // Upload profile photo if provided
    let photoUrl = "";
    if (extra.photoFile) {
      try { photoUrl = await uploadImage(extra.photoFile, `riders/photos/${uid}`); } catch {}
    }
    const riderRef = doc(collection(db, "riders"));
    await setDoc(riderRef, {
      id: riderRef.id, userId: uid, name, email, phone,
      username: username.toLowerCase(), region, town: extra.town || "",
      vehicle: extra.vehicle || "Motorbike 🏍️",
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
  let email = usernameOrEmail.trim();
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
  await updateDoc(doc(db, "businesses", bizId), data);
}

export async function addProduct(bizId, product) {
  const snap   = await getDoc(doc(db, "businesses", bizId));
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
// ORDERS
// ══════════════════════════════════════════════════════════════════════════════

export async function placeOrder(orderData) {
  const ref = await addDoc(collection(db, "orders"), {
    ...orderData,
    status: "pending", riderId: null, riderName: null, riderPhone: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), timestamp: Date.now(),
  });
  // Increment business ordersCount
  try {
    const bizSnap = await getDoc(doc(db, "businesses", orderData.businessId));
    if (bizSnap.exists()) {
      const current = bizSnap.data().ordersCount || 0;
      await updateDoc(doc(db, "businesses", orderData.businessId), { ordersCount: current + 1 });
    }
  } catch {}
  track("purchase", { value: orderData.total, currency: "GHS" });
  return ref.id;
}

// Get business WhatsApp number for notifications
export async function getBusinessWhatsApp(bizId) {
  try {
    const snap = await getDoc(doc(db, "businesses", bizId));
    if (snap.exists()) {
      const d = snap.data();
      return d.whatsapp || d.contactPhone || null;
    }
  } catch {}
  return null;
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  await updateDoc(doc(db, "orders", orderId), {
    status, updatedAt: serverTimestamp(), ...extra,
  });

  // When delivered: update business revenue + rider trips/earnings
  if (status === "delivered") {
    try {
      const orderSnap = await getDoc(doc(db, "orders", orderId));
      if (orderSnap.exists()) {
        const order = orderSnap.data();
        // Update business revenue
        if (order.businessId) {
          const bizSnap = await getDoc(doc(db, "businesses", order.businessId));
          if (bizSnap.exists()) {
            const biz = bizSnap.data();
            const newRevenue = (biz.revenue || 0) + (order.total || 0);
            const newDelivered = (biz.deliveredCount || 0) + 1;
            await updateDoc(doc(db, "businesses", order.businessId), {
              revenue: newRevenue,
              deliveredCount: newDelivered,
            });
          }
        }
        // Update rider trips + earnings
        if (order.riderId) {
          const riderQ = query(collection(db, "riders"), where("id", "==", order.riderId));
          const rSnap = await getDocs(riderQ);
          if (!rSnap.empty) {
            const rRef = rSnap.docs[0].ref;
            const rData = rSnap.docs[0].data();
            await updateDoc(rRef, {
              trips: (rData.trips || 0) + 1,
              earnings: (rData.earnings || 0) + (order.riderFee || 0),
            });
          }
        }
      }
    } catch (e) { console.error("post-delivery update error:", e); }
  }

  // Log dispatch record when status becomes "assigned" or "dispatched"
  if (status === "assigned" || status === "dispatched") {
    try {
      const orderSnap = await getDoc(doc(db, "orders", orderId));
      if (orderSnap.exists()) {
        const order = orderSnap.data();
        if (order.businessId) {
          await addDoc(collection(db, "dispatchLogs"), {
            orderId: order.orderId || orderId,
            orderDocId: orderId,
            businessId: order.businessId,
            businessName: order.businessName || "",
            customerId: order.customerId || "",
            customerName: order.customerName || "",
            customerPhone: order.customerPhone || "",
            address: order.address || "",
            items: order.items || [],
            total: order.total || 0,
            riderFee: order.riderFee || 0,
            riderId: extra.riderId || order.riderId || null,
            riderName: extra.riderName || order.riderName || null,
            riderPhone: extra.riderPhone || order.riderPhone || null,
            deliveryType: order.deliveryType || "delivery",
            status: status,
            dispatchedAt: serverTimestamp(),
            timestamp: Date.now(),
          });
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
  const q = query(collection(db,"orders"), where("businessId","==",bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
    docs.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    callback(docs);
  });
}
export function listenCustomerOrders(customerId, callback) {
  const q = query(collection(db,"orders"), where("customerId","==",customerId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
    docs.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    callback(docs);
  });
}
export function listenRiderOrders(riderId, callback) {
  const q = query(collection(db,"orders"), where("riderId","==",riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
    docs.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    callback(docs);
  });
}
export function listenAvailableJobs(region, callback) {
  const q = query(collection(db,"orders"), where("status","==","assigned"), where("region","==",region));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
export function listenAllOrders(callback) {
  const q = query(collection(db,"orders"), orderBy("timestamp","desc"), limit(500));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}

// ══════════════════════════════════════════════════════════════════════════════
// RIDERS
// ══════════════════════════════════════════════════════════════════════════════

export function listenMyRiderProfile(userId, callback) {
  const q = query(collection(db,"riders"), where("userId","==",userId));
  return onSnapshot(q, snap => {
    callback(snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
  });
}
export function listenRidersInRegion(region, callback) {
  const q = query(collection(db,"riders"), where("region","==",region), where("available","==",true));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
export function listenAllRiders(callback) {
  const q = query(collection(db,"riders"), orderBy("createdAt","desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
export async function updateRider(riderId, data) {
  await updateDoc(doc(db,"riders",riderId), data);
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════════════════

export function listenAllUsers(callback) {
  const q = query(collection(db,"users"), orderBy("createdAt","desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
export async function adminUpdateBusiness(bizId, data) {
  await updateDoc(doc(db,"businesses",bizId), data);
}
export async function adminAddBusiness(data) {
  const ref = doc(collection(db,"businesses"));
  await setDoc(ref, { ...data, id: ref.id, createdAt: serverTimestamp(), products: [] });
  return ref.id;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function updateSubscription(bizId, plan, extra = {}) {
  await updateDoc(doc(db,"businesses",bizId), {
    plan, planUpdatedAt: serverTimestamp(), planUpdatedBy: "admin", ...extra,
  });
  track("subscription_changed", { bizId, plan });
}
export async function logSubscriptionPayment(bizId, bizName, plan, amount) {
  await addDoc(collection(db,"payments"), {
    bizId, bizName, plan, amount,
    paidAt: serverTimestamp(), timestamp: Date.now(), recordedBy: "admin",
  });
}
export function listenAllPayments(callback) {
  const q = query(collection(db,"payments"), orderBy("timestamp","desc"), limit(100));
  return onSnapshot(q, snap => callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}


// ══════════════════════════════════════════════════════════════════════════════
// FLEET DRIVERS  (business-owned driver roster)
// ══════════════════════════════════════════════════════════════════════════════

export async function addFleetDriver(bizId, data) {
  const ref = doc(collection(db, "fleetDrivers"));
  await setDoc(ref, {
    id: ref.id, bizId,
    name:       data.name       || "",
    phone:      data.phone      || "",
    email:      data.email      || "",
    photo:      data.photo      || "",
    vehicle:    data.vehicle    || "Motorbike 🏍️",
    licenseNo:  data.licenseNo  || "",
    idNumber:   data.idNumber   || "",
    address:    data.address    || "",
    emergencyContact: data.emergencyContact || "",
    available:  true,
    status:     "active",
    totalTrips:    0,
    totalEarnings: 0,
    todayTrips:    0,
    todayEarnings: 0,
    lastActiveDate: "",
    rating:     5.0,
    ratingCount: 0,
    createdAt: serverTimestamp(),
    timestamp: Date.now(),
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

// Record a successful delivery by a fleet driver
export async function recordFleetDelivery(driverId, bizId, deliveryData) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Write delivery record
  const ref = doc(collection(db, "driverDeliveries"));
  await setDoc(ref, {
    id:          ref.id,
    driverId,    bizId,
    orderId:     deliveryData.orderId     || "",
    orderDocId:  deliveryData.orderDocId  || "",
    customerName: deliveryData.customerName || "",
    customerPhone: deliveryData.customerPhone || "",
    address:     deliveryData.address     || "",
    items:       deliveryData.items       || [],
    total:       deliveryData.total       || 0,
    riderFee:    deliveryData.riderFee    || 0,
    date:        today,
    deliveredAt: serverTimestamp(),
    timestamp:   Date.now(),
    rated:       false,
    rating:      null,
    ratingComment: "",
  });

  // Update driver totals + reset today counters if it's a new day
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

// Customer submits a rating for a fleet driver delivery
export async function rateFleetDelivery(deliveryId, driverId, rating, comment) {
  // Update the delivery record
  await updateDoc(doc(db, "driverDeliveries", deliveryId), {
    rated: true, rating: Number(rating), ratingComment: comment || "",
    ratedAt: serverTimestamp(),
  });

  // Recalculate driver average rating
  const dSnap = await getDoc(doc(db, "fleetDrivers", driverId));
  if (dSnap.exists()) {
    const d = dSnap.data();
    const count = (d.ratingCount || 0) + 1;
    const avg   = ((d.rating || 5.0) * (d.ratingCount || 0) + Number(rating)) / count;
    await updateDoc(doc(db, "fleetDrivers", driverId), {
      rating: Math.round(avg * 10) / 10,
      ratingCount: count,
    });
  }
}

// Allow customers to rate through order — attach to orderDocId
export async function rateOrderDriver(orderDocId, rating, comment) {
  // Find the delivery record for this order
  const q = query(collection(db, "driverDeliveries"), where("orderDocId", "==", orderDocId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const del = snap.docs[0];
    await rateFleetDelivery(del.id, del.data().driverId, rating, comment);
  }
  // Also write rating to order
  await updateDoc(doc(db, "orders", orderDocId), {
    driverRating: Number(rating), driverRatingComment: comment || "",
    ratedAt: serverTimestamp(),
  });
}

// Get deliveries grouped by date for a driver (daily stats)
export function listenDriverDailyStats(driverId, callback) {
  const q = query(collection(db, "driverDeliveries"), where("driverId", "==", driverId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Group by date
    const byDate = {};
    docs.forEach(d => {
      const dt = d.date || "unknown";
      if (!byDate[dt]) byDate[dt] = { date: dt, trips: 0, earnings: 0, deliveries: [] };
      byDate[dt].trips++;
      byDate[dt].earnings += (d.riderFee || 0);
      byDate[dt].deliveries.push(d);
    });
    const sorted = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
    callback(sorted);
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// RIDER ↔ BUSINESS PARTNERSHIPS  (independent riders applying to businesses)
// ══════════════════════════════════════════════════════════════════════════════

// Rider sends a partnership request to a business
export async function requestPartnership(riderId, riderData, bizId, bizName) {
  // Check if already requested
  const q = query(collection(db, "partnerships"),
    where("riderId", "==", riderId), where("bizId", "==", bizId));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("You have already applied to this business.");

  const ref = doc(collection(db, "partnerships"));
  await setDoc(ref, {
    id: ref.id, riderId, bizId, bizName,
    riderName:  riderData.name   || "",
    riderPhone: riderData.phone  || "",
    riderPhoto: riderData.photo  || "",
    vehicle:    riderData.vehicle|| "",
    region:     riderData.region || "",
    rating:     riderData.rating || 5.0,
    trips:      riderData.trips  || 0,
    status: "pending",   // pending | approved | rejected
    createdAt: serverTimestamp(), timestamp: Date.now(),
  });
  return ref.id;
}

// Business approves or rejects a partnership request
export async function respondPartnership(partnershipId, status) {
  await updateDoc(doc(db, "partnerships", partnershipId), {
    status, respondedAt: serverTimestamp(),
  });
}

// Listen to all partnership requests for a business
export function listenBizPartnerships(bizId, callback) {
  const q = query(collection(db, "partnerships"), where("bizId", "==", bizId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

// Listen to a rider's own partnership applications
export function listenRiderPartnerships(riderId, callback) {
  const q = query(collection(db, "partnerships"), where("riderId", "==", riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

// Get rider's completed deliveries from driverDeliveries (if they were fleet-recorded)
// and also from orders (if they used the normal rider flow)
export function listenRiderHistory(riderId, userId, callback) {
  // Combine orders where riderId matches
  const q = query(collection(db, "orders"), where("riderId", "==", riderId));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.status === "delivered");
    docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    callback(docs);
  });
}

// Update rider profile (phone, vehicle, region, photo, etc.)
export async function updateRiderProfile(riderId, data) {
  await updateDoc(doc(db, "riders", riderId), { ...data, updatedAt: serverTimestamp() });
}


// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC DEEP LINK LOOKUPS  (no auth required)
// ══════════════════════════════════════════════════════════════════════════════

// Fetch a business by its owner's username (for public shop links)
export async function getBusinessByUsername(username) {
  const uname = username.toLowerCase();

  // Primary: ownerUsername field stored on business doc
  const q = query(collection(db, "businesses"), where("ownerUsername", "==", uname));
  const snap = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };

  // Fallback: look up uid from usernames collection, then find their business
  try {
    const unSnap = await getDoc(doc(db, "usernames", uname));
    if (unSnap.exists()) {
      const uid = unSnap.data().uid;
      const bq = query(collection(db, "businesses"), where("ownerId", "==", uid));
      const bSnap = await getDocs(bq);
      if (!bSnap.empty) {
        // Patch ownerUsername into the business doc for future queries
        await updateDoc(doc(db, "businesses", bSnap.docs[0].id), { ownerUsername: uname });
        return { id: bSnap.docs[0].id, ownerUsername: uname, ...bSnap.docs[0].data() };
      }
    }
  } catch {}
  return null;
}

// Fetch a rider's public profile by username
export async function getRiderByUsername(username) {
  const q = query(collection(db, "riders"), where("username", "==", username.toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export { auth, db, storage, analytics };
