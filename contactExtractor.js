// Contact Extractor Module
const cheerio = require('cheerio');
const { delay, randomDelay } = require('./utils');

// Function to extract contact information from a maker's profile
async function extractContactInfo(browser, makerUrl) {
  // Create a new page for this maker
  const page = await browser.newPage();
  
  try {
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the maker's profile
    await page.goto(makerUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log(`Loaded maker profile: ${makerUrl}`);
    
    // Wait for the page to fully load
    await delay(2000);
    
    // Get the HTML content
    const content = await page.content();
    const $ = cheerio.load(content);
    
    // Initialize contact info
    let email = '';
    let xId = '';
    let linkedinUrl = '';
    
    // Look for social links
    const socialLinks = $('a[href*="twitter.com"], a[href*="x.com"], a[href*="linkedin.com"], a[href^="mailto:"], a[href*="/twitter"], a[href*="/linkedin"]');
    
    socialLinks.each((index, element) => {
      const href = $(element).attr('href');
      
      if (!href) return;
      
      // Check for Twitter/X
      if ((href.includes('twitter.com') || href.includes('x.com')) && !xId) {
        xId = extractTwitterHandle(href);
        console.log(`Found Twitter handle: ${xId}`);
      }
      
      // Check for LinkedIn
      if (href.includes('linkedin.com') && !linkedinUrl) {
        linkedinUrl = href;
        console.log(`Found LinkedIn URL: ${linkedinUrl}`);
      }
      
      // Check for email in href
      if (href.startsWith('mailto:') && !email) {
        email = href.replace('mailto:', '').trim().split('?')[0]; // Remove any parameters
        console.log(`Found email: ${email}`);
      }
    });
    
    // If email not found in links, look for it in text
    if (!email) {
      const pageText = $('body').text();
      // Initial email regex to find potential email addresses
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
      const emailMatches = pageText.match(emailRegex);
      
      if (emailMatches && emailMatches.length > 0) {
        // Get the first email match
        let rawEmail = emailMatches[0];
        
        // Improved cleaning logic for malformed emails
        // First, extract the basic email pattern
        const basicEmailMatch = rawEmail.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
        if (basicEmailMatch && basicEmailMatch[1]) {
          rawEmail = basicEmailMatch[1];
        }
        
        // Then, find where the valid email ends by looking for common domain endings
        const domainEndingRegex = /\.(com|org|net|io|ai|co|dev|app|software|edu|gov|biz|info|me|tv|xyz|uk|us|ca|au|de|fr|jp|ru|br|in|cn|nl|se|no|fi|dk|pl|ch|at|be|es|pt|gr|cz|hu|ro|sk|bg|hr|rs|si|lt|lv|ee|ua|by|kz|tr|il|sa|ae|za|ng|ke|eg|ma|dz|tn|gh|ci|cm|sn|mg|mu|re|yt|nc|pf|tf|wf|mq|gp|gf|pm|bl|mf|ws|as|gu|mp|pr|vi|um|fm|pw|mh|vu|sb|fj|to|ck|nu|tk|ki|nr|tv|cx|cc|nf|hm|aq|bv|gs|sj|tc|vg|ms|ky|ai|dm|lc|vc|gd|bb|ag|bs|jm|ht|do|pr|tt|kn|gl|fo|ax|je|gg|im|sh|io|ac|sc|mv|lk|bt|np|bd|pk|lk|mm|th|la|kh|vn|my|sg|bn|id|tl|ph|tw|hk|mo|kr|jp|cn|mn|kp|kz|uz|tm|tj|kg|af|pk|in|np|bt|bd|lk|mv|ph|id|sg|my|bn|tl|kh|la|mm|th|vn|cn|hk|mo|tw|jp|kr|kp|mn|au|nz|fj|vu|to|ws|ck|nu|pf|nc|sb|nr|ki|tv|fm|mh|pw|pg|tk|cx|cc|nf|hm|aq|bv|gs|sj|tc|vg|ms|ky|ai|dm|lc|vc|gd|bb|ag|bs|jm|ht|do|pr|tt|kn|gl|fo|ax|je|gg|im|sh|io|ac|sc|mv|lk|bt|np|bd|pk|lk|mm|th|la|kh|vn|my|sg|bn|id|tl|ph|tw|hk|mo|kr|jp|cn|mn|kp|kz|uz|tm|tj|kg|af|pk|in|np|bt|bd|lk|mv|ph|id|sg|my|bn|tl|kh|la|mm|th|vn|cn|hk|mo|tw|jp|kr|kp|mn|au|nz|fj|vu|to|ws|ck|nu|pf|nc|sb|nr|ki|tv|fm|mh|pw|pg|tk|cx|cc|nf|hm|aq|bv|gs|sj|tc|vg|ms|ky|ai|dm|lc|vc|gd|bb|ag|bs|jm|ht|do|pr|tt|kn|gl|fo|ax|je|gg|im|sh|io|ac|sc)\b/i;
        const domainEndingMatch = rawEmail.match(domainEndingRegex);
        
        if (domainEndingMatch) {
          const endIndex = rawEmail.indexOf(domainEndingMatch[0]) + domainEndingMatch[0].length;
          email = rawEmail.substring(0, endIndex);
        } else {
          // If no standard domain ending found, try to find where the email might end
          // by looking for non-email characters after a potential domain
          const nonEmailCharRegex = /\.(com|org|net|io|ai|co|dev|app|software)([^a-zA-Z0-9._-])/i;
          const nonEmailCharMatch = rawEmail.match(nonEmailCharRegex);
          
          if (nonEmailCharMatch) {
            const endIndex = rawEmail.indexOf(nonEmailCharMatch[2]);
            email = rawEmail.substring(0, endIndex);
          } else {
            email = rawEmail;
          }
        }
        
        console.log(`Found email in text: ${email}`);
      }
    }
    
    // Try to extract email using JavaScript if not found yet
    if (!email) {
      console.log('Trying JavaScript extraction for email...');
      
      const jsEmail = await page.evaluate(() => {
        // More aggressive email extraction
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const pageText = document.body.innerText;
        const emailMatches = pageText.match(emailRegex);
        
        if (emailMatches && emailMatches.length > 0) {
          // Get the first email match
          let rawEmail = emailMatches[0];
          
          // Clean up the email by finding where the domain ends
          // Look for common domain endings
          const domainEndingRegex = /\.(com|org|net|io|ai|co|dev|app|software)\b/i;
          const domainEndingMatch = rawEmail.match(domainEndingRegex);
          
          if (domainEndingMatch) {
            const endIndex = rawEmail.indexOf(domainEndingMatch[0]) + domainEndingMatch[0].length;
            return rawEmail.substring(0, endIndex);
          }
          
          // If no standard domain ending found, try to find where the email might end
          // by looking for non-email characters after a potential domain
          const nonEmailCharRegex = /\.(com|org|net|io|ai|co|dev|app|software)([^a-zA-Z0-9._-])/i;
          const nonEmailCharMatch = rawEmail.match(nonEmailCharRegex);
          
          if (nonEmailCharMatch) {
            const endIndex = rawEmail.indexOf(nonEmailCharMatch[2]);
            return rawEmail.substring(0, endIndex);
          }
          
          return rawEmail;
        }
        
        return '';
      });
      
      if (jsEmail) {
        email = jsEmail;
        console.log(`Found email with JavaScript: ${email}`);
      }
    }
    
    return { email, xId, linkedinUrl };
  } catch (error) {
    console.error(`Error extracting contact info: ${error.message}`);
    return { email: '', xId: '', linkedinUrl: '' };
  } finally {
    // Always close the page to free up resources
    await page.close();
  }
}

// Function to extract Twitter handle from URL
function extractTwitterHandle(url) {
  if (!url) return '';
  
  // Remove any query parameters or fragments
  url = url.split('?')[0].split('#')[0];
  
  // Remove trailing slash if present
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  
  // Extract the handle (last part of the URL)
  const parts = url.split('/');
  const handle = parts[parts.length - 1];
  
  // Validate that it looks like a Twitter handle
  if (handle && handle !== 'twitter.com' && handle !== 'x.com' && !handle.includes('.')) {
    return handle;
  }
  
  return '';
}

module.exports = {
  extractContactInfo
}; 