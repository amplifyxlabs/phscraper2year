// Product Hunt Scraper Module
const cheerio = require('cheerio');
const { createObjectCsvWriter } = require('csv-writer');
const { extractContactInfo } = require('./contactExtractor');
const { extractWebsiteContactInfo } = require('./websiteContactExtractor');
const { delay, formatDate, randomDelay, cleanText, isValidUrl, extractDateFromUrl } = require('./utils');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Implements adaptive rate limiting based on website response times
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} responseTime - Response time of the last request in milliseconds
 * @returns {number} - Calculated delay time
 */
function calculateAdaptiveDelay(baseDelay, responseTime) {
  // If the site is responding slowly, we should wait longer
  if (responseTime > 5000) {
    return baseDelay * 1.5 + randomDelay(1000);
  } else if (responseTime > 2000) {
    return baseDelay * 1.2 + randomDelay(500);
  } else {
    return baseDelay + randomDelay(300);
  }
}

// Main scraper function
async function scrapeProductHunt(browser, options = {}) {
  // Default options
  const config = {
    maxProducts: options.maxProducts || 30,
    delayBetweenRequests: options.delayBetweenRequests || 2000,
    debugMode: options.debugMode || false,
    targetUrl: options.targetUrl || 'https://www.producthunt.com/leaderboard/daily/2025/3/17/all',
    maxMakersPerProduct: process.env.MAX_MAKERS_PER_PRODUCT ? parseInt(process.env.MAX_MAKERS_PER_PRODUCT) : 3,
    skipComments: process.env.SKIP_COMMENTS === 'true',
    ...options
  };
  
  // Track request patterns to implement adaptive rate limiting
  const requestStats = {
    lastRequestTime: Date.now(),
    consecutiveRequests: 0,
    totalRequests: 0,
    failedRequests: 0
  };
  
  // Adaptive rate limiting function
  const adaptiveDelay = async () => {
    // Calculate time since last request
    const timeSinceLastRequest = Date.now() - requestStats.lastRequestTime;
    
    // Increase delay if we're making too many consecutive requests
    let delayTime = config.delayBetweenRequests;
    
    if (requestStats.consecutiveRequests > 5) {
      // Add exponential backoff for many consecutive requests
      delayTime = config.delayBetweenRequests * (1 + (requestStats.consecutiveRequests - 5) * 0.2);
    }
    
    // Add jitter to avoid detection patterns
    delayTime += Math.random() * 1000;
    
    // If we've made requests too quickly, wait longer
    if (timeSinceLastRequest < 1000) {
      delayTime += 1000 + Math.random() * 2000;
      requestStats.consecutiveRequests++;
    } else {
      requestStats.consecutiveRequests = Math.max(0, requestStats.consecutiveRequests - 1);
    }
    
    // If we've had failed requests, be more cautious
    if (requestStats.failedRequests > 0) {
      delayTime += requestStats.failedRequests * 1000;
    }
    
    console.log(`Waiting ${Math.round(delayTime)}ms before next request...`);
    await delay(delayTime);
    
    // Update request stats
    requestStats.lastRequestTime = Date.now();
    requestStats.totalRequests++;
  };
  
  console.log(`Scraper config: maxProducts=${config.maxProducts}, delayBetweenRequests=${config.delayBetweenRequests}ms, targetUrl=${config.targetUrl}`);
  console.log(`Additional settings: maxMakersPerProduct=${config.maxMakersPerProduct}, skipComments=${config.skipComments}`);
  
  // CSV Writer setup
  const csvFilePath = path.join(__dirname, `product_hunt_data_${formatDate(new Date())}.csv`);
  console.log(`CSV will be saved to: ${csvFilePath}`);
  
  // Extract date from the target URL
  const extractedDate = extractDateFromUrl(config.targetUrl);
  console.log(`Extracted date from URL: ${extractedDate}`);
  
  const csvWriter = createObjectCsvWriter({
    path: csvFilePath,
    header: [
      { id: 'productName', title: 'Product Name' },
      { id: 'productUrl', title: 'Product URL' },
      { id: 'productWebsite', title: 'Product Website' },
      { id: 'makerName', title: 'Maker Name' },
      { id: 'makerUrl', title: 'Maker URL' },
      { id: 'email', title: 'Email' },
      { id: 'xId', title: 'X (Twitter) ID' },
      { id: 'linkedinUrl', title: 'LinkedIn URL' },
      { id: 'websiteEmail', title: 'Website Email' },
      { id: 'websiteTwitter', title: 'Website Twitter' },
      { id: 'websiteLinkedin', title: 'Website LinkedIn' },
      { id: 'websiteContactPage', title: 'Website Contact Page' },
      { id: 'extractedDate', title: 'Extracted Date' }
    ]
  });
  
  // Array to store all product data
  let allProductData = [];
  
  try {
    // Get the products from the leaderboard page
    const products = await getProductsFromLeaderboard(browser, config);
    
    if (products.length === 0) {
      console.log('No products found on the leaderboard page.');
      return;
    }
    
    console.log(`Found ${products.length} products on the leaderboard page`);
    
    // Limit to max products
    const productsToProcess = products.slice(0, config.maxProducts);
    console.log(`Processing ${productsToProcess.length} products...`);
    
    // Process each product
    for (let i = 0; i < productsToProcess.length; i++) {
      const product = productsToProcess[i];
      console.log(`Processing product ${i + 1}/${productsToProcess.length}: ${product.name}`);
      
      try {
        // Get product details
        const productDetails = await getProductDetails(browser, product.url, config);
        
        // Process makers (limited to maxMakersPerProduct)
        const limitedMakers = productDetails.makers.slice(0, config.maxMakersPerProduct);
        console.log(`Using ${limitedMakers.length} out of ${productDetails.makers.length} makers for product`);
        
        if (limitedMakers.length > 0) {
          // For each maker, create an entry in the CSV
          for (const maker of limitedMakers) {
            const productData = {
              productName: product.name,
              productUrl: product.url,
              productWebsite: productDetails.productWebsite || '',
              makerName: maker.name || '',
              makerUrl: maker.url || '',
              email: maker.email || '',
              xId: maker.xId || '',
              linkedinUrl: maker.linkedinUrl || '',
              websiteEmail: productDetails.websiteContactInfo.email || '',
              websiteTwitter: productDetails.websiteContactInfo.twitter || '',
              websiteLinkedin: productDetails.websiteContactInfo.linkedin || '',
              websiteContactPage: productDetails.websiteContactInfo.website || '',
              extractedDate: extractedDate
            };
            
            // Add to the array
            allProductData.push(productData);
          }
        } else {
          // If no makers found, still add the product with empty maker info
          const productData = {
            productName: product.name,
            productUrl: product.url,
            productWebsite: productDetails.productWebsite || '',
            makerName: '',
            makerUrl: '',
            email: '',
            xId: '',
            linkedinUrl: '',
            websiteEmail: productDetails.websiteContactInfo.email || '',
            websiteTwitter: productDetails.websiteContactInfo.twitter || '',
            websiteLinkedin: productDetails.websiteContactInfo.linkedin || '',
            websiteContactPage: productDetails.websiteContactInfo.website || '',
            extractedDate: extractedDate
          };
          
          // Add to the array
          allProductData.push(productData);
        }
      } catch (error) {
        console.error(`Error processing product ${product.name}: ${error.message}`);
        
        // Track failed requests for adaptive delay
        requestStats.failedRequests++;
        
        // Still add the product with error info
        const productData = {
          productName: product.name,
          productUrl: product.url,
          productWebsite: '',
          makerName: '',
          makerUrl: '',
          email: '',
          xId: '',
          linkedinUrl: '',
          websiteEmail: '',
          websiteTwitter: '',
          websiteLinkedin: '',
          websiteContactPage: '',
          extractedDate: extractedDate
        };
        
        // Add to the array
        allProductData.push(productData);
      }
      
      // Use adaptive delay between products
      if (i < productsToProcess.length - 1) {
        await adaptiveDelay();
      }
    }
    
    // Write to CSV
    console.log(`Writing ${allProductData.length} entries to CSV...`);
    await csvWriter.writeRecords(allProductData);
    
    console.log(`Scraping completed. CSV saved to ${csvFilePath}`);
    
  } catch (error) {
    console.error(`Error during scraping: ${error.message}`);
    throw error;
  }
}

// Function to get products from the leaderboard page
async function getProductsFromLeaderboard(browser, config) {
  console.log('Extracting products from leaderboard page...');
  
  // Create a new page
  const page = await browser.newPage();
  
  // Set user agent to avoid detection
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  try {
    // Navigate to the leaderboard page
    await page.goto(config.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    console.log(`Loaded leaderboard page: ${config.targetUrl}`);
    
    // Wait for the page to fully load
    await delay(3000);
    
    // Scroll down multiple times to load all lazy-loaded products
    console.log('Scrolling to load all products...');
    
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    let scrollCount = 0;
    const maxScrolls = 50; // Set a reasonable limit to prevent infinite scrolling
    
    while (scrollCount < maxScrolls) {
      // Scroll to the bottom of the page
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      
      // Wait for any lazy-loaded content to appear
      await delay(2000);
      
      // Get new scroll height
      const newHeight = await page.evaluate('document.body.scrollHeight');
      
      // Log progress
      scrollCount++;
      console.log(`Scroll #${scrollCount} - Height: ${newHeight}px`);
      
      // If the height didn't change, we've probably reached the bottom
      if (newHeight === lastHeight) {
        console.log('Reached the bottom of the page or no more content is loading');
        // Scroll one more time to be sure
        if (scrollCount >= 3) {
          break;
        }
      }
      
      lastHeight = newHeight;
    }
    
    console.log(`Completed ${scrollCount} scrolls to load all products`);
    
    // Get the HTML content
    const content = await page.content();
    const $ = cheerio.load(content);
    
    // Find product elements
    console.log('Looking for product elements on the fully loaded page...');
    
    // Array to store products
    const products = [];
    
    // Try different selectors to find products
    const productElements = $('a[href^="/products/"]');
    console.log(`Found ${productElements.length} product elements after scrolling`);
    
    productElements.each((index, element) => {
      try {
        // Extract product info
        const productUrl = $(element).attr('href');
        let productName = $(element).text().trim();
        
        // If the text is empty, try to find a child element with the name
        if (!productName) {
          const nameElement = $(element).find('h3, h4, div[class*="name"], div[class*="title"]').first();
          if (nameElement.length > 0) {
            productName = nameElement.text().trim();
          }
        }
        
        // Only add if we have a URL and name
        if (productUrl && productName && !products.some(p => p.url === `https://www.producthunt.com${productUrl}`)) {
          products.push({
            name: productName,
            url: `https://www.producthunt.com${productUrl}`
          });
        }
      } catch (error) {
        console.error(`Error extracting product info: ${error.message}`);
      }
    });
    
    // Filter out duplicates and invalid entries
    const uniqueProducts = [];
    const seenUrls = new Set();
    
    for (const product of products) {
      // Verify it looks like a product URL (contains /posts/) and not just any link
      if (product.url.includes('/products/') && !seenUrls.has(product.url)) {
        seenUrls.add(product.url);
        uniqueProducts.push(product);
      }
    }
    
    console.log(`Found ${uniqueProducts.length} unique products after filtering`);
    
    // If we still don't have many products, try a more generic approach
    if (uniqueProducts.length < 20) {
      console.log('Found fewer products than expected, trying a more direct approach...');
      
      // Use page.evaluate to find products
      const productLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/posts/"]'));
        return links.map(link => {
          // Try to find the product name
          let name = '';
          
          // Look for heading elements inside or near the link
          const heading = link.querySelector('h3, h4, h5') || 
                          link.parentElement.querySelector('h3, h4, h5');
          
          if (heading) {
            name = heading.textContent.trim();
          } else {
            // If no heading, use the link text
            name = link.textContent.trim();
          }
          
          return {
            name: name,
            url: link.href
          };
        }).filter(product => product.name && product.url);
      });
      
      // Add to uniqueProducts array
      for (const product of productLinks) {
        if (!seenUrls.has(product.url) && product.url.includes('/posts/')) {
          seenUrls.add(product.url);
          uniqueProducts.push(product);
        }
      }
      
      console.log(`Found ${uniqueProducts.length} unique products after additional search`);
    }
    
    return uniqueProducts;
  } catch (error) {
    console.error(`Error in getProductsFromLeaderboard: ${error.message}`);
    throw error;
  } finally {
    // Close the page
    await page.close();
  }
}

// Function to get detailed product information
async function getProductDetails(browser, productUrl, config) {
  // Create a new page for this product
  const page = await browser.newPage();
  
  // Set user agent to avoid detection
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  // Set viewport to a common desktop resolution
  await page.setViewport({
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
  });
  
  // Set accept language header
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'sec-ch-ua': '"Chromium";v="122", "Google Chrome";v="122", "Not(A:Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"'
  });
  
  try {
    // Record start time to measure response time
    const startTime = Date.now();
    
    // Navigate to the product page
    await page.goto(productUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    console.log(`Loaded product page: ${productUrl} (response time: ${responseTime}ms)`);
    
    // Wait for the page to fully load
    await delay(3000);
    
    // Get the HTML content
    const content = await page.content();
    const $ = cheerio.load(content);
    
    // Initialize product details
    const productDetails = {
      productWebsite: '',
      makers: [],
      websiteContactInfo: {
        email: '',
        twitter: '',
        linkedin: '',
        website: ''
      }
    };
    
    // Extract product website URL - try multiple approaches
    console.log('Looking for product website URL...');
    
    // First approach: Try to find the website URL using the "Visit" button
    let websiteUrl = await page.evaluate(() => {
      // Look for buttons with "Visit" text
      const visitButtons = Array.from(document.querySelectorAll('a, button')).filter(el => {
        const text = el.textContent.toLowerCase().trim();
        return (text === 'visit' || 
                text === 'visit website' || 
                text === 'website' || 
                text.includes('visit site') ||
                text.includes('view site') ||
                text.includes('open site') ||
                text.includes('go to site')) && 
               el.href && 
               el.href.startsWith('http') &&
               !el.href.includes('producthunt.com/r/') &&
               !el.href.includes('lu.ma/producthunt');
      });
      
      if (visitButtons.length > 0) {
        return visitButtons[0].href;
      }
      
      return '';
    });
    
    if (websiteUrl) {
      console.log(`Found website URL from visit button: ${websiteUrl}`);
    }
    
    // Second approach: Try to find the website URL using redirect links
    if (!websiteUrl) {
      const redirectLinks = $('a[href^="https://www.producthunt.com/r/"]');
      
      if (redirectLinks.length > 0) {
        const redirectUrl = redirectLinks.first().attr('href');
        console.log(`Found redirect URL: ${redirectUrl}`);
        
        try {
          // Follow the redirect
          const redirectPage = await browser.newPage();
          await redirectPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          
          // Navigate to the redirect URL
          const response = await redirectPage.goto(redirectUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          
          // Get the final URL after redirect
          const finalUrl = response.url();
          
          // Check if the final URL is not a Product Hunt page and not the generic lu.ma page
          if (!finalUrl.includes('producthunt.com') && 
              !finalUrl.includes('lu.ma/producthunt')) {
            websiteUrl = finalUrl;
            console.log(`Redirect resolved to: ${websiteUrl}`);
          } else {
            console.log(`Redirect resolved to internal/generic URL: ${finalUrl}, ignoring`);
          }
          
          // Close the redirect page
          await redirectPage.close();
        } catch (error) {
          console.log(`Error following redirect: ${error.message}`);
        }
      }
    }
    
    // Third approach: Try to find the website URL using "Get it" button
    if (!websiteUrl) {
      console.log('Trying to find "Get it" button...');
      
      websiteUrl = await page.evaluate(() => {
        // Look for "Get it" buttons
        const getItButtons = Array.from(document.querySelectorAll('a, button')).filter(el => {
          const text = el.textContent.toLowerCase().trim();
          return (text === 'get it' || 
                  text === 'get' ||
                  text === 'try' ||
                  text === 'try it' ||
                  text === 'try it free' ||
                  text === 'try for free' ||
                  text === 'download' || 
                  text === 'download now' ||
                  text === 'install' ||
                  text === 'install now' ||
                  text === 'sign up' ||
                  text === 'signup' ||
                  text === 'join' ||
                  text === 'join now' ||
                  text === 'launch' ||
                  text === 'launch app' ||
                  text.includes('download') || 
                  text.includes('try it') ||
                  text.includes('get it') ||
                  text.includes('sign up') ||
                  text.includes('install')) && 
                 el.href && 
                 el.href.startsWith('http') &&
                 !el.href.includes('producthunt.com') &&
                 !el.href.includes('lu.ma/producthunt');
        });
        
        if (getItButtons.length > 0) {
          return getItButtons[0].href;
        }
        
        return '';
      });
      
      if (websiteUrl) {
        console.log(`Found website URL from "Get it" button: ${websiteUrl}`);
      }
    }
    
    // Fourth approach: Try to find any external link that's not a social media link
    if (!websiteUrl) {
      console.log('Looking for any external link...');
      
      websiteUrl = await page.evaluate(() => {
        // Get all external links
        const externalLinks = Array.from(document.querySelectorAll('a[href^="http"]')).filter(a => {
          const href = a.href.toLowerCase();
          // Exclude common social media and generic sites
          return !href.includes('producthunt.com') && 
                 !href.includes('lu.ma/producthunt') &&
                 !href.includes('twitter.com') && 
                 !href.includes('x.com') && 
                 !href.includes('linkedin.com') && 
                 !href.includes('facebook.com') && 
                 !href.includes('instagram.com') &&
                 !href.includes('youtube.com/channel/') &&  // Exclude generic YouTube channels
                 !href.includes('youtube.com/user/') &&     // Exclude generic YouTube users
                 !href.includes('github.com/') &&           // Exclude generic GitHub links
                 !href.includes('medium.com/') &&           // Exclude generic Medium links
                 !href.includes('discord.gg/') &&           // Exclude generic Discord links
                 !href.includes('t.me/');                   // Exclude generic Telegram links
        });
        
        // Sort links by length (shorter URLs are often the main domain)
        externalLinks.sort((a, b) => a.href.length - b.href.length);
        
        if (externalLinks.length > 0) {
          return externalLinks[0].href;
        }
        
        return '';
      });
      
      if (websiteUrl) {
        console.log(`Found external link: ${websiteUrl}`);
      }
    }
    
    // Fifth approach: Look for specific patterns in the page content
    if (!websiteUrl) {
      console.log('Looking for website URL in page content...');
      
      websiteUrl = await page.evaluate(() => {
        // Look for text that might contain a website URL
        const pageText = document.body.innerText;
        
        // Common patterns for website mentions
        const patterns = [
          /visit us at\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
          /website\s*:\s*(https?:\/\/[^\s,]+)/i,
          /available at\s+(https?:\/\/[^\s,]+)/i,
          /check out\s+(https?:\/\/[^\s,]+)/i,
          /official site\s*:\s*(https?:\/\/[^\s,]+)/i,
          /homepage\s*:\s*(https?:\/\/[^\s,]+)/i,
          /website\s*:\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
          // Replace overly broad patterns with more specific ones
          /\b((?:https?:\/\/)?[a-zA-Z0-9][a-zA-Z0-9-]*\.ai(?:\/[^\s,]*)?)\b/i,  // More precise .ai domain pattern
          /\b((?:https?:\/\/)?[a-zA-Z0-9][a-zA-Z0-9-]*\.app(?:\/[^\s,]*)?)\b/i, // More precise .app domain pattern
          /\b((?:https?:\/\/)?[a-zA-Z0-9][a-zA-Z0-9-]*\.dev(?:\/[^\s,]*)?)\b/i  // More precise .dev domain pattern
        ];
        
        // Try each pattern
        for (const pattern of patterns) {
          const match = pageText.match(pattern);
          if (match && match[1]) {
            let url = match[1];
            
            // Add https:// if it's missing
            if (!url.startsWith('http')) {
              url = 'https://' + url;
            }
            
            return url;
          }
        }
        
        return '';
      });
      
      if (websiteUrl) {
        console.log(`Found website URL in page content: ${websiteUrl}`);
        
        // Add validation to ensure we're not incorrectly identifying Bebop.ai
        if (websiteUrl.toLowerCase().includes('bebop.ai')) {
          console.log('WARNING: Bebop.ai detected as product website - likely a false positive');
          
          // Check if this appears to be an advertisement or unrelated content
          const isBebopRealWebsite = await page.evaluate(() => {
            // Count number of mentions of Bebop.ai in the page
            const pageText = document.body.innerText.toLowerCase();
            const bebopCount = (pageText.match(/bebop\.ai/g) || []).length;
            
            // If only mentioned once or twice, likely not the real website
            if (bebopCount < 3) return false;
            
            // Check if there's a prominent/header link to Bebop.ai
            const bebopLinks = Array.from(document.querySelectorAll('a[href*="bebop.ai"]'));
            const headerBebopLink = bebopLinks.some(link => {
              const rect = link.getBoundingClientRect();
              return rect.top < 300; // In the header area
            });
            
            return headerBebopLink || bebopCount > 5;
          });
          
          if (!isBebopRealWebsite) {
            console.log('Rejecting Bebop.ai as likely false positive');
            websiteUrl = ''; // Reset to try other methods
          }
        }
      }
    }
    
    // Sixth approach: Extract domain from maker's email
    if (!websiteUrl) {
      console.log('Looking for website URL from maker emails...');
      
      // Get all maker emails
      const makerEmails = [];
      
      // Use page.evaluate to find emails in the page
      const pageEmails = await page.evaluate(() => {
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const pageText = document.body.innerText;
        return pageText.match(emailRegex) || [];
      });
      
      makerEmails.push(...pageEmails);
      
      // Extract domains from emails
      const domains = makerEmails
        .map(email => {
          const match = email.match(/@([a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
          return match ? match[1] : null;
        })
        .filter(domain => domain && 
          !domain.includes('gmail.com') && 
          !domain.includes('yahoo.com') && 
          !domain.includes('hotmail.com') && 
          !domain.includes('outlook.com') && 
          !domain.includes('icloud.com') && 
          !domain.includes('aol.com') && 
          !domain.includes('protonmail.com') && 
          !domain.includes('mail.com')
        );
      
      if (domains.length > 0) {
        websiteUrl = 'https://' + domains[0];
        console.log(`Found website URL from maker email: ${websiteUrl}`);
      }
    }
    
    if (websiteUrl) {
      productDetails.productWebsite = websiteUrl;
      console.log(`Found product website: ${websiteUrl}`);
      
      // Extract contact information from the product website
      try {
        console.log(`Extracting contact info from product website: ${websiteUrl}`);
        
        // Use a retry mechanism for website contact extraction
        let retryCount = 0;
        const maxRetries = 2;
        let websiteContactInfo = null;
        
        while (retryCount <= maxRetries && !websiteContactInfo) {
          try {
            if (retryCount > 0) {
              console.log(`Retry ${retryCount}/${maxRetries} for website contact extraction`);
              // Wait longer between retries
              await delay(5000 * retryCount);
            }
            
            websiteContactInfo = await extractWebsiteContactInfo(browser, websiteUrl);
            
            // If we got empty results and have retries left, try again
            if (!websiteContactInfo.email && 
                !websiteContactInfo.twitter && 
                !websiteContactInfo.linkedin && 
                !websiteContactInfo.website && 
                retryCount < maxRetries) {
              websiteContactInfo = null; // Force retry
              retryCount++;
            }
          } catch (error) {
            console.error(`Error in website contact extraction attempt ${retryCount + 1}: ${error.message}`);
            retryCount++;
            
            // If we've used all retries, set empty contact info
            if (retryCount > maxRetries) {
              websiteContactInfo = { email: '', twitter: '', linkedin: '', website: '' };
            }
          }
        }
        
        productDetails.websiteContactInfo = websiteContactInfo || { email: '', twitter: '', linkedin: '', website: '' };
        console.log(`Website contact info extracted: ${JSON.stringify(productDetails.websiteContactInfo)}`);
      } catch (error) {
        console.error(`Error extracting website contact info: ${error.message}`);
      }
    } else {
      console.log('No product website URL found');
    }
    
    // Find makers section - look for the heading "Meet the team" or similar
    const teamSection = $('h2:contains("Meet the team"), h3:contains("Meet the team"), div:contains("Meet the team")').first();
    
    // Find maker links - either in the team section or general maker links
    let makerLinks;
    if (teamSection.length > 0) {
      // Get the parent container and find maker links inside it
      const parentContainer = teamSection.parent();
      makerLinks = parentContainer.find('a[href^="/@"]');
    } else {
      // If no team section found, look for maker links throughout the page
      makerLinks = $('a[href^="/@"]');
    }
    
    if (makerLinks.length > 0) {
      console.log(`Found ${makerLinks.length} potential makers`);
      
      // Extract maker information
      const makers = [];
      const processedMakerUrls = new Set(); // To avoid duplicates
      
      makerLinks.each((index, element) => {
        try {
          const makerUrl = $(element).attr('href');
          if (makerUrl && makerUrl.startsWith('/@')) {
            const fullMakerUrl = `https://www.producthunt.com${makerUrl}`;
            
            // Check if we've already processed this maker
            if (!processedMakerUrls.has(fullMakerUrl)) {
              processedMakerUrls.add(fullMakerUrl);
              
              // Look for a maker badge/label near the link
              const parentEl = $(element).parent();
              const isMaker = parentEl.find('span:contains("Maker"), div:contains("Maker")').length > 0;
              
              // Get the maker name
              const makerName = $(element).text().trim();
              
              // Add to makers array if it's marked as a maker or if we don't have many makers yet
              if (isMaker || makers.length < config.maxMakersPerProduct) {
                makers.push({ url: fullMakerUrl, name: makerName, isMaker });
              }
            }
          }
        } catch (error) {
          console.error(`Error extracting maker info: ${error.message}`);
        }
      });
      
      // Sort makers to prioritize confirmed makers first
      makers.sort((a, b) => {
        if (a.isMaker && !b.isMaker) return -1;
        if (!a.isMaker && b.isMaker) return 1;
        return 0;
      });
      
      // Only process the specified maximum number of makers
      const makersToProcess = makers.slice(0, config.maxMakersPerProduct);
      
      console.log(`Processing ${makersToProcess.length} makers (limited by config)`);
      
      // Process each maker to get their contact information
      for (const maker of makersToProcess) {
        try {
          console.log(`Processing maker: ${maker.name}`);
          
          // Extract contact information from maker's profile
          const contactInfo = await extractContactInfo(browser, maker.url);
          
          // Add contact info to maker object
          maker.email = contactInfo.email || '';
          maker.xId = contactInfo.xId || '';
          maker.linkedinUrl = contactInfo.linkedinUrl || '';
          
          // Add to product details
          productDetails.makers.push(maker);
          
          // Random delay between processing makers
          const makerDelayTime = randomDelay(config.delayBetweenRequests / 2);
          console.log(`Waiting ${makerDelayTime}ms before next maker...`);
          await delay(makerDelayTime);
        } catch (error) {
          console.error(`Error processing maker ${maker.name}: ${error.message}`);
          continue;
        }
      }
    }
    
    return productDetails;
  } catch (error) {
    console.error(`Error in getProductDetails: ${error.message}`);
    return { productWebsite: '', makers: [], websiteContactInfo: { email: '', twitter: '', linkedin: '', website: '' } };
  } finally {
    // Close the page
    await page.close();
  }
}

module.exports = {
  scrapeProductHunt
}; 