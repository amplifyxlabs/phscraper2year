# Setting Up Google Sheets Integration

This guide explains how to set up the Google Sheets integration for automatically exporting Product Hunt scraper data.

## Prerequisites

1. A Google account
2. Access to Google Cloud Console
3. Your scraper already running on Azure VM

## Step 1: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Note the spreadsheet ID from the URL:
   - Example URL: `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0`
   - The ID is the part between `/d/` and `/edit`: `1AbCdEfGhIjKlMnOpQrStUvWxYz`

## Step 2: Set Up Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Search for "Google Sheets API" in the search bar
   - Click on "Google Sheets API"
   - Click "Enable"

## Step 3: Create Service Account Credentials

1. In the Google Cloud Console, navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" and select "Service Account"
3. Fill in the details for your service account (e.g., "ph-scraper-service")
4. Click "Create and Continue" and assign the role "Editor" (or a more specific role if preferred)
5. Click "Done"
6. In the service accounts list, find your new service account and click on it
7. Go to the "Keys" tab
8. Click "Add Key" > "Create new key"
9. Select JSON and click "Create"
10. The key file will be downloaded to your computer

## Step 4: Share Your Spreadsheet with the Service Account

1. Open the JSON key file and find the `client_email` value
2. Open your Google Sheet
3. Click "Share" in the top-right corner
4. Enter the `client_email` address from your key file (it should look like `service-account-name@project-id.iam.gserviceaccount.com`)
5. Set the permission to "Editor"
6. Uncheck "Notify people" and click "Share"

## Step 5: Configure Your Scraper Project

1. Rename the downloaded JSON key file to `google-credentials.json`
2. Place it in your project root directory (same level as `cron-scraper.js`)
3. Update your `.env` file with your Google Sheet ID:
   ```
   GOOGLE_SHEET_ID=your-sheet-id-here
   ```

## Step 6: Update Your Azure VM

Run the `update-vm.sh` script to update your Azure VM with the new files:

```bash
bash update-vm.sh
```

This script will:
1. Copy the necessary files to your VM
2. Install required dependencies
3. Restart the PM2 process

## Email Verification

The integration now includes Reoon email verification:

1. Before data is uploaded to Google Sheets, all emails are verified using the Reoon API
2. Only rows with at least one valid email address will be included in the Google Sheet
3. For each email column found, a new column is added with the verification status
4. Email verification uses Reoon's QUICK mode for fast verification
5. Invalid emails are logged but not included in the uploaded data
6. The Reoon API key is pre-configured in the code

### Email Verification Criteria

Emails are checked for:
- Valid syntax
- Disposable/temporary email domains
- Valid MX records
- Domain email acceptance validation
- Role account detection

## How It Works

- Each time the scraper runs (daily at 5:00 PM IST as configured in `ecosystem.config.js`), it will:
  1. Update the target date in the `.env` file
  2. Run the scraper to collect data
  3. Verify all email addresses found in the data
  4. Filter out rows with invalid emails
  5. Export the verified data to Google Sheets
  6. All data is appended to a single sheet, with date separators between each day's data

## Data Organization

- All verified data is added to a single sheet named "Data" (instead of creating a new sheet for each day)
- Each day's data is separated by a row with the date: "--- Data for YYYY-MM-DD ---"
- This makes it easier to scroll through all historical data in one place
- The original column headers are preserved for each day's data
- Additional columns are added for email verification status

## Troubleshooting

If the Google Sheets export is not working:

1. Check the PM2 logs on your VM:
   ```
   pm2 logs ph-scraper
   ```

2. Verify that:
   - The `google-credentials.json` file exists on your VM
   - The `GOOGLE_SHEET_ID` in your `.env` file is correct
   - Your service account has edit access to your Google Sheet
   - The Google Sheets API is enabled in your Google Cloud project
   
3. If email verification is failing:
   - Check internet connectivity from your VM
   - Verify the Reoon API key is correct
   - Check if you have sufficient API quota with Reoon
   - You can check your Reoon account balance at: https://emailverifier.reoon.com/api/v1/check-account-balance/?key=r4xRoRT0EP97NQPZNt6kK1KEsKYG10ig