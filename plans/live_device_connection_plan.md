# Live Device Connection Plan (Railway & Vercel)

Now that your backend is deployed to Railway and your frontend is live on Vercel, the architecture has changed from a **Local Network Setup** to a **Cloud-Based Setup**. 

Because your devices have different capabilities, we essentially have a **Hybrid Network Architecture**:
1. **Andheri Device:** Has ADMS (Cloud Push) and will connect directly to Railway.
2. **Yari Road Device:** Lacks ADMS. A local PC connects to it over Wi-Fi using PyZK (`cloud_local_agent.py`), downloads the punches, and pushes them securely over the internet to Railway.

Below are the steps required for each location to go fully live.

---

## Part 1: Andheri Device (Direct ADMS)

The Andheri device has ADMS, which means it can bypass a computer completely and push data directly over the internet to your Railway server.

**Perform these steps on the Andheri device's physical screen:**

1. Press the **M/OK** button to enter the main menu (authenticate as admin if required).
2. Navigate to **Comm.** (Communication) -> **Cloud Server Setting** (or ADMS).
3. Change the configuration from the old IP to the new Railway domain:
   - **Enable Domain Name:** Turn this **ON** (Yes).
   - **Server Address:** Enter exactly `attendance-production-38c4.up.railway.app` (Do NOT include `http://` or `https://`).
   - **Server Port:** Enter `80`. *(Even though Railway supports 443 HTTPS, ZKTeco natively communicates over HTTP).*
   - **Enable Proxy Server:** OFF.

4. Reboot the Andheri device (or just wait 1-2 minutes). It will apply the settings, ping Railway, and push any offline punches.

---

## Part 2: Yari Road Device (Agent Relay)

Since the Yari Road device does not have ADMS, it cannot speak to Railway directly. It relies on the custom script we made: `cloud_local_agent.py`.

1. **Keep the Device as is:** The physical Yari Road device does not need its settings changed. It stays on `192.168.1.201` port `4370`.
2. **PC Agent Configuration:** I have already automatically updated line 11 of `cloud_local_agent.py` on your computer to point to production:
   ```python
   CLOUD_API_URL = "https://attendance-production-38c4.up.railway.app/api/sync/upload-dat"
   ```
3. **Run the Agent:** You just need to have a computer on the Yari Road Wi-Fi network running `cloud_local_agent.py` in the background. As it polls the device every 60 seconds (using PyZK), it will automatically take the logs and push them over HTTPS to the Railway backend.

---

## How to Verify Success

1. For **Andheri**, check the Vercel dashboard (`attendance-sigma-one.vercel.app/devices`). If the status turns from **Offline (Red)** to **Online (Green)**, it means the direct ADMS connection was successful.
2. For **Yari Road**, look at the terminal output of the `cloud_local_agent.py` script running on your PC. You should see logs like:
   `✅ Cloud Sync Success: [...] new, [...] errors.`
   Which confirms the sync relay is working.

Both device punches will now consolidate into your live Railway Database and appear instantly on your live Vercel Frontend!
