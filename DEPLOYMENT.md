# Deployment Guide — Vercel + Supabase

This guide deploys the Vape & Sounds Inventory System on **Vercel + Supabase only**
(no Render, no separate always-on server):

| Component | Service | Cost |
|-----------|---------|------|
| Frontend (Next.js) | Vercel | Free (Hobby) |
| Backend API (NestJS) | Vercel (Serverless Function) | Free (Hobby) |
| Database (PostgreSQL) | Supabase | Free (500MB) |
| Domain (.com) | Namecheap/Porkbun | ~₱500/year |

> **Architecture.** The frontend and the backend are deployed as **two separate
> Vercel projects** from the same repo (different Root Directories). The NestJS
> backend runs as a **serverless function** (`backend/api/index.ts`) — there is
> no long-running server to keep awake, so no Render and no UptimeRobot ping is
> needed. Prisma talks to Supabase through the transaction pooler.

---

## Step 1: Set Up the Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up (use GitHub login)
2. Click **"New Project"**
3. Name it `vape-shop-db`, set a strong **database password** (save it), and
   choose **Region: Singapore** (closest to the Philippines)
4. Wait for the project to finish provisioning (~2 minutes)
5. Go to **Project Settings → Database → Connection string** and copy **two**
   connection strings (Prisma needs both):

   **`DATABASE_URL`** — Transaction pooler (PgBouncer), **port 6543**, add
   `?pgbouncer=true`. Used by the app at runtime (required for serverless):
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

   **`DIRECT_DATABASE_URL`** — Session pooler / direct connection, **port 5432**.
   Used ONLY for migrations:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
6. **Save both.**

> **Migrating from Neon?** Copy your data over before switching:
> ```bash
> pg_dump "postgresql://...neon.tech/neondb?sslmode=require" \
>   --no-owner --no-privileges -Fc -f neon_backup.dump
> pg_restore --no-owner --no-privileges --clean --if-exists \
>   -d "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
>   neon_backup.dump
> ```

---

## Step 2: Apply the Database Schema (Migrations)

Migrations are run **from your machine** against the Supabase **direct**
connection — not inside a Vercel build (serverless builds shouldn't run
migrations). Do this once now, and again whenever you add migrations.

```bash
cd backend
npm install

# Point Prisma at Supabase. Locally you can export the two URLs for this shell:
export DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"

npm run migrate:prod     # prisma migrate deploy (uses DIRECT_DATABASE_URL)
npm run prisma:seed      # creates the default admin account (first time only)
```

---

## Step 3: Deploy the Backend API (Vercel)

1. Go to [vercel.com](https://vercel.com) → **"Add New… → Project"**
2. Import the repo: `kurtlewis-ui/V-and-Sound-Inventory-System`
3. Configure:

   | Setting | Value |
   |---------|-------|
   | **Project Name** | `vape-shop-api` |
   | **Root Directory** | `backend` |
   | **Framework Preset** | Other |

   Vercel reads `backend/vercel.json`, builds the serverless function at
   `api/index.ts`, and routes all requests to it.

4. Add **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(Supabase transaction pooler — port 6543, ends with `?pgbouncer=true`)* |
   | `DIRECT_DATABASE_URL` | *(Supabase direct connection — port 5432)* |
   | `JWT_SECRET` | *(random 32+ char string)* |
   | `JWT_REFRESH_SECRET` | *(another random 32+ char string)* |
   | `JWT_EXPIRATION` | `15m` |
   | `JWT_REFRESH_EXPIRATION` | `7d` |
   | `CORS_ORIGIN` | *(leave blank for now — fill after the frontend deploy)* |
   | `BCRYPT_ROUNDS` | `12` |
   | `SESSION_TIMEOUT` | `900` |
   | `RATE_LIMIT_TTL` | `60` |
   | `RATE_LIMIT_MAX` | `100` |
   | `BODY_LIMIT` | `15mb` |
   | `API_PREFIX` | `api/v1` |

5. Click **Deploy**. You'll get a URL like `https://vape-shop-api.vercel.app`.
6. Test it: visit `https://vape-shop-api.vercel.app/health` — should return OK.

> **Note (Hobby plan):** serverless functions are capped at **10s** execution
> (`maxDuration` in `backend/vercel.json`). On **Pro** you can raise it to 60s —
> bump `maxDuration` if you hit timeouts on heavy operations (e.g. bulk import).

---

## Step 4: Deploy the Frontend (Vercel)

1. In Vercel → **"Add New… → Project"**, import the **same repo** again
2. Configure:

   | Setting | Value |
   |---------|-------|
   | **Project Name** | `vape-shop-web` |
   | **Root Directory** | `frontend` |
   | **Framework Preset** | Next.js |

3. Add **Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | `https://vape-shop-api.vercel.app/api/v1` *(your backend URL from Step 3)* |

4. Click **Deploy**. You'll get a URL like `https://vape-shop-web.vercel.app`.

---

## Step 5: Set the Backend CORS Origin

Go back to the **backend** Vercel project → **Settings → Environment Variables**:

1. Set `CORS_ORIGIN` to your frontend URL:
   ```
   https://vape-shop-web.vercel.app
   ```
   (For a custom domain later, make it comma-separated:)
   ```
   https://vape-shop-web.vercel.app,https://www.yourdomain.com
   ```
2. **Redeploy** the backend so the change takes effect.

---

## Step 6: Connect Custom Domains (Optional)

- **Frontend** (`www.vapeandsounds.com`): backend project not required — add the
  domain to the **frontend** Vercel project (Settings → Domains) and set the DNS
  record Vercel shows.
- **Backend** (`api.vapeandsounds.com`): add it to the **backend** Vercel project,
  set the DNS record, then update `NEXT_PUBLIC_API_URL` (frontend) to
  `https://api.vapeandsounds.com/api/v1` and add the frontend domain to
  `CORS_ORIGIN` (backend).

---

## Done! 🎉

- **Frontend:** `https://vape-shop-web.vercel.app` (or your custom domain)
- **Backend API:** `https://vape-shop-api.vercel.app`

### Default Login
| Email | Password |
|-------|----------|
| admin@vapeshop.com | ChangeMe123! |

⚠️ **Change this password immediately after first login!**

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Frontend shows "Network Error" | Check `NEXT_PUBLIC_API_URL` (frontend) matches the backend Vercel URL and ends with `/api/v1` |
| Backend returns CORS error | Set `CORS_ORIGIN` (backend) to the exact frontend URL (include `https://`) and redeploy |
| Login works but refresh fails | `CORS_ORIGIN` must match exactly; cookies require `credentials` + HTTPS |
| Database connection fails | `DATABASE_URL` must be the Supabase transaction pooler (port 6543, `?pgbouncer=true`) |
| Migrations fail (`P1001`/pooler error) | Run `npm run migrate:prod` locally with `DIRECT_DATABASE_URL` = Supabase **direct** connection (port 5432) |
| Function timeout on heavy request | Hobby caps at 10s; raise `maxDuration` in `backend/vercel.json` on the Pro plan |
| First request after idle is slow | Serverless cold start — normal for an internal tool; the next requests are fast |

---

## Monthly Costs

| Service | Cost |
|---------|------|
| Vercel (frontend + backend) | Free (Hobby) |
| Supabase (database) | Free (500MB) |
| Domain (optional) | ~₱500/year |
| **Total** | **₱0/month** (+ ₱500/year for domain) |
