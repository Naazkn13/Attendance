# Frontend Vercel Deployment Plan

This plan details the steps required to link your Next.js frontend to your newly deployed Railway backend, handle cross-origin restrictions (CORS), and get the frontend live on Vercel.

## 1. Update Backend Configuration (CORS)

**CORS Blocked by Default**
Currently, your backend (`main.py`) only accepts requests from `http://localhost:3000`. If you deploy the frontend to Vercel without updating the backend CORS, your Vercel site will not be able to talk to the Railway API and will face "CORS Failed" errors.

- **Action:** We need to update the `CORSMiddleware` in `backend/app/main.py` to allow origins from Vercel. 
- **Temporary approach:** We can allow `*` (all origins) temporarily just to ensure the deployment passes without a hitch.
- **Permanent approach:** We will wait until Vercel gives us your live URL (e.g., `attendance.vercel.app`) and then add exactly that URL into `main.py`'s allowed origins list.

### 2. Prepare the Frontend Codebase (GitHub)

- Before pushing anything to Vercel, the frontend must be pushed to a GitHub repository if it isn't already. (Vercel connects directly to GitHub to trigger automatic builds).

### 3. Vercel Dashboard Configurations

- Connect your GitHub repository inside the Vercel Dashboard.
- **Framework Preset:** Next.js
- **Environment Variables:** This is the most crucial part. You MUST inject the Railway URL so your frontend knows not to use localhost.
  - **Key:** `NEXT_PUBLIC_API_URL`
  - **Value:** `https://attendance-production-38c4.up.railway.app`
  
*(Note: Do not put a trailing slash `/` at the end of the Railway URL)*

## Verification

Once deployed, visit the live Vercel URL you are provided. Open the Network inspector and verify that API requests to `/api/health` are hitting `attendance-production-38c4.up.railway.app` successfully without CORS errors.
