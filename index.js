// Product Hunt Scraper
// This script scrapes Product Hunt for product launches and extracts:
// - Product name and URL
// - Maker contact info (email, Twitter, LinkedIn) for top 3 makers
// - Product website 

require('dotenv').config();
const puppeteer = require('puppeteer');
const { scrapeProductHunt } = require('./scraper');
const fs = require('fs');
const path = require('path');

// Get configuration from environment variables or use defaults
const HEADLESS = process.env.HEADLESS === 'true';
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '20', 10);
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_BETWEEN_REQUESTS || '2000', 10);
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const TARGET_URL = process.env.TARGET_URL || 'https://www.producthunt.com/leaderboard/daily/2025/3/17/all';
const MAX_MAKERS_PER_PRODUCT = parseInt(process.env.MAX_MAKERS_PER_PRODUCT || '3', 10);
const SKIP_COMMENTS = process.env.SKIP_COMMENTS === 'true';

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Created logs directory at ${logsDir}`);
}

// Function to log messages to console and file
function log(message) {
  const logFile = path.join(logsDir, `scraper_log_${new Date().toISOString().replace(/:/g, '-')}.txt`);
  console.log(message);
  fs.appendFileSync(logFile, `${message}\n`);
}

// Main function to run the scraper
async function main() {
  log('Starting Product Hunt Scraper...');
  log(`Configuration: MAX_PRODUCTS=${MAX_PRODUCTS}, HEADLESS=${HEADLESS}, DEBUG_MODE=${DEBUG_MODE}`);
  log(`Additional settings: MAX_MAKERS_PER_PRODUCT=${MAX_MAKERS_PER_PRODUCT}, SKIP_COMMENTS=${SKIP_COMMENTS}`);
  log(`Target URL: ${TARGET_URL}`);
  
  let browser;
  
  try {
    // Launch browser with additional options
    const launchOptions = {
      headless: HEADLESS,
      defaultViewport: { width: 1366, height: 768 },
      args: [
        '--window-size=1366,768',
        '--disable-features=site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
         '--disable-gpu',
    '--disable-software-rasterizer'
      ]
    };
    
    log('Launching browser...');
    browser = await puppeteer.launch(launchOptions);
    
    // Run the scraper
    await scrapeProductHunt(browser, {
      maxProducts: MAX_PRODUCTS,
      delayBetweenRequests: DELAY_BETWEEN_REQUESTS,
      debugMode: DEBUG_MODE,
      targetUrl: TARGET_URL,
      maxMakersPerProduct: MAX_MAKERS_PER_PRODUCT,
      skipComments: SKIP_COMMENTS
    });
    
    log('Scraping completed successfully!');
    
    // Close browser
    await browser.close();
  } catch (error) {
    log(`Error during scraping: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
    
    // Try to close the browser if it's open
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        log(`Error closing browser: ${closeError.message}`);
      }
    }
    
    process.exit(1);
  }
}

// Run the main function
main(); 