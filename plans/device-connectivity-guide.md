# 🔌 Biometric Device ↔ Backend Connectivity Guide

> **Audience**: Anyone, even with zero technical background.  
> **Goal**: Get the ZKTeco/eSSL biometric device talking to your backend so punches flow into the database.

---

## Table of Contents

1. [What Actually Happens When They Connect](#1-what-actually-happens)
2. [Prerequisites — Things You Need Before Starting](#2-prerequisites)
3. [STEP-BY-STEP: Connect Device to Backend](#3-step-by-step-connect-device-to-backend)
4. [Firewall Issues (Office Laptop)](#4-firewall-issues-office-laptop)
5. [FALLBACK PLAN A: Use ngrok (Tunnel Through Firewall)](#5-fallback-plan-a-use-ngrok)
6. [FALLBACK PLAN B: Use a Mobile Hotspot Network](#6-fallback-plan-b-use-a-mobile-hotspot)
7. [FALLBACK PLAN C: Use a Separate Cheap Router](#7-fallback-plan-c-use-a-separate-cheap-router)
8. [FALLBACK PLAN D: Deploy to Cloud (Permanent Solution)](#8-fallback-plan-d-deploy-to-cloud)
9. [How to Verify Everything is Working](#9-how-to-verify-everything-is-working)
10. [Troubleshooting Common Problems](#10-troubleshooting-common-problems)

---

## 1. What Actually Happens

Let's understand what "connecting" means in plain English:

```
┌──────────────────────┐          HTTP request          ┌──────────────────────┐
│  BIOMETRIC DEVICE    │  ───────────────────────────►  │  YOUR LAPTOP         │
│  (ZKTeco / eSSL)     │                                │  (Running Backend)   │
│                      │  ◄───────────────────────────  │                      │
│  Sends punch data    │         "OK" response          │  Stores in Database  │
└──────────────────────┘                                └──────────────────────┘
```

**In simple words:**
- The biometric device is like a "sender" — it sends punch data (who punched, at what time)
- Your laptop running the backend is like a "receiver" — it receives that data and saves it to Supabase
- The device sends data over the **local network** using HTTP (like a website request)
- The device needs to know your laptop's **IP address** and **port** (8000)

**For this to work, two things must be true:**
1. ✅ Device and laptop must be on the **same network** (same WiFi / same LAN cable)
2. ✅ Your laptop's **firewall must not block** port 8000

---

## 2. Prerequisites

Before you start, make sure you have these ready:

### ✅ Checklist

| # | Item | How to Check | Status |
|---|------|-------------|--------|
| 1 | Backend code is on your laptop | You have the `Attendance/backend` folder | ☐ |
| 2 | Python is installed | Open PowerShell, type `python --version`. Should show 3.10+ | ☐ |
| 3 | Dependencies are installed | `pip install -r requirements.txt` ran successfully | ☐ |
| 4 | `.env` file has correct Supabase credentials | Check `backend/.env` has `SUPABASE_URL` and `SUPABASE_KEY` | ☐ |
| 5 | Supabase database has tables created | You ran `schema.sql` in Supabase SQL Editor | ☐ |
| 6 | Biometric device is powered ON | Device screen is showing time | ☐ |
| 7 | Device is connected to network | Via Ethernet cable or WiFi | ☐ |
| 8 | You know the device's admin password | Needed to change device settings | ☐ |

---

## 3. STEP-BY-STEP: Connect Device to Backend

### Step 3.1 — Install Python Dependencies

Open **PowerShell** (press `Win + X` → "Terminal" or "PowerShell").

```powershell
cd c:\Users\NuzhatKhan\Downloads\Attendance\backend
pip install -r requirements.txt
```

**What you should see**: A bunch of "Successfully installed..." messages.  
**If you see errors**: Try `pip install --user -r requirements.txt` or `python -m pip install -r requirements.txt`.

---

### Step 3.2 — Start the Backend Server

In the same PowerShell window:

```powershell
cd c:\Users\NuzhatKhan\Downloads\Attendance\backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> ⚠️ **IMPORTANT**: Use `--host 0.0.0.0` (NOT `127.0.0.1`).  
> `0.0.0.0` means "accept connections from any device on the network".  
> `127.0.0.1` means "only accept from this laptop" — the biometric device will NOT be able to reach it.

**What you should see:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
🚀 Starting Attendance & Payroll System
⏰ Background workers started
```

**Leave this window open. Do NOT close it.** The server must keep running.

---

### Step 3.3 — Test the Server from Your Laptop

Open a **web browser** on your laptop and go to:

```
http://localhost:8000
```

**What you should see:**
```json
{"system": "Attendance & Payroll System", "version": "1.0.0", "status": "running", "docs": "/docs"}
```

Now try the health check:
```
http://localhost:8000/api/health
```

**What you should see:**
```json
{"status": "healthy", "database": "connected", ...}
```

✅ If you see both of these, your server is working. Move to the next step.  
❌ If you see errors, check your `.env` file and Supabase credentials.

---

### Step 3.4 — Find Your Laptop's IP Address

Open **another PowerShell window** (do NOT close the server window) and run:

```powershell
ipconfig
```

**What you should see** (lots of text, look for the right one):

```
Wireless LAN adapter Wi-Fi:

   Connection-specific DNS Suffix  . :
   IPv4 Address. . . . . . . . . . . : 192.168.1.105     ← THIS IS YOUR IP
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1
```

> **Which adapter to look at?**
> - If your laptop is on **WiFi**: look under `Wireless LAN adapter Wi-Fi`
> - If your laptop is on **Ethernet cable**: look under `Ethernet adapter Ethernet`
> - **Ignore** anything that says `Hyper-V`, `VPN`, `VMware`, `Bluetooth`, or `Loopback`

**Write down your IP**. Example: `192.168.1.105`

---

### Step 3.5 — Test the Server from Another Device (Important!)

Before touching the biometric device, test from your **phone** or **another computer** on the same network.

On your phone browser, go to:
```
http://192.168.1.105:8000
```
(Replace `192.168.1.105` with YOUR actual IP from step 3.4)

**What you should see**: Same JSON response as step 3.3.

✅ If it works → Proceed to step 3.6.  
❌ If it does NOT load → **Your firewall is blocking port 8000**. Go to [Section 4: Firewall Issues](#4-firewall-issues-office-laptop).

---

### Step 3.6 — Configure the Biometric Device

This is done on the **device's screen** (the physical machine on the wall).

> ⚠️ Steps may vary slightly depending on your device model. The general flow is the same for ZKTeco and eSSL devices.

1. **Press MENU** on the device (or `M/OK` button)
2. Go to **COMM** (Communications) → **Cloud Server Setting** or **ADMS**
3. Set these values:

| Setting | Value | Explanation |
|---------|-------|-------------|
| **Enable** | ON / Yes | Turn on ADMS push |
| **Server Address** | `192.168.1.105` | YOUR laptop IP (from step 3.4) |
| **Server Port** | `8000` | The port your backend runs on |
| **Enable Proxy** | OFF / No | Don't use proxy |

4. **Save** the settings
5. The device will restart its cloud connection

> **Some devices call it differently:**
> - "ADMS" or "Cloud Server" or "Push Communication"
> - The server URL might need the full path: `http://192.168.1.105:8000`
> - Some devices have a separate "Domain Name" and "Port" field

---

### Step 3.7 — Watch Your Backend Terminal

After configuring the device, **go back to your PowerShell window** where the server is running.

**Within 30-60 seconds**, you should see log messages like:

```
INFO | app.routers.adms | Auto-registered unknown device: XXXXXXXXXXXX
```

(The `XXXXXXXXXXXX` is the device serial number)

✅ If you see this → **THE DEVICE IS CONNECTED!** 🎉  
❌ If you don't see anything after 2 minutes → Check [Section 10: Troubleshooting](#10-troubleshooting-common-problems).

---

### Step 3.8 — Test a Real Punch

1. Have someone **punch their finger** on the biometric device
2. Watch the backend terminal — within 30 seconds you should see:

```
INFO | app.routers.adms | ADMS push from XXXX: 1 punches inserted, 0 errors
```

3. Go to your **Supabase Dashboard** → Table Editor → `raw_punches` table
4. You should see the punch record with the `device_user_id`, `punch_time`, etc.

✅ If you see the punch → **END-TO-END CONNECTION IS WORKING!** You're done! 🎉

---

## 4. Firewall Issues (Office Laptop)

### Why Firewalls Block This

Your office laptop likely has:
- **Windows Firewall** — blocks incoming connections on unknown ports
- **Corporate Antivirus** (e.g., McAfee, Symantec, CrowdStrike) — even more restrictive
- **Group Policy** — IT department may lock down firewall settings so you can't change them

The biometric device tries to send data TO your laptop (incoming connection on port 8000). The firewall sees this as "someone from the network is trying to access your computer" and blocks it.

### Try This First: Add Firewall Rule

Open **PowerShell as Administrator** (Right-click PowerShell → "Run as Administrator"):

```powershell
netsh advfirewall firewall add rule name="Attendance Backend Port 8000" dir=in action=allow protocol=TCP localport=8000
```

**If it says "OK"** → Go back to Step 3.5 and test again.

**If it says "Access Denied" or any error** → Your IT department locked the firewall. You cannot change it. Move to the fallback plans below.

### Check if Port is Open (Test)

From another device on the same network, try:
```
http://YOUR_IP:8000
```

If it loads → firewall is not the issue.  
If it doesn't → firewall IS blocking. Use a fallback plan below.

---

## 5. FALLBACK PLAN A: Use ngrok (Tunnel Through Firewall)

> **What is ngrok?** It creates a "tunnel" — your backend stays on your laptop, but ngrok gives it a public URL (like `https://abc123.ngrok-free.app`). The biometric device connects to this public URL, and ngrok forwards the data to your laptop. **The firewall can't block this because all traffic goes OUTWARD from your laptop** (which firewalls allow).

### Step A.1 — Create ngrok Account (Free)

1. Go to **https://ngrok.com** in your browser
2. Click **"Sign Up"** (it's free)
3. Create an account (you can use Google sign-in)
4. After signing in, go to **"Your Authtoken"** page: https://dashboard.ngrok.com/get-started/your-authtoken
5. **Copy your authtoken** (looks like: `2abc123def456_7xyz...`)

---

### Step A.2 — Download ngrok

1. Go to https://ngrok.com/download
2. Download the **Windows (64-bit)** version
3. Unzip the file — you'll get `ngrok.exe`
4. Move `ngrok.exe` to somewhere easy to find, like `C:\Users\NuzhatKhan\Downloads\ngrok.exe`

---

### Step A.3 — Set Up ngrok

Open a **NEW PowerShell window** and run:

```powershell
cd C:\Users\NuzhatKhan\Downloads
.\ngrok.exe config add-authtoken YOUR_AUTH_TOKEN_HERE
```

Replace `YOUR_AUTH_TOKEN_HERE` with the token from step A.1.

**What you should see:** "Authtoken saved to configuration file."

---

### Step A.4 — Make Sure Your Backend is Running

Your backend MUST be running first (from Step 3.2). Check that `http://localhost:8000` works in your browser.

---

### Step A.5 — Start the ngrok Tunnel

In the same PowerShell window:

```powershell
cd C:\Users\NuzhatKhan\Downloads
.\ngrok.exe http 8000
```

**What you should see:**

```
Session Status                online
Account                       your-email@gmail.com
Forwarding                    https://a1b2c3d4.ngrok-free.app -> http://localhost:8000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Copy the "Forwarding" URL**: `https://a1b2c3d4.ngrok-free.app`

> ⚠️ **Free ngrok gives a new URL every time you restart.** If you stop and restart ngrok, you'll need to update the device settings again.

---

### Step A.6 — Test the ngrok URL

On your phone browser, go to:
```
https://a1b2c3d4.ngrok-free.app
```

You might see an ngrok interstitial page ("You are about to visit..."). Click **"Visit Site"**.

You should see your backend's JSON response:
```json
{"system": "Attendance & Payroll System", ...}
```

✅ If this works → ngrok is tunneling correctly.

---

### Step A.7 — Configure the Biometric Device with ngrok URL

Go to the device settings (same as Step 3.6), but set:

| Setting | Value |
|---------|-------|
| **Server Address** | `a1b2c3d4.ngrok-free.app` |
| **Port** | `443` (HTTPS) or `80` (HTTP) |

> ⚠️ **IMPORTANT**: Some older ZKTeco devices do NOT support HTTPS. If it doesn't work with port 443, try this approach:
> - Use the full URL: `http://a1b2c3d4.ngrok-free.app`
> - Or use ngrok's TCP tunnel instead (see below)

If the device doesn't support domain names (only IP addresses), ngrok won't work directly. Move to Fallback Plan B.

---

### Step A.8 — Verify Connection

Watch your backend PowerShell terminal. You should see the device handshake logs.

Also check the **ngrok terminal** — it shows live HTTP requests:

```
HTTP Requests
GET  /iclock/cdata              200 OK
POST /iclock/cdata              200 OK
```

✅ If you see these → Device is connected through ngrok! 🎉

---

## 6. FALLBACK PLAN B: Use a Mobile Hotspot

> **Idea**: Create your own private network using your phone's hotspot. Connect BOTH the device and your laptop to this hotspot. Since it's YOUR network (not the office network), there are no firewall restrictions.

### Step B.1 — Turn On Phone Hotspot

1. On your **Android/iPhone**, go to Settings → Hotspot / Tethering
2. Turn on **Mobile Hotspot**
3. Note the WiFi name and password

### Step B.2 — Connect Your Laptop to the Hotspot

1. Click the WiFi icon in your Windows taskbar
2. Find your phone's hotspot name
3. Connect to it

> ⚠️ You'll lose your office WiFi/internet. But Supabase will still be reachable through mobile data.

### Step B.3 — Connect the Biometric Device to the Hotspot

If your device supports **WiFi**:
1. Device MENU → COMM → WiFi
2. Search for networks → Find your phone's hotspot
3. Enter password → Connect

If your device is **Ethernet only** (wired):
- This won't work. Move to Fallback Plan C.

### Step B.4 — Find Your Laptop's New IP

```powershell
ipconfig
```

Look under `Wireless LAN adapter Wi-Fi`. Your IP will be different now (e.g., `192.168.43.105`).

### Step B.5 — Start Backend and Configure Device

Same as Steps 3.2 → 3.8, but use the new IP.

✅ This bypasses all office firewalls because you're on your own private network.

> **Downside**: Uses your phone's mobile data. Fine for testing, not ideal for daily production use.

---

## 7. FALLBACK PLAN C: Use a Separate Cheap Router

> **Idea**: Buy a small, cheap WiFi router (₹500-800). Create an isolated network. Connect both the device and laptop to this router. No office firewall involved.

### What You Need

- A basic WiFi router (TP-Link, D-Link, etc.) — ₹500-800
- One Ethernet cable (usually comes with the router)

### Setup

1. **Plug in the router** (power it on)
2. **Connect the biometric device** to the router via Ethernet cable
3. **Connect your laptop** to the router's WiFi
4. Both are now on the same private network with no firewall
5. Find your laptop's IP (`ipconfig`) and proceed with Steps 3.2–3.8

> **Bonus**: This router can stay permanently. It's a dedicated "attendance network". 
> You can also connect the router to the office internet (WAN port) for Supabase access.

---

## 8. FALLBACK PLAN D: Deploy to Cloud (Permanent Solution)

> **Idea**: Instead of running the backend on your laptop, deploy it to a cloud server (VPS). The device connects to the cloud server's IP/domain. Your laptop doesn't need to be running at all.

### Why This is the Best Long-Term Solution

- ✅ Backend runs 24/7 (no need to keep your laptop on)
- ✅ No firewall issues (cloud server has its own network)
- ✅ Device punches are never missed
- ✅ Frontend can also be deployed

### Cloud Options

| Provider | Cost | Notes |
|----------|------|-------|
| **Railway.app** | Free tier available | Easiest deployment. Push code → runs automatically |
| **Render.com** | Free tier available | Also very easy |
| **DigitalOcean** | $4-6/month | More control, VPS (you set up everything) |
| **AWS Lightsail** | $3.50/month | Cheap VPS |
| **Oracle Cloud** | **Always Free** | Free forever VPS (good specs too!) |

### Quick Deploy to Railway (Easiest)

1. Push your `backend` code to a GitHub repository
2. Go to https://railway.app → Sign in with GitHub
3. Create new project → "Deploy from GitHub repo"
4. Select your repo → Railway auto-detects Python
5. Set environment variables (copy from your `.env` file)
6. Railway gives you a URL like `https://attendance-backend.up.railway.app`
7. Configure the biometric device to point to this URL

> This is the recommended production approach. We can set this up when you're ready.

---

## 9. How to Verify Everything is Working

After connecting via ANY of the methods above, run these checks:

### Check 1: Backend Running?
```
http://YOUR_URL/api/health
```
Should return: `{"status": "healthy", "database": "connected"}`

### Check 2: Device Registered?
Go to **Supabase Dashboard** → Table Editor → `devices` table.  
You should see your device with a recent `last_seen_at` timestamp.

### Check 3: Punches Flowing?
1. Punch a finger on the device
2. Wait 30 seconds
3. Check Supabase → `raw_punches` table → new row should appear

### Check 4: Sessions Created?
1. Wait another 30 seconds (session builder runs every 30s)
2. Check Supabase → `attendance_sessions` table → session should appear with status `OPEN`

### Check 5: Punch Out Works?
1. Punch the same finger again
2. Wait 30 seconds
3. Check `attendance_sessions` → status should change to `COMPLETE`
4. `net_hours` should show the correct duration

---

## 10. Troubleshooting Common Problems

### "Device doesn't connect at all"

| Check | How | Fix |
|-------|-----|-----|
| Same network? | Device and laptop on same WiFi/LAN? | Connect both to same network |
| Server running? | Check PowerShell — is uvicorn still running? | Restart with `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| Correct IP? | Run `ipconfig` again — IP might have changed | Update device settings with new IP |
| Port blocked? | Try `http://YOUR_IP:8000` from your phone | Add firewall rule or use ngrok |
| Device settings wrong? | Double-check server address and port on device | Re-enter carefully |

### "Device connects but no punches appear"

| Check | How | Fix |
|-------|-----|-----|
| ATTLOG table set? | Device should push "ATTLOG" data | Check device ADMS settings |
| Employee registered? | Is the `device_user_id` from the punch in the `employees` table? | Add the employee with matching `device_user_id` |
| Check backend logs | Look at the PowerShell terminal for error messages | Fix based on error |
| Supabase connection? | Visit `/api/health` | Check `.env` credentials |

### "Server crashes / errors on startup"

| Error | Fix |
|-------|-----|
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` again |
| `Connection refused` (Supabase) | Check your `.env` file — are URL and KEY correct? |
| `Address already in use` | Port 8000 is taken. Use `--port 8001` instead (update device too) |
| `No module named 'app'` | Make sure you `cd` into the `backend` folder first |

### "Works for a while then stops"

| Cause | Fix |
|-------|-----|
| Laptop went to sleep | Change power settings: Settings → Power → Never sleep when plugged in |
| WiFi disconnected | Re-connect and check if IP changed |
| Server crashed | Check PowerShell for errors, restart uvicorn |
| ngrok session expired | Restart ngrok (free tier disconnects after ~2 hours idle) |

---

## Summary: Which Method Should I Use?

| Situation | Recommended Method |
|-----------|--------------------|
| **Testing for the first time** | Direct connection (Section 3) |
| **Office firewall blocks port 8000** | ngrok (Section 5) |
| **Device is Ethernet-only, can't join office network** | Separate router (Section 7) |
| **Quick test, bypass everything** | Mobile hotspot (Section 6) |
| **Production / daily use** | Deploy to cloud (Section 8) |

> **Start with Section 3 (direct connection).** If it doesn't work, try Section 5 (ngrok) next. Most issues are solved by one of these two.
