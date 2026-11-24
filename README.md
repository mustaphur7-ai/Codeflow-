# Gold Terminal

Responsive gold (XAUUSD) chart with options-derived levels, volume profile, session levels and price alarms.
Works on phone, tablet, laptop and desktop. Free: GitHub Pages + GitHub Actions + free data. Not financial advice; data is delayed.

## Setup (10 minutes)
1. Create a GitHub repo and upload everything in this folder (keep the `.github` folder).
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write.**
4. **Actions tab → "Options daily" → Run workflow** (tick *force*) to create the first levels, then **"Market data" → Run workflow**.
5. Open `https://<your-name>.github.io/<repo>/`. On a phone, use "Add to Home screen"; on desktop, the install icon in Chrome/Edge.

## Phone/desktop alerts when the page is closed
- **ntfy (easiest):** install the free ntfy app (or open ntfy.sh in a browser), subscribe to a long random topic name, then add it as repo secret `NTFY_TOPIC` (Settings → Secrets and variables → Actions).
- **Telegram (optional):** secrets `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID`.
- Test: Actions → "Market data" → Run workflow → tick *Send a test push*.
- Custom alarms: add them in the app (Alerts tab), tap **Copy for repo**, and paste into the `custom` list in `config/alerts.json` (editable from the GitHub website or app).

## How it works
- **Options levels (frozen):** analysed once a day at 10:30 ET (1h after NY open) from the GLD options chain (CBOE delayed data, 0-10 days to expiry): call wall, put wall, gamma flip, max pain, top 6 GEX strikes, converted from GLD to gold price. They do not change until the next day's analysis.
- **Live levels:** volume profile (POC/VAH/VAL), session highs/lows (UTC: Asia 00-08, London 08-13, NY 13-21), previous day high/low/profile and VWAP refresh every 5 minutes. Spot gold has no volume on Yahoo, so the profile uses time-at-price; set env `PRICE_SYMBOL=GC=F` in the workflow for futures with real volume.
- **Alarms:** fire when price touches a level (within tolerance, default 0.50 USD). Each fires once, then is marked triggered. Only fixed levels can alarm (options levels, previous day, finished sessions).

## Limits (please read)
- Data updates every ~5 minutes, not tick by tick. GitHub may delay scheduled runs by a few minutes, so alerts are not instant.
- Keep the page open for the in-app siren; use ntfy/Telegram for background alerts.
- Yahoo and CBOE endpoints are unofficial and may change.
