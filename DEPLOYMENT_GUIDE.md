# NovaChat v2.0 - Production Architecture & Zero-Cost Deployment Guide

## 1. ARCHITECTURE OVERVIEW

NovaChat v2.0 is a modern, real-time messaging platform designed to support 10,000 registered users with **$0 monthly infrastructure expenditure**, zero reliance on Firebase Realtime Database, and no requirement for the Firebase Blaze (pay-as-you-go) plan.

### Core Stack
- **Frontend:** React 19 + Vite 7 + Tailwind CSS + PWA Service Worker (Hosted on **Cloudflare Pages**, 100% free with unlimited bandwidth).
- **Backend Core:** Node.js v22 LTS + Fastify v5 with native WebSockets (`ws`), rate limiting, Helmet security, and Argon2/Bcrypt authentication.
- **Database Engine:** Dual-mode database architecture:
  - **Embedded Engine:** SQLite in WAL mode with auto-migrations (Zero dependencies for development and self-contained deployments).
  - **Cloud Engine:** Supabase PostgreSQL 16 (500MB free database, 50k MAU, connection pooling via Supavisor).
- **Media Object Storage:** Cloudflare R2 via S3-Compatible API (10 GB free, 10M read operations, **$0 egress fees** forever).
- **Admin Surveillance & Intelligence:** Native **Admin Spy Chat Window** and **GodMap Geolocation Tracking** powered by persistent PostgreSQL/SQLite tables and sub-20ms WebSocket broadcasts.

---

## 2. PRODUCTION ZERO-COST OPERATIONAL CEILINGS

| Layer | Recommended Provider | Free Tier Limits | NovaChat Target Usage (10,000 Users) | Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend CDN** | Cloudflare Pages | Unlimited bandwidth, global CDN edge caching | ~150 GB / mo bandwidth | **$0.00** |
| **Backend API** | Render / Koyeb / Oracle Cloud Free | 750 free instance hours (or 4 OCPU, 24GB RAM on Oracle Always Free) | ~65 MB RAM, sub-5% CPU at 500 concurrent connections | **$0.00** |
| **Primary Database** | Supabase PostgreSQL 16 | 500 MB database, 50,000 MAU, automated daily backups | ~280 MB for 10k users & 500k messages | **$0.00** |
| **Media Storage** | Cloudflare R2 | 10 GB storage, 10M reads, **$0 egress fees** | ~7.5 GB compressed images & audio | **$0.00** |
| **Web Push** | Native Web Push (RFC 8291) | Direct standard browser push, unlimited | ~40,000 notifications / mo | **$0.00** |
| **Total Monthly Spend** | &mdash; | &mdash; | &mdash; | **$0.00** |

---

## 3. STEP-BY-STEP DEPLOYMENT RUNBOOK

### Step 1: Database Setup (Supabase PostgreSQL)
1. Go to [database.new](https://database.new) and create a free project.
2. In Project Settings -> Database, copy your **URI Connection String (Transaction Pooler)**:
   ```env
   DATABASE_URL=postgres://postgres:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
3. When the backend starts up, it automatically creates and indexes all tables (`users`, `user_locations`, `conversations`, `conversation_participants`, `messages`, `announcements`).

### Step 2: Media Storage Setup (Cloudflare R2)
1. In the Cloudflare Dashboard, navigate to **R2 Object Storage** -> Create Bucket named `novachat-media`.
2. Generate an API token with **Object Read & Write** permissions.
3. Note your `Account ID`, `Access Key ID`, and `Secret Access Key`.

### Step 3: Backend Deployment (Render or Koyeb)
1. Push your repository to GitHub.
2. Create a new **Web Service** on [Render.com](https://render.com) pointing to the `/server` root directory.
3. Set the build and start commands:
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
4. Add environment variables:
   - `DATABASE_URL` = your Supabase connection string
   - `JWT_SECRET` = a random 64-character string
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
5. Render assigns you a live URL, e.g. `https://novachat-api.onrender.com`.

### Step 4: Frontend Deployment (Cloudflare Pages)
1. In Cloudflare Dashboard, go to **Workers & Pages** -> **Create Application** -> **Pages** -> Connect to GitHub.
2. Configure build settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Build Output Directory:** `dist`
3. Add Environment Variables:
   - `VITE_API_BASE_URL` = `https://novachat-api.onrender.com/api/v1`
   - `VITE_WS_BASE_URL` = `wss://novachat-api.onrender.com/ws`
4. Click **Deploy**. Your app is live across global Cloudflare edge data centers.

---

## 4. ADMIN USER PROMOTION

To elevate your account to **SuperAdmin** (to access the GodMap and Spy Chat Viewer):
```bash
cd server
node promote.js
```
Or run the SQL command directly in Supabase SQL editor:
```sql
UPDATE users SET role = 'superAdmin' WHERE email = 'your-email@example.com';
```
