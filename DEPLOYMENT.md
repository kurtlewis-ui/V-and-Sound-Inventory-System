# Deployment Guide — Render + Vercel + Supabase + UptimeRobot

This guide deploys the Vape & Sounds Inventory System for **free** (except domain):

| Component | Service | Cost |
|-----------|---------|------|
| Frontend (Next.js) | Vercel | Free |
| Backend (NestJS) | Render | Free |
| Database (PostgreSQL) | Supabase | Free |
| Keep-Alive Ping | UptimeRobot | Free |
| Domain (.com) | Namecheap/Porkbun | ~₱500/year |

---

## Step 1: Set Up the Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up (use GitHub login)
2. Click **"New Project"**
3. Name it: `vape-shop-db`, set a strong **database password** (save it), and
   choose **Region: Singapore** (closest to the Philippines)
4. Wait for the project to finish provisioning (~2 minutes)
5. Go to **Project Settings → Database → Connection string** and copy **two**
   connection strings (Supabase needs both — see the note below):

   **`DATABASE_URL`** — Transaction pooler (PgBouncer), **port 6543**, and add
   `?pgbouncer=true`. This is what the app uses at runtime:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

   **`DIRECT_DATABASE_URL`** — Session pooler / direct connection, **port 5432**.
   This is used ONLY for running migrations:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
6. **Save both** — you'll paste them into Render in Step 2.

> **Why two URLs?** Prisma runs app queries through the transaction pooler
> (fast, connection-pooled) but `prisma migrate deploy` **cannot** run through
> the transaction pooler, so it uses the direct connection (`directUrl` in
> `schema.prisma`). Setting only one will make either the app or the
> migrations fail.

> **Migrating from Neon?** After creating the Supabase project, copy your
> existing data over before switching Render's env vars:
> ```bash
> # Dump from Neon (use its direct connection string)
> pg_dump "postgresql://...neon.tech/neondb?sslmode=require" \
>   --no-owner --no-privileges -Fc -f neon_backup.dump
> # Restore into Supabase (use the DIRECT_DATABASE_URL, port 5432)
> pg_restore --no-owner --no-privileges --clean --if-exists \
>   -d "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
>   neon_backup.dump
> ```
> Run this with `pg_dump`/`pg_restore` from a matching PostgreSQL version.

---

## Step 2: Deploy the Backend (Render)

1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click **"New" → "Web Service"**
3. Connect your GitHub repo: `kurtlewis-ui/V-and-Sound-Inventory-System`
4. Configure the service:

   | Setting | Value |
   |---------|-------|
   | **Name** | `vape-shop-api` |
   | **Region** | Singapore |
   | **Root Directory** | `backend` |
   | **Runtime** | Node |
   | **Build Command** | `npm install && npx prisma generate && npm run build` |
   | **Start Command** | `npm run start:prod` |
   | **Plan** | Free |

5. Add **Environment Variables** (click "Advanced" → "Add Environment Variable"):

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `DATABASE_URL` | *(paste your Supabase transaction-pooler string from Step 1 — port 6543, ends with `?pgbouncer=true`)* |
   | `DIRECT_DATABASE_URL` | *(paste your Supabase session-pooler / direct string from Step 1 — port 5432)* |
   | `JWT_SECRET` | *(generate a random 32+ char string, e.g. use [randomkeygen.com](https://randomkeygen.com))* |
   | `JWT_REFRESH_SECRET` | *(another random 32+ char string, different from above)* |
   | `JWT_EXPIRATION` | `15m` |
   | `JWT_REFRESH_EXPIRATION` | `7d` |
   | `CORS_ORIGIN` | *(leave blank for now — fill after Vercel deploy)* |
   | `BCRYPT_ROUNDS` | `12` |
   | `SESSION_TIMEOUT` | `900` |
   | `RATE_LIMIT_TTL` | `60` |
   | `RATE_LIMIT_MAX` | `100` |
   | `BODY_LIMIT` | `15mb` |

6. Click **"Create Web Service"** — wait for build to complete (~3-5 minutes)
7. Once deployed, you'll get a URL like: `https://vape-shop-api-xxxx.onrender.com`
8. Test it: visit `https://vape-shop-api-xxxx.onrender.com/health` — should show OK

---

## Step 3: Run Database Migration

After the backend is deployed, you need to seed the database:

1. In Render dashboard, go to your service → **"Shell"** tab
2. Run these commands:
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```
   This creates all tables and the default admin account.

---

## Step 4: Deploy the Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **"Add New..." → "Project"**
3. Import your GitHub repo: `kurtlewis-ui/V-and-Sound-Inventory-System`
4. Configure:

   | Setting | Value |
   |---------|-------|
   | **Framework Preset** | Next.js |
   | **Root Directory** | `frontend` |

5. Add **Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | `https://vape-shop-api-xxxx.onrender.com/api/v1` *(your Render URL from Step 2)* |

6. Click **"Deploy"** — wait for build (~2-3 minutes)
7. You'll get a URL like: `https://your-app.vercel.app`

---

## Step 5: Update CORS on Render

Now go back to Render:

1. Go to your backend service → **"Environment"** tab
2. Update `CORS_ORIGIN` to your Vercel URL:
   ```
   https://your-app.vercel.app
   ```
   (If you also have a custom domain later, make it comma-separated:)
   ```
   https://your-app.vercel.app,https://www.yourdomain.com
   ```
3. Click **"Save Changes"** — Render will auto-redeploy

---

## Step 6: Set Up UptimeRobot (Keep Backend Awake)

1. Go to [uptimerobot.com](https://uptimerobot.com) and sign up (free)
2. Click **"Add New Monitor"**
3. Configure:

   | Setting | Value |
   |---------|-------|
   | **Monitor Type** | HTTP(s) |
   | **Friendly Name** | `Vape Shop API` |
   | **URL** | `https://vape-shop-api-xxxx.onrender.com/health` |
   | **Monitoring Interval** | `5 minutes` |

4. Click **"Create Monitor"**

This pings your backend every 5 minutes so Render never puts it to sleep.

---

## Step 7: Connect Custom Domain (Optional)

### Frontend domain (e.g. www.vapeandsounds.com):
1. In Vercel → your project → **"Settings" → "Domains"**
2. Add your domain: `www.vapeandsounds.com`
3. Vercel shows you DNS records (usually a CNAME)
4. Go to your domain registrar (Namecheap/Porkbun) → DNS settings
5. Add the CNAME record Vercel provided
6. Wait ~5 minutes for propagation

### Backend domain (optional, e.g. api.vapeandsounds.com):
1. In Render → your service → **"Settings" → "Custom Domains"**
2. Add `api.vapeandsounds.com`
3. Add the CNAME record Render provides to your DNS

### Update CORS after domain setup:
Update `CORS_ORIGIN` on Render to include your custom domain:
```
https://www.vapeandsounds.com,https://vapeandsounds.com
```

### Update frontend env:
If you set up `api.vapeandsounds.com`, update `NEXT_PUBLIC_API_URL` on Vercel to:
```
https://api.vapeandsounds.com/api/v1
```

---

## Done! 🎉

Your app is now live at:
- **Frontend:** `https://your-app.vercel.app` (or your custom domain)
- **Backend API:** `https://vape-shop-api-xxxx.onrender.com`
- **API Docs:** `https://vape-shop-api-xxxx.onrender.com/api/docs`

### Default Login:
| Email | Password |
|-------|----------|
| admin@vapeshop.com | ChangeMe123! |

⚠️ **Change this password immediately after first login!**

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Frontend shows "Network Error" | Check `NEXT_PUBLIC_API_URL` on Vercel matches your Render URL |
| Backend returns CORS error | Update `CORS_ORIGIN` on Render to include your frontend URL |
| Login works but refresh fails | Make sure `CORS_ORIGIN` matches exactly (include `https://`) |
| Database connection fails | Check `DATABASE_URL` on Render — Supabase transaction pooler, port 6543, must end with `?pgbouncer=true` |
| Migrations fail (`P1001`/pooler error) | `DIRECT_DATABASE_URL` must be the Supabase **direct/session** connection on **port 5432**, not the 6543 pooler |
| Build fails on Render | Check "Logs" tab — usually a missing env var |
| Backend sleeps despite UptimeRobot | Verify the monitor is active and URL is correct in UptimeRobot |

---

## Monthly Costs

| Service | Cost |
|---------|------|
| Vercel (frontend) | Free |
| Render (backend) | Free |
| Supabase (database) | Free (500MB) |
| UptimeRobot | Free |
| Domain (optional) | ~₱500/year |
| **Total** | **₱0/month** (+ ₱500/year for domain) |

If you ever need guaranteed uptime (no sleep risk), upgrade Render to Starter plan ($7/mo = ~₱350/mo).
