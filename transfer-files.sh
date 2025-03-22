#!/bin/bash

# Define server details
SERVER="20.40.46.227"
USER="azureuser"
KEY_PATH="$HOME/Downloads/phscraper2_key.pem"
REMOTE_DIR="~/phscraper2year"

# List of files to transfer
FILES=(
  "/Users/sankalpsingh/Desktop/phscraper-2years/contactExtractor.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/continuous-scraper.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/cron-scraper.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/ecosystem.config.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/google-sheets-exporter.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/index.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/package.json"
  "/Users/sankalpsingh/Desktop/phscraper-2years/utils.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/scraper.js"
  "/Users/sankalpsingh/Desktop/phscraper-2years/websiteContactExtractor.js"
)

# Transfer each file
for file in "${FILES[@]}"; do
  filename=$(basename "$file")
  echo "Transferring $filename..."
  scp -i "$KEY_PATH" "$file" "$USER@$SERVER:$REMOTE_DIR/"
  if [ $? -eq 0 ]; then
    echo "✅ Successfully transferred $filename"
  else
    echo "❌ Failed to transfer $filename"
  fi
done

echo "Transfer complete!"
