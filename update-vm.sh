#!/bin/bash

# Script to update files on Azure VM

# Copy files to VM
echo "Copying files to VM..."
scp -i ~/Downloads/phscraper2_key.pem cron-scraper.js ecosystem.config.js google-sheets-exporter.js .env azureuser@20.40.46.227:/home/azureuser/phscraper2year/

# Check if we need to upload Google credentials
if [ -f "./google-credentials.json" ]; then
  echo "Copying Google credentials to VM..."
  scp -i ~/Downloads/phscraper2_key.pem google-credentials.json azureuser@20.40.46.227:/home/azureuser/Phscarper/
else
  echo "Warning: google-credentials.json not found. Google Sheets integration will not work."
fi

# Connect to VM and set up PM2 cron job
echo "Setting up PM2 cron job on VM..."
ssh -i ~/Downloads/phscraper2_key.pem azureuser@20.40.46.227 << 'ENDSSH'
cd ~/Phscarper
# Stop current PM2 processes
pm2 stop all

# Install Google Sheets dependencies if not already installed
npm install googleapis@latest google-auth-library@latest axios@latest

# Start with ecosystem file
pm2 start ecosystem.config.js

# Save PM2 config to ensure it restarts on reboot
pm2 save

# Show PM2 status
pm2 list
ENDSSH

echo "Update completed!"