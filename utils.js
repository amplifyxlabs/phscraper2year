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

module.exports = {
  delay,
  formatDate,
  randomDelay,
  cleanText,
  isValidUrl
}; 