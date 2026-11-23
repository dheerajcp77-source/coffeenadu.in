# CoffeeNadu News — Free Google Sheets + Drive + Apps Script Setup Guide

Follow these one-time steps to activate ₹0/month storage, Google Drive image archiving, daily backups, and one-click restore while keeping your existing website URL and design unchanged.

## Step 1: Create the Google Apps Script Project
1. Sign in to your Google account (`shwethashwethak85@gmail.com`) and open **https://script.google.com**.
2. Click **New project**.
3. Rename the project at the top-left to **`CoffeeNadu_News_API`**.
4. Delete any default `function myFunction()` text in `Code.gs`.
5. Copy the entire contents of `apps-script/Code.gs` from this project and paste it into `Code.gs`.
6. Click **Save** (`Ctrl+S` / `Cmd+S`).

## Step 2: Run Automatic One-Click Setup
1. In the toolbar at the top of Apps Script, change the selected function dropdown to **`setupCoffeeNaduStorage`**.
2. Click **Run**.
3. Google will ask for permissions ("Authorization required"):
   - Click **Review permissions** → choose your admin Google account.
   - Click **Advanced** → **Go to CoffeeNadu_News_API (unsafe)** → **Allow**.
4. Open the **Execution Log** at the bottom. It will automatically create and print:
   - Your Google Sheet: **`CoffeeNadu_News_Database`** (with tabs `News`, `Events`, `Categories`, `Settings`, `AdminLogs`)
   - Your Drive folder: **`CoffeeNadu_News_Images`**
   - Your Drive folder: **`CoffeeNadu_News_Backups`** (and `Monthly_Archives`)
   - Your automatic daily backup trigger (runs every night at 02:30 AM)
   - Your generated **`API_SECRET`** — **copy this secret!**

## Step 3: Deploy as a Web App
1. Click **Deploy** (top-right blue button) → **New deployment**.
2. Click the gear icon next to *Select type* → choose **Web app**.
3. Fill in:
   - **Description**: `CoffeeNadu News Production API v1`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone** *(Public reads are cached; all admin writes require the server-only `API_SECRET` + verified admin email.)*
4. Click **Deploy** and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).

## Step 4: Connect to CoffeeNadu News (Only 2 Server-Side Secrets Required)
1. In Google AI Studio, open the **Secrets / Environment Variables** panel.
2. Add **only these two server-side secrets** (never prefix with `VITE_` and never paste into frontend code):
   - **`APPS_SCRIPT_WEBAPP_URL`** = your deployed Web App URL from Step 3 (starts with `https://script.google.com/macros/s/` and ends with `/exec`)
   - **`APPS_SCRIPT_API_SECRET`** = the `API_SECRET` printed in Step 2 (also viewable anytime in Apps Script → **Project Settings → Script Properties**)
3. **No image CDN variable is needed**: All uploaded news and event photographs are stored directly in your Google Drive folder **`CoffeeNadu_News_Images`**, assigned permanent Google Drive file IDs (`imageDriveId`), and automatically served through your website's built-in disk-cached Drive image route (`/api/media/drive/<fileId>`).
4. Restart or reload the app, open **`/admin` → Storage & Backups**, and click **Check Storage Connection**.

## Step 5: Migrate Existing News & Create First Backup
1. Inside **`/admin` → Storage & Backups**, click **Migrate Current News to Google Sheets** (or upload an exported Firebase JSON backup if Firestore's daily quota is currently exhausted).
2. Verify the article count and image previews match.
3. Click **Create Backup Now** to verify instant JSON + CSV backup creation in `CoffeeNadu_News_Backups`.
4. Your old Firebase database remains untouched as a rollback backup until you confirm everything works smoothly.

