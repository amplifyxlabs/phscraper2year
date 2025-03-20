// Continuous Scraper Script for Product Hunt
// This script continuously updates the date in the TARGET_URL in .env
// and runs the scraper, waiting between runs.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const { uploadCSVToGoogleSheets } = require('./google-sheets-exporter');

// Load current env variables
dotenv.config();
const envFilePath = path.join(__dirname, '.env');

// Function to update the date in TARGET_URL
function updateTargetUrl() {
  try {
    // Read current .env file
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    
    // Extract current TARGET_URL
    const targetUrlMatch = envContent.match(/TARGET_URL=https:\/\/www\.producthunt\.com\/leaderboard\/daily\/(\d+)\/(\d+)\/(\d+)\/all/);
    
    // Determine which date to use for the URL
    let targetDate;
    
    if (!targetUrlMatch) {
      console.log('TARGET_URL not found in .env file, creating a new one with yesterday\'s date');
      
      // Use yesterday's date for the first run
      const now = new Date();
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - 1); // Yesterday
    } else {
      // Extract date components from existing URL
      const year = parseInt(targetUrlMatch[1]);
      const month = parseInt(targetUrlMatch[2]);
      const day = parseInt(targetUrlMatch[3]);
      
      // Create the date object from the URL
      const currentDate = new Date(year, month - 1, day); // Month is 0-indexed in JS
      
      // Decrement the date by 1 day
      targetDate = new Date(currentDate);
      targetDate.setDate(targetDate.getDate() - 1);
      
      console.log(`Decrementing date from ${year}/${month}/${day} to ${targetDate.getFullYear()}/${targetDate.getMonth() + 1}/${targetDate.getDate()}`);
    }
    
    // Format the new date
    const newYear = targetDate.getFullYear();
    const newMonth = targetDate.getMonth() + 1; // Month is 0-indexed
    const newDay = targetDate.getDate();
    
    // Create new TARGET_URL with properly formatted date (no leading zeros)
    const newTargetUrl = `TARGET_URL=https://www.producthunt.com/leaderboard/daily/${newYear}/${newMonth}/${newDay}/all`;
    
    // Update or add the TARGET_URL in the .env file
    let updatedEnvContent;
    if (targetUrlMatch) {
      // Replace existing TARGET_URL
      updatedEnvContent = envContent.replace(
        /TARGET_URL=https:\/\/www\.producthunt\.com\/leaderboard\/daily\/\d+\/\d+\/\d+\/all/,
        newTargetUrl
      );
    } else {
      // Add new TARGET_URL if it doesn't exist
      updatedEnvContent = envContent + '\n' + newTargetUrl;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envFilePath, updatedEnvContent);
    
    console.log(`Updated TARGET_URL to use date: ${newYear}/${newMonth}/${newDay}`);
    return {
      success: true,
      date: `${newYear}/${newMonth}/${newDay}`
    };
  } catch (error) {
    console.error(`Error updating TARGET_URL: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to find the latest CSV file
function findLatestCSV(directory) {
  const files = fs.readdirSync(directory);
  let latestCsvFile = null;
  let latestTime = 0;
  
  files.forEach(file => {
    if (file.startsWith('product_hunt_data_') && file.endsWith('.csv')) {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime.getTime() > latestTime) {
        latestTime = stats.mtime.getTime();
        latestCsvFile = filePath;
      }
    }
  });
  
  return latestCsvFile;
}

// Function to run a single scrape cycle
async function runScrapeCycle() {
  console.log(`Starting scrape cycle at ${new Date().toLocaleString()}`);
  
  // Update the TARGET_URL in .env
  const updateResult = updateTargetUrl();
  
  if (!updateResult.success) {
    console.error(`Failed to update TARGET_URL: ${updateResult.error}`);
    return false;
  }
  
  console.log(`Successfully updated TARGET_URL to date: ${updateResult.date}`);
  
  // Reload environment variables after updating .env
  dotenv.config();
  
  // Run the main scraper
  console.log(`Running main scraper with TARGET_URL: ${process.env.TARGET_URL}`);
  try {
    execSync('node index.js', { stdio: 'inherit' });
    console.log('Scraper finished successfully!');
    
    // Export to Google Sheets if configuration is available
    if (process.env.GOOGLE_SHEET_ID) {
      console.log('Exporting data to Google Sheets...');
      
      // Find the latest CSV file
      const latestCsvFile = findLatestCSV(__dirname);
      
      if (latestCsvFile) {
        console.log(`Latest CSV file found: ${latestCsvFile}`);
        try {
          await uploadCSVToGoogleSheets(latestCsvFile);
          console.log('Data successfully exported to Google Sheets');
        } catch (exportError) {
          console.error(`Error exporting to Google Sheets: ${exportError.message}`);
          // Continue execution even if export fails
        }
      } else {
        console.error('No CSV file found to export');
      }
    } else {
      console.log('Google Sheets export skipped (GOOGLE_SHEET_ID not found in environment variables)');
    }
    
    console.log(`Scrape cycle completed successfully at ${new Date().toLocaleString()}`);
    return true;
  } catch (error) {
    console.error(`Error running scraper: ${error.message}`);
    return false;
  }
}

// Main continuous scraping function
async function startContinuousScraping() {
  console.log('Starting continuous scraper...');
  
  // Run forever
  while (true) {
    const success = await runScrapeCycle();
    
    if (success) {
      console.log('Scrape cycle completed successfully, waiting before next cycle...');
    } else {
      console.error('Scrape cycle failed, waiting before retry...');
    }
    
    // Wait 5 minutes between scrape cycles to avoid overloading the server
    // This can be adjusted based on your needs
    const waitMinutes = 5;
    console.log(`Waiting ${waitMinutes} minutes before next scrape cycle...`);
    await new Promise(resolve => setTimeout(resolve, waitMinutes * 60 * 1000));
  }
}

// Start the continuous scraping process
startContinuousScraping();
