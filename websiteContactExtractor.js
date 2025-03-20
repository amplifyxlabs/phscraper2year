// Website Contact Extractor Module
const cheerio = require('cheerio');
const { delay, randomDelay, isValidUrl } = require('./utils');

/**
 * Extract contact information from a product website
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} websiteUrl - URL of the product website
 * @returns {Object} - Contact information (email, twitter, linkedin, website)
 */
async function extractWebsiteContactInfo(browser, websiteUrl) {
  if (!websiteUrl || !isValidUrl(websiteUrl)) {
    console.log(`Invalid website URL: ${websiteUrl}`);
    return { email: '', twitter: '', linkedin: '', website: '' };
  }

  console.log(`Extracting contact info from website: ${websiteUrl}`);
  
  // Create a new page
  const page = await browser.newPage();
  
  // Configure the page to appear more like a real browser
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
  
  // Set cookies to appear more like a real user
  await page.setCookie({
    name: 'visited_before',
    value: 'true',
    domain: new URL(websiteUrl).hostname,
    path: '/',
  });
  
  // Set timeouts
  await page.setDefaultNavigationTimeout(60000);
  await page.setDefaultTimeout(60000);
  
  try {
    // Set a timeout for the entire operation
    const timeout = 60000; // 60 seconds
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Website navigation timed out')), timeout)
    );
    
    // Try to navigate to the website with retries
    let navigationSuccessful = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!navigationSuccessful && retryCount < maxRetries) {
      try {
        // Different wait conditions for each retry - start with lightweight approach
        let waitUntil;
        if (retryCount === 0) {
          waitUntil = 'domcontentloaded'; // Minimal loading, just DOM
        } else if (retryCount === 1) {
          waitUntil = 'networkidle0'; // Less strict loading
        } else {
          waitUntil = 'networkidle2'; // Most complete loading as last resort
        }
        
        console.log(`Navigation attempt ${retryCount + 1}/${maxRetries} with wait condition: ${waitUntil}`);
        
        // Navigate to the website
        const navigationPromise = page.goto(websiteUrl, {
          waitUntil: waitUntil,
          timeout: 45000
        });
        
        // Race between navigation and timeout
        await Promise.race([navigationPromise, timeoutPromise]);
        
        // If we get here, navigation was successful
        navigationSuccessful = true;
        console.log(`Successfully loaded website: ${websiteUrl}`);
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Navigation attempt ${retryCount} failed: ${error.message}. Retrying...`);
          await delay(2000); // Wait before retrying
        } else {
          throw error; // Rethrow the error after all retries fail
        }
      }
    }
    
    // Check for common anti-bot measures
    const isCaptchaPresent = await page.evaluate(() => {
      // Check for common CAPTCHA patterns
      const pageText = document.body.innerText.toLowerCase();
      const htmlContent = document.body.innerHTML.toLowerCase();
      
      return pageText.includes('captcha') || 
             pageText.includes('robot') || 
             pageText.includes('human verification') ||
             pageText.includes('are you a robot') ||
             pageText.includes('prove you are human') ||
             pageText.includes('security check') ||
             htmlContent.includes('recaptcha') ||
             htmlContent.includes('hcaptcha') ||
             htmlContent.includes('cloudflare') ||
             document.querySelector('iframe[src*="captcha"]') !== null ||
             document.querySelector('iframe[src*="recaptcha"]') !== null ||
             document.querySelector('iframe[src*="hcaptcha"]') !== null;
    });
    
    if (isCaptchaPresent) {
      console.log('CAPTCHA or anti-bot measure detected. Extraction may be limited.');
      // Take a screenshot for debugging
      await page.screenshot({ path: `captcha_${new URL(websiteUrl).hostname}.png` });
    }
    
    // Check if we were blocked or redirected to an error page
    const isBlocked = await page.evaluate(() => {
      const pageText = document.body.innerText.toLowerCase();
      const currentUrl = window.location.href;
      
      return pageText.includes('access denied') || 
             pageText.includes('403 forbidden') ||
             pageText.includes('404 not found') ||
             pageText.includes('blocked') ||
             pageText.includes('your ip has been blocked') ||
             pageText.includes('too many requests') ||
             pageText.includes('rate limited') ||
             currentUrl.includes('error') ||
             currentUrl.includes('blocked') ||
             currentUrl.includes('denied');
    });
    
    if (isBlocked) {
      console.log('Access appears to be blocked or page not found. Extraction may fail.');
      // Take a screenshot for debugging
      await page.screenshot({ path: `blocked_${new URL(websiteUrl).hostname}.png` });
    }
    
    // Wait for the page to fully load
    await delay(2000);
    
    // After successful navigation, first try to find and visit contact page
    let contactPageUrl = '';
    try {
      contactPageUrl = await page.evaluate(() => {
        const contactLinks = Array.from(document.querySelectorAll('a')).filter(link => {
          const href = link.href.toLowerCase();
          const text = link.textContent.toLowerCase();
          return (href.includes('/contact') || 
                 href.includes('/about') || 
                 href.includes('/support') || 
                 text.includes('contact') || 
                 text.includes('get in touch') ||
                 text.includes('reach out')) &&
                 !href.includes('#') && // Exclude anchor links
                 !href.includes('javascript:'); // Exclude javascript: links
        });
        return contactLinks.length > 0 ? contactLinks[0].href : '';
      });
    } catch (error) {
      console.log('Error finding contact page:', error.message);
    }

    let contactPageInfo = { email: '', twitter: '', linkedin: '', website: '' };
    
    // If contact page found, visit it first
    if (contactPageUrl) {
      console.log('Found contact page:', contactPageUrl);
      try {
        await page.goto(contactPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000);
        
        // Extract from contact page
        contactPageInfo = await extractContactInfoFromPage(page);
        console.log('Contact info from contact page:', contactPageInfo);
        
        // Go back to main page
        await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000);
      } catch (error) {
        console.log('Error processing contact page:', error.message);
      }
    }

    // First extract contact info from the initial page load
    let initialContactInfo = await extractContactInfoFromPage(page);

    // Scroll to bottom in multiple steps to ensure all content loads
    console.log('Scrolling page in steps...');
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const scrollSteps = 4; // Divide scrolling into steps
    for (let i = 1; i <= scrollSteps; i++) {
      await page.evaluate((step, total, steps) => {
        window.scrollTo(0, (step/steps) * total);
      }, i, totalHeight, scrollSteps);
      await delay(1000); // Wait for content to load
    }

    // Wait longer for any lazy-loaded content
    await delay(3000);

    // Extract contact info again after scrolling
    let footerContactInfo = await extractContactInfoFromPage(page);

    // Merge all results, preferring non-empty values in this order:
    // 1. Contact page info
    // 2. Footer info
    // 3. Initial page info
    const mergedContactInfo = {
      email: contactPageInfo.email || footerContactInfo.email || initialContactInfo.email || '',
      twitter: contactPageInfo.twitter || footerContactInfo.twitter || initialContactInfo.twitter || '',
      linkedin: contactPageInfo.linkedin || footerContactInfo.linkedin || initialContactInfo.linkedin || '',
      website: contactPageInfo.website || footerContactInfo.website || initialContactInfo.website || ''
    };

    // If still no email found, try to extract from page source
    if (!mergedContactInfo.email) {
      const pageSource = await page.content();
      const emailMatches = pageSource.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
      if (emailMatches) {
        // Filter and clean email matches
        const validEmails = emailMatches
          .filter(email => {
            return !email.includes('example.com') &&
                   !email.includes('yourdomain.com') &&
                   !email.includes('domain.com') &&
                   email.length < 100; // Basic sanity check
          })
          .map(email => email.trim());
        
        if (validEmails.length > 0) {
          mergedContactInfo.email = validEmails[0];
          console.log('Found email in page source:', mergedContactInfo.email);
        }
      }
    }

    return mergedContactInfo;
  } catch (error) {
    console.error(`Error extracting website contact info: ${error.message}`);
    
    // Try to determine the type of error for better debugging
    let errorType = 'unknown';
    if (error.message.includes('timeout')) {
      errorType = 'timeout';
    } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
      errorType = 'connection_refused';
    } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      errorType = 'dns_error';
    } else if (error.message.includes('net::ERR_ABORTED')) {
      errorType = 'aborted';
    } else if (error.message.includes('net::ERR_CERT_')) {
      errorType = 'ssl_error';
    } else if (error.message.includes('Navigation')) {
      errorType = 'navigation_error';
    }
    
    console.log(`Error type: ${errorType}`);
    
    // Try to take a screenshot of the error state if possible
    try {
      await page.screenshot({ path: `error_${errorType}_${new URL(websiteUrl).hostname}.png` });
    } catch (screenshotError) {
      console.log(`Could not take error screenshot: ${screenshotError.message}`);
    }
    
    return { email: '', twitter: '', linkedin: '', website: '' };
  } finally {
    // Always close the page to free up resources
    await page.close();
  }
}

/**
 * Extract contact info from the current page state
 * @param {Object} page - Puppeteer page object
 * @returns {Object} - Contact information
 */
async function extractContactInfoFromPage(page) {
  // Get the HTML content
  const content = await page.content();
  const $ = cheerio.load(content);
  
  // Initialize contact info
  let email = '';
  let twitter = '';
  let linkedin = '';
  let website = '';
  
  // Look for footer sections
  const footerSelectors = [
    'footer', 
    '[class*="footer"]', 
    '#footer', 
    '.footer', 
    '[id*="footer"]',
    '[class*="Footer"]',
    '.bottom',
    '.contact',
    '.social',
    '[class*="social"]',
    '[class*="contact"]',
    '.links',
    '.connect',
    '.follow-us',
    '.follow',
    '.legal',
    // Additional selectors for common footer patterns
    '[class*="bottom-section"]',
    '[class*="site-info"]',
    '[class*="site-footer"]',
    '[class*="main-footer"]',
    '[class*="page-footer"]',
    '[class*="global-footer"]',
    '[class*="site-bottom"]',
    '[class*="copyright"]',
    '[class*="socials"]',
    '[class*="social-links"]',
    '[class*="social-media"]',
    '[class*="social-icons"]',
    '[class*="contact-info"]',
    '[class*="contact-us"]',
    '[class*="get-in-touch"]',
    // Additional common contact section selectors
    '#contact',
    '.contact-section',
    '.contact-container',
    '.contact-details',
    '.contact-information',
    '.contact-form-container',
    '.contact-wrapper',
    '.contact-block',
    '.contact-area',
    '.contact-content',
    '.contact-box',
    '.contact-card',
    '.contact-panel',
    '.contact-module',
    '.contact-component',
    '.contact-element',
    '.contact-widget',
    '.contact-unit',
    '.contact-segment',
    '.contact-division',
    '.contact-part',
    '.contact-piece',
    '.contact-fragment',
    '.contact-chunk',
    '.contact-slice',
    '.contact-portion',
    '.contact-section',
    '.contact-bit',
    '.contact-item',
    '.contact-entry',
    '.contact-record',
    '.contact-listing',
    '.contact-detail',
    '.contact-info-item',
    '.contact-info-entry',
    '.contact-info-record',
    '.contact-info-listing',
    '.contact-info-detail'
  ];
  
  // First try to find links in the footer
  let socialLinks = [];
  
  footerSelectors.forEach(selector => {
    const footerElement = $(selector);
    if (footerElement.length > 0) {
      console.log(`Found footer element with selector: ${selector}`);
      // Find all links in the footer
      const links = footerElement.find('a');
      links.each((_, link) => {
        socialLinks.push($(link));
      });
    }
  });
  
  // If no links found in footer, look throughout the page
  if (socialLinks.length === 0) {
    console.log('No footer links found, searching entire page');
    const allLinks = $('a');
    allLinks.each((_, link) => {
      socialLinks.push($(link));
    });
  }
  
  console.log(`Found ${socialLinks.length} links to process`);
  
  // Process all links
  for (const link of socialLinks) {
    const href = link.attr('href');
    const text = link.text().toLowerCase();
    const html = link.html() || '';
    
    if (!href) continue;
    
    // Check for email links
    if (href.startsWith('mailto:') && !email) {
      email = href.replace('mailto:', '').trim().split('?')[0]; // Remove any parameters
      console.log(`Found email: ${email}`);
    }
    
    // Check for Twitter/X links
    if ((href.includes('twitter.com') || href.includes('x.com') || 
         text.includes('twitter') || text.includes('x.com') ||
         html.includes('twitter') || html.includes('x-twitter') ||
         html.includes('fa-twitter') || html.includes('icon-twitter') ||
         html.includes('twitter-icon') || html.includes('twitter-logo') ||
         html.includes('twitter.svg') || html.includes('x.svg') ||
         html.includes('x-logo') || html.includes('x-icon')) && !twitter) {
      twitter = extractSocialHandle(href, ['twitter.com', 'x.com']);
      console.log(`Found Twitter: ${twitter}`);
    }
    
    // Check for LinkedIn links
    if ((href.includes('linkedin.com') || text.includes('linkedin') ||
         html.includes('linkedin') || html.includes('fa-linkedin') ||
         html.includes('icon-linkedin') || html.includes('linkedin-icon') ||
         html.includes('linkedin-logo') || html.includes('linkedin.svg')) && !linkedin) {
      linkedin = href;
      console.log(`Found LinkedIn: ${linkedin}`);
    }
    
    // Check for other website links that might be contact pages
    if ((href.includes('/contact') || 
         href.includes('/about') || 
         href.includes('/support') || 
         href.includes('/help') || 
         text.includes('contact') || 
         text.includes('get in touch') || 
         text.includes('reach out') || 
         text.includes('support')) && !website) {
      // Make sure it's a full URL
      if (href.startsWith('http')) {
        website = href;
      } else if (href.startsWith('/')) {
        // Relative URL, convert to absolute
        try {
          const urlObj = new URL(page.url());
          website = `${urlObj.origin}${href}`;
        } catch (error) {
          console.error(`Error creating absolute URL: ${error.message}`);
          website = href; // Use the relative URL as fallback
        }
      }
      console.log(`Found contact page: ${website}`);
    }
  }
  
  // Enhanced email extraction
  if (!email) {
    console.log('Looking for email with enhanced extraction...');
    
    // Use JavaScript to find emails in various page elements
    const jsEmails = await page.evaluate(() => {
      const emails = new Set();
      
      // Helper function to extract email from text
      const extractEmailFromText = (text) => {
        const matches = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
        if (matches) {
          matches.forEach(email => emails.add(email.toLowerCase()));
        }
      };

      // Helper to check if element is visible
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
      };

      // 1. Check footer elements first
      const footerElements = document.querySelectorAll('footer, [class*="footer"], [id*="footer"]');
      footerElements.forEach(footer => {
        if (isVisible(footer)) {
          extractEmailFromText(footer.textContent);
        }
      });

      // 2. Check contact sections
      const contactSelectors = [
        '[class*="contact"]',
        '[id*="contact"]',
        '[class*="email"]',
        '[id*="email"]',
        '.address',
        '.info',
        '.reach-us',
        '.get-in-touch',
        '[class*="support"]',
        '[class*="help"]'
      ];
      
      contactSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (isVisible(element)) {
            extractEmailFromText(element.textContent);
          }
        });
      });

      // 3. Check data attributes
      document.querySelectorAll('[data-email], [data-mail], [data-contact]').forEach(element => {
        const dataEmail = element.getAttribute('data-email') || 
                         element.getAttribute('data-mail') ||
                         element.getAttribute('data-contact');
        if (dataEmail) {
          extractEmailFromText(dataEmail);
        }
      });

      // 4. Check elements with common email-related text
      const emailKeywords = ['email', 'mail', 'contact', 'support', 'info', 'help'];
      
      // Get all text-containing elements instead of using the invalid :contains selector
      const allElements = document.querySelectorAll('a, p, span, div, h1, h2, h3, h4, h5, h6, label, button');
      emailKeywords.forEach(keyword => {
        allElements.forEach(element => {
          if (isVisible(element) && element.textContent.toLowerCase().includes(keyword)) {
            extractEmailFromText(element.textContent);
          }
        });
      });

      // 5. Check for obfuscated emails in scripts
      document.querySelectorAll('script').forEach(script => {
        const content = script.textContent;
        if (content && (content.includes('@') || content.includes('mailto:'))) {
          extractEmailFromText(content);
        }
      });

      // 6. Check meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const content = meta.getAttribute('content');
        if (content) {
          extractEmailFromText(content);
        }
      });

      // Filter and prioritize emails
      return Array.from(emails).filter(email => {
        return !email.includes('example.com') &&
               !email.includes('yourdomain.com') &&
               !email.includes('domain.com') &&
               !email.includes('test@') &&
               !email.includes('user@') &&
               !email.includes('email@') &&
               email.length < 100;
      });
    });

    if (jsEmails && jsEmails.length > 0) {
      // Prioritize business emails over generic ones
      const businessEmails = jsEmails.filter(email =>
        !email.includes('gmail.com') &&
        !email.includes('yahoo.com') &&
        !email.includes('hotmail.com') &&
        !email.includes('outlook.com') &&
        !email.includes('icloud.com') &&
        !email.includes('aol.com') &&
        !email.includes('protonmail.com') &&
        !email.includes('mail.com')
      );

      if (businessEmails.length > 0) {
        // Further prioritize common business email patterns
        const priorityEmails = businessEmails.filter(email =>
          email.startsWith('contact@') ||
          email.startsWith('info@') ||
          email.startsWith('hello@') ||
          email.startsWith('support@') ||
          email.startsWith('help@') ||
          email.startsWith('sales@') ||
          email.startsWith('business@') ||
          email.startsWith('team@')
        );

        email = priorityEmails.length > 0 ? priorityEmails[0] : businessEmails[0];
        console.log('Found business email:', email);
      } else {
        email = jsEmails[0];
        console.log('Found generic email:', email);
      }
    }
  }
  
  // Try to find social media links by looking for SVG icons or common classes
  if (!twitter || !linkedin) {
    console.log('Looking for social media icons...');
    
    // Use page.evaluate to find social media icons
    const iconSocialInfo = await page.evaluate(() => {
      const result = { twitter: '', linkedin: '' };
      
      // Look for elements that might contain social media icons
      const potentialSocialElements = Array.from(document.querySelectorAll('a, button, div, span, i'));
      
      for (const element of potentialSocialElements) {
        const html = element.outerHTML.toLowerCase();
        const href = element.getAttribute('href') || '';
        const className = element.className || '';
        
        // Check for Twitter/X
        if (!result.twitter && 
            (html.includes('twitter') || 
             html.includes('x-twitter') || 
             html.includes('fa-twitter') || 
             html.includes('icon-twitter') ||
             html.includes('twitter-icon') ||
             html.includes('twitter-logo') ||
             html.includes('twitter.svg') ||
             html.includes('x.svg') ||
             html.includes('x-logo') ||
             html.includes('x-icon') ||
             className.includes('twitter') ||
             className.includes('x-twitter') ||
             href.includes('twitter.com') ||
             href.includes('x.com'))) {
          
          if (element.tagName === 'A' && element.href) {
            result.twitter = element.href;
          } else {
            // Try to find parent or child link
            const parentLink = element.closest('a');
            const childLink = element.querySelector('a');
            
            if (parentLink && parentLink.href) {
              result.twitter = parentLink.href;
            } else if (childLink && childLink.href) {
              result.twitter = childLink.href;
            }
          }
        }
        
        // Check for LinkedIn
        if (!result.linkedin && 
            (html.includes('linkedin') || 
             html.includes('fa-linkedin') || 
             html.includes('icon-linkedin') ||
             html.includes('linkedin-icon') ||
             html.includes('linkedin-logo') ||
             html.includes('linkedin.svg') ||
             className.includes('linkedin') ||
             href.includes('linkedin.com'))) {
          
          if (element.tagName === 'A' && element.href) {
            result.linkedin = element.href;
          } else {
            // Try to find parent or child link
            const parentLink = element.closest('a');
            const childLink = element.querySelector('a');
            
            if (parentLink && parentLink.href) {
              result.linkedin = parentLink.href;
            } else if (childLink && childLink.href) {
              result.linkedin = childLink.href;
            }
          }
        }
      }
      
      return result;
    });
    
    // Update social info with icon results
    if (iconSocialInfo.twitter && !twitter) {
      twitter = extractSocialHandle(iconSocialInfo.twitter, ['twitter.com', 'x.com']);
      console.log(`Found Twitter from icon: ${twitter}`);
    }
    
    if (iconSocialInfo.linkedin && !linkedin) {
      linkedin = iconSocialInfo.linkedin;
      console.log(`Found LinkedIn from icon: ${linkedin}`);
    }
  }
  
  // If still no contact info found, try using JavaScript to extract from the page
  if (!email && !twitter && !linkedin && !website) {
    console.log('No contact info found with HTML parsing, trying JavaScript extraction...');
    
    // Use page.evaluate to find contact info
    const jsContactInfo = await page.evaluate(() => {
      const result = { email: '', twitter: '', linkedin: '', website: '' };
      
      // Look for email addresses in the page
      const emailRegex = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)\b/gi;
      const pageText = document.body.innerText;
      const emailMatches = pageText.match(emailRegex);
      
      if (emailMatches && emailMatches.length > 0) {
        result.email = emailMatches[0];
      }
      
      // Look for social links
      const links = Array.from(document.querySelectorAll('a[href]'));
      
      for (const link of links) {
        const href = link.href.toLowerCase();
        
        if (href.includes('twitter.com') || href.includes('x.com')) {
          result.twitter = href;
        } else if (href.includes('linkedin.com')) {
          result.linkedin = href;
        } else if (href.includes('contact') || link.innerText.toLowerCase().includes('contact')) {
          result.website = href;
        }
      }
      
      // Try to extract email from data attributes
      const elementsWithDataEmail = document.querySelectorAll('[data-email], [data-mail]');
      for (const element of elementsWithDataEmail) {
        const dataEmail = element.getAttribute('data-email') || element.getAttribute('data-mail');
        if (dataEmail && dataEmail.includes('@') && !result.email) {
          result.email = dataEmail;
          break;
        }
      }
      
      return result;
    });
    
    // Update contact info with JavaScript results
    if (jsContactInfo.email && !email) {
      email = jsContactInfo.email;
      console.log(`Found email with JavaScript: ${email}`);
    }
    
    if (jsContactInfo.twitter && !twitter) {
      twitter = extractSocialHandle(jsContactInfo.twitter, ['twitter.com', 'x.com']);
      console.log(`Found Twitter with JavaScript: ${twitter}`);
    }
    
    if (jsContactInfo.linkedin && !linkedin) {
      linkedin = jsContactInfo.linkedin;
      console.log(`Found LinkedIn with JavaScript: ${linkedin}`);
    }
    
    if (jsContactInfo.website && !website) {
      website = jsContactInfo.website;
      console.log(`Found contact page with JavaScript: ${website}`);
    }
  }
  
  // Try one more approach - look for common patterns in the DOM
  if (!email || !twitter || !linkedin) {
    console.log('Trying additional DOM patterns for contact info...');
    
    const domContactInfo = await page.evaluate(() => {
      const result = { email: '', twitter: '', linkedin: '' };
      
      // Check for obfuscated emails (common technique to avoid scrapers)
      const scriptTags = document.querySelectorAll('script');
      for (const script of scriptTags) {
        const content = script.textContent || '';
        if (content.includes('mailto:') || content.includes('@')) {
          const emailMatch = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
          if (emailMatch && emailMatch[1] && !result.email) {
            result.email = emailMatch[1];
            break;
          }
        }
      }
      
      // Look for social media in list items (common pattern in footers)
      const listItems = document.querySelectorAll('li');
      for (const item of listItems) {
        const text = item.textContent.toLowerCase();
        const html = item.innerHTML.toLowerCase();
        
        // Check for links inside the list item
        const link = item.querySelector('a');
        if (link && link.href) {
          if ((text.includes('twitter') || html.includes('twitter') || 
               link.href.includes('twitter.com') || link.href.includes('x.com')) && 
              !result.twitter) {
            result.twitter = link.href;
          } else if ((text.includes('linkedin') || html.includes('linkedin') || 
                     link.href.includes('linkedin.com')) && 
                    !result.linkedin) {
            result.linkedin = link.href;
          }
        }
      }
      
      return result;
    });
    
    // Update with DOM pattern results
    if (domContactInfo.email && !email) {
      email = domContactInfo.email;
      console.log(`Found email from DOM patterns: ${email}`);
    }
    
    if (domContactInfo.twitter && !twitter) {
      twitter = extractSocialHandle(domContactInfo.twitter, ['twitter.com', 'x.com']);
      console.log(`Found Twitter from DOM patterns: ${twitter}`);
    }
    
    if (domContactInfo.linkedin && !linkedin) {
      linkedin = domContactInfo.linkedin;
      console.log(`Found LinkedIn from DOM patterns: ${linkedin}`);
    }
  }
  
  // Try to extract email from the domain if we have a website URL
  if (!email && page.url()) {
    try {
      const urlObj = new URL(page.url());
      const domain = urlObj.hostname.replace('www.', '');
      
      // Common email patterns
      const commonEmails = [
        `info@${domain}`,
        `contact@${domain}`,
        `hello@${domain}`,
        `support@${domain}`
      ];
      
      console.log(`Trying common email patterns for domain ${domain}`);
      
      // Check if any of these emails are mentioned on the page
      const pageText = await page.evaluate(() => document.body.innerText);
      for (const potentialEmail of commonEmails) {
        if (pageText.includes(potentialEmail)) {
          email = potentialEmail;
          console.log(`Found common email pattern: ${email}`);
          break;
        }
      }
    } catch (error) {
      console.error(`Error extracting email from domain: ${error.message}`);
    }
  }
  
  if (!website) {
    console.log('Looking for website URL in page content...');
    
    // Try to find the actual product website using more precise methods
    website = await page.evaluate(() => {
      // Method 1: Look for official website link in the page header
      const headerLinks = Array.from(document.querySelectorAll('header a')).filter(a => {
        const text = a.textContent.toLowerCase();
        return text.includes('website') || text.includes('visit site');
      });
      
      // Method 2: Look for canonical link
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      
      // Method 3: Look for Open Graph URL
      const ogUrl = document.querySelector('meta[property="og:url"]');

      // Method 4: Look for official domain in meta tags
      const metaUrl = document.querySelector('meta[name="url"], meta[name="site"]');

      return headerLinks[0]?.href || 
             canonicalLink?.href || 
             ogUrl?.content ||
             metaUrl?.content ||
             '';
    });

    // Fallback: Use domain from page URL if no other found
    if (!website && page.url()) {
      try {
        const urlObj = new URL(page.url());
        website = urlObj.origin;
      } catch (error) {
        console.log('Error creating URL from origin:', error.message);
      }
    }
  }
  
  // Validate the website URL to prevent common false positives
  if (website) {
    // Create a list of known false positives
    const falsePositives = [
      'bebop.ai',
      'lu.ma', 
      'twitter.com', 
      'x.com', 
      'linkedin.com',
      'facebook.com'
    ];
    
    // Check if the website seems like a false positive
    const lowercaseWebsite = website.toLowerCase();
    const isFalsePositive = falsePositives.some(fp => lowercaseWebsite.includes(fp));
    
    if (isFalsePositive) {
      console.log(`Detected likely false positive website URL: ${website}`);
      
      // Only keep if there's strong evidence it's the actual website
      const isActualWebsite = await page.evaluate((suspectDomain) => {
        // Count mentions of the domain in prominent elements
        const headerElements = document.querySelectorAll('header, nav, .header, .navbar, .navigation');
        let prominentMentions = 0;
        
        headerElements.forEach(el => {
          if (el.innerHTML.toLowerCase().includes(suspectDomain)) {
            prominentMentions++;
          }
        });
        
        // Check if it appears in a prominent link
        const prominentLinks = Array.from(document.querySelectorAll('a[href*="' + suspectDomain + '"]'))
          .filter(a => {
            const rect = a.getBoundingClientRect();
            return rect.top < 500; // In the top part of the page
          });
        
        return prominentMentions >= 2 || prominentLinks.length >= 2;
      }, falsePositives.find(fp => lowercaseWebsite.includes(fp)));
      
      if (!isActualWebsite) {
        console.log('Rejected false positive website URL');
        website = '';
      }
    }
  }
  
  return { email, twitter, linkedin, website };
}

/**
 * Extract social media handle from URL
 * @param {string} url - Social media URL
 * @param {Array} domains - Array of domains to check
 * @returns {string} - Social media handle or full URL if handle can't be extracted
 */
function extractSocialHandle(url, domains) {
  if (!url) return '';
  
  // Check if URL contains any of the domains
  const containsDomain = domains.some(domain => url.includes(domain));
  if (!containsDomain) return url;
  
  // Remove any query parameters or fragments
  url = url.split('?')[0].split('#')[0];
  
  // Remove trailing slash if present
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  
  // Extract the handle (last part of the URL)
  const parts = url.split('/');
  const handle = parts[parts.length - 1];
  
  // Validate that it looks like a social media handle
  if (handle && !handle.includes('.') && 
      !domains.some(domain => handle === domain)) {
    return handle;
  }
  
  return url;
}

module.exports = {
  extractWebsiteContactInfo
}; // Updated version - Tue Mar 18 11:38:42 IST 2025
