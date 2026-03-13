# LocalBiz GH 🌍
### Ghana's National Local Commerce Platform

Built on **React + Firebase (Firestore + Auth + Analytics)**

---

## 📁 Project Structure

```
localbiz-gh/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx        ← React entry point
    ├── App.jsx         ← Full application (UI + logic)
    └── firebase.js     ← Firebase config + all service functions
```

---

## 🚀 Quick Setup (5 minutes)

### 1. Create the project
```bash
npm create vite@latest localbiz-gh -- --template react
cd localbiz-gh
```

### 2. Install dependencies
```bash
npm install firebase
```

### 3. Copy the files
Replace the generated files with:
- `index.html`       → root of project
- `vite.config.js`   → root of project
- `src/main.jsx`     → src/main.jsx
- `src/App.jsx`      → src/App.jsx
- `src/firebase.js`  → src/firebase.js

### 4. Run locally
```bash
npm run dev
```

### 5. Deploy to Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

---

## 🔐 Firebase Console Setup

### Authentication
1. Go to **Firebase Console → Authentication → Sign-in method**
2. Enable **Email/Password**

### Firestore Database
1. Go to **Firestore Database → Create database**
2. Start in **production mode**
3. Copy the security rules from the bottom of `firebase.js` into  
   **Firestore → Rules** and publish

### Collections created automatically:
| Collection   | Description                              |
|-------------|------------------------------------------|
| `users`      | All registered users (customers, biz, riders) |
| `businesses` | Business profiles + embedded products    |
| `orders`     | All orders, real-time updated            |
| `riders`     | Rider profiles + availability status     |

---

## 👥 Three User Roles

| Role     | Can do                                                       |
|----------|--------------------------------------------------------------|
| **Customer** | Browse businesses by region, place orders, track status  |
| **Business** | Manage products, confirm orders, assign riders           |
| **Rider**    | Toggle availability, accept jobs, confirm deliveries     |

---

## 🛡️ Admin Access

From any page, click **⚡ Admin** tab in the top nav.

| Credential | Value        |
|-----------|--------------|
| Username  | `Amisco4u2`  |
| Password  | `Amiena702$` |

Admin can:
- View all businesses, customers, riders, orders in real-time
- Change business subscription plans (Free / Premium / Business)
- Suspend or reactivate businesses
- Manually onboard businesses
- View MRR revenue chart

---

## 💰 Subscription Plans

| Plan     | Price          | Features                                          |
|----------|---------------|---------------------------------------------------|
| Free     | GH₵ 0/mo      | Basic storefront, manual orders                   |
| Premium  | GH₵ 140/mo    | Unlimited products, analytics, WhatsApp alerts    |
| Business | GH₵ 380/mo    | Team inbox, bulk pricing, API access, priority support |

---

## 🌍 Regions Covered
Greater Accra · Ashanti · Western · Central · Eastern ·  
Volta · Northern · Upper East · Upper West · Brong-Ahafo

---

## 📊 Firebase Analytics Events Tracked
- `sign_up` — new user registrations (with role)
- `login` — user sign-ins
- `purchase` — order placed (with value in GHS)
- `business_registered` — new business onboarded
- `rider_registered` — new rider signed up

---

## ⚠️ Security Note
The admin credentials (`Amisco4u2` / `Amiena702$`) are stored in the frontend  
for demo purposes. For production, move admin auth to **Firebase Custom Claims**  
so only verified admin UIDs can access the admin panel.

---

*LocalBiz GH — Powered by Firebase · Built for Ghana 🇬🇭*
