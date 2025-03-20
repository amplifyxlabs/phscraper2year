// Utility functions for the Product Hunt scraper

/**
 * Delay execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Promise that resolves after the delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Generate a random delay between min and max milliseconds
 * @param {number} min - Minimum delay in milliseconds or base delay if max is not provided
 * @param {number} max - Maximum delay in milliseconds
 * @returns {number} - Random delay in milliseconds
 */
function randomDelay(min, max) {
  // If only one parameter is provided, use it as the base value
  // and generate a random delay between 80% and 120% of that value
  if (max === undefined) {
    const baseDelay = min;
    min = Math.floor(baseDelay * 0.8);
    max = Math.floor(baseDelay * 1.2);
  }
  
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Clean text by removing extra whitespace
 * @param {string} text - Text to clean
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Validate a URL
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extracts date from a Product Hunt leaderboard URL
 * @param {string} url - URL in format https://www.producthunt.com/leaderboard/daily/YYYY/M/D/all
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
function extractDateFromUrl(url) {
  try {
    // Default value in case extraction fails
    const defaultDate = '';
    
    if (!url || !isValidUrl(url)) return defaultDate;
    
    // Extract date components using regex
    const datePattern = /\/leaderboard\/daily\/([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})\/all/;
    const match = url.match(datePattern);
    
    if (match && match.length === 4) {
      const year = match[1];
      // Ensure month and day are padded with leading zeros if needed
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      
      // Return a formatted date string
      return `${year}-${month}-${day}`;
    }
    
    return defaultDate;
  } catch (error) {
    console.error(`Error extracting date from URL: ${error.message}`);
    return '';
  }
}

module.exports = {
  delay,
  formatDate,
  randomDelay,
  cleanText,
  isValidUrl,
  extractDateFromUrl
}; 