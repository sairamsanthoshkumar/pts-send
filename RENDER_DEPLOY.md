# Deploy PtsSEND to Render.com (Free)

## What gets deployed

| Service | Type | Plan |
|---|---|---|
| pts-send-backend | Web Service (FastAPI Docker) | Free |
| pts-send-frontend | Static Site (React) | Free |
| pts-send-worker | Background Worker (Celery) | Free |
| pts-send-db | PostgreSQL 15 | Free (90 days) |
| pts-send-redis | Redis | Free |

---

## Step 1 — Push code to GitHub

```bash
# In the pts-send folder:
git init
git add .
git commit -m "Initial PtsSEND scaffold"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/pts-send.git
git push -u origin main
```

---

## Step 2 — Deploy on Render (one click)

1. Go to **https://render.com** → Sign up / Log in
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select the **pts-send** repo
4. Render reads `render.yaml` and creates all 5 services automatically
5. Click **Apply** → deployment starts

---

## Step 3 — Wait for deployment (~5-10 min)

Watch the Render dashboard. All services turn green when ready:
- ✅ pts-send-db (PostgreSQL)
- ✅ pts-send-redis (Redis)
- ✅ pts-send-backend (FastAPI)
- ✅ pts-send-worker (Celery)
- ✅ pts-send-frontend (React)

---

## Step 4 — Get your live URLs

From the Render dashboard:

| Service | URL Pattern |
|---|---|
| **Frontend** | `https://pts-send-frontend.onrender.com` |
| **Backend API** | `https://pts-send-backend.onrender.com` |
| **API Docs** | `https://pts-send-backend.onrender.com/docs` |

---

## Step 5 — Fix CORS (important!)

After both services are deployed:

1. Go to **pts-send-backend** service → **Environment**
2. Update `CORS_ORIGINS` to include your actual frontend URL:
   ```
   ["https://pts-send-frontend.onrender.com"]
   ```
3. Update `FRONTEND_URL`:
   ```
   https://pts-send-frontend.onrender.com
   ```
4. Click **Save Changes** → backend redeploys automatically

---

## Free Tier Limits

| Limit | Impact |
|---|---|
| Free web services spin down after 15min inactivity | First request takes ~30 seconds to wake up |
| PostgreSQL free tier expires after 90 days | Upgrade to $7/mo paid plan to keep it |
| 750 instance hours/month per workspace | Enough for demos and showcasing |
| Redis free tier: 25MB | Sufficient for Celery task queues |

---

## Login Credentials

```
admin@ptssend.com   / admin123
analyst@ptssend.com / analyst123
```

---

## Redeploy after code changes

```bash
git add .
git commit -m "your changes"
git push origin main
# Render auto-deploys on every push to main
```
