const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables
dotenv.config();

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The ID of your Google Sheets document. You need to create this manually and add to .env
// GOOGLE_SHEET_ID=your-sheet-id-here

// Reoon API key for email verification
const REOON_API_KEY = 'r4xRoRT0EP97NQPZNt6kK1KEsKYG10ig';

// Instantly API configuration
const INSTANTLY_CONFIG = {
  // V2 API uses Bearer token authentication
  apiToken: process.env.INSTANTLY_API_TOKEN || 'NzBhMzU2NmQtZmJmZS00Zjc4LWE2YWYtODZiNTY5YTVmOTNkOlFoVkpCbVZpTWVUcQ==',
  campaignId: process.env.INSTANTLY_CAMPAIGN_ID || '0d3661c1-7074-42ae-aa92-2fefe713ba3d',
  apiUrl: 'https://api.instantly.ai/api/v2/leads' // V2 API endpoint
};

// Function to verify email using Reoon API
async function verifyEmail(email) {
  try {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return {
        isValid: false,
        message: 'Invalid email format'
      };
    }

    console.log(`Verifying email: ${email}`);
    const response = await axios.get(
      `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${REOON_API_KEY}&mode=quick`
    );

    const data = response.data;
    
    // Check if email is valid based on the Reoon API response
    const isValid = data.status === 'valid';
    
    return {
      isValid,
      data: data,
      message: isValid ? 'Valid email' : `Invalid email: ${data.status}`
    };
  } catch (error) {
    console.error(`Error verifying email ${email}:`, error.message);
    return {
      isValid: false,
      message: `Error verifying: ${error.message}`
    };
  }
}

// Function to parse CSV
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(header => header.trim());
  
  const data = [headers];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle commas within quoted fields
    const values = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    values.push(currentValue);
    data.push(values);
  }
  
  return data;
}

// Function to append data to Google Sheets
async function appendToSheet(auth, sheetId, values, sheetName = 'Data') {
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    // Check if the spreadsheet exists
    await sheets.spreadsheets.get({
      spreadsheetId: sheetId
    });
    
    // Get the current row count to know where to add a date separator
    let rowCount = 0;
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!A:A`,
      });
      
      rowCount = response.data.values ? response.data.values.length : 0;
    } catch (err) {
      // Sheet might not exist yet, create it
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        }
      });
    }
    
    // Add a date separator row if there's existing data
    if (rowCount > 0) {
      // Get date from first data row (skipping headers)
      const today = new Date().toISOString().split('T')[0];
      
      // First, append a separator row with the date
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${sheetName}!A${rowCount + 1}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [[`--- Data for ${today} ---`]]
        }
      });
      
      // Then append the actual data
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${sheetName}!A${rowCount + 2}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      });
      
      console.log(`${response.data.updates.updatedCells} cells updated in Google Sheets.`);
      return response;
    } else {
      // No data yet, just append directly
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      });
      
      console.log(`${response.data.updates.updatedCells} cells updated in Google Sheets.`);
      return response;
    }
  } catch (err) {
    console.error('Error appending data to sheet:', err.message);
    throw err;
  }
}

// Function to push data to Instantly using API V2
async function pushToInstantly(rowData) {
  // Validate input
  if (!rowData) {
    console.log('No row data provided to pushToInstantly');
    return false;
  }

  console.log('Received row data in pushToInstantly: ' + JSON.stringify(rowData));

  try {
    // Extract email, first name, and website directly from the provided object
    const email = rowData.email;
    const firstName = rowData.first_name || '';
    const website = rowData.website || '';

    if (!email) {
      throw new Error('Email not provided to pushToInstantly');
    }

    // Prepare the lead data for V2 API
    // V2 API uses snake_case for field names
    const payload = {
      email: email,
      first_name: firstName, // Using product name as first_name
      campaign: INSTANTLY_CONFIG.campaignId,
      contact_name: firstName, // Product name as contact info
      company_name: website, // Use company_name field for website URL to make it visible
      website: website, // Also include as website field
      payload: {
        // Custom variables are now in the payload field
        source: 'Product Hunt',
        website: website,
        product_name: firstName,
        product_url: website
      }
    };

    console.log('Created lead payload for V2 API: ' + JSON.stringify(payload));

    const options = {
      method: 'post',
      url: INSTANTLY_CONFIG.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INSTANTLY_CONFIG.apiToken}` // V2 uses Bearer token auth
      },
      data: payload
    };

    const response = await axios(options);
    console.log('Instantly API V2 Response:', response.status, response.data);

    return response.status === 200 || response.status === 201;
  } catch (error) {
    console.error('Error in pushToInstantly with V2 API:', error.message);
    if (error.response) {
      console.error('API Error Details:', error.response.data);
    }
    return false;
  }
}

// Function to find email columns in data
function findEmailColumns(headers) {
  const emailColumns = [];
  
  // Look for common email field names
  const emailFieldNames = ['email', 'e-mail', 'mail', 'contact email', 'maker email', 'user email'];
  
  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase();
    if (emailFieldNames.some(field => headerLower.includes(field))) {
      emailColumns.push(index);
    }
  });
  
  return emailColumns;
}

// Function to verify and add status column (no filtering)
async function verifyAndFilterData(data) {
  if (!data || data.length < 2) {
    return data; // No data or just headers
  }
  
  const headers = data[0];
  const emailColumns = findEmailColumns(headers);
  
  if (emailColumns.length === 0) {
    console.log('No email columns found in the data');
    return data; // No email columns found
  }
  
  console.log(`Found ${emailColumns.length} email columns at indices: ${emailColumns.join(', ')}`);
  
  // Add email verification status columns if they don't exist
  headers.push('Email Verification Status');
  headers.push('Instantly Status');
  
  const processedData = [headers]; // Start with headers
  
  // Process each row (skipping header)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowWithVerification = [...row];
    
    let emailStatus = 'No Email';
    let instantlyStatus = 'Not Sent';
    let validEmail = null;
    
    // Check each email column in the row
    for (const colIndex of emailColumns) {
      if (colIndex >= row.length) continue;
      
      const email = row[colIndex];
      
      if (email && email.trim()) {
        const verificationResult = await verifyEmail(email.trim());
        
        if (verificationResult.isValid) {
          emailStatus = 'Valid';
          validEmail = email.trim();
          break; // Found a valid email, no need to check others
        } else {
          emailStatus = 'Invalid';
          console.log(`Invalid email in row ${i}: ${email} - ${verificationResult.message}`);
        }
      }
    }
    
    // If we have a valid email, push to Instantly
    if (emailStatus === 'Valid' && validEmail) {
      // Find the product name column
      const productNameColumnIndex = headers.findIndex(header => 
        header.toLowerCase().includes('product name') || 
        header.toLowerCase().includes('name') && !header.toLowerCase().includes('first'));
      
      // Find the product website column
      const productWebsiteColumnIndex = headers.findIndex(header => 
        header.toLowerCase().includes('product website') || 
        header.toLowerCase().includes('website'));
      
      // Push to Instantly
      const pushResult = await pushToInstantly({
        email: validEmail,
        first_name: productNameColumnIndex !== -1 && row[productNameColumnIndex] ? row[productNameColumnIndex] : '',
        website: productWebsiteColumnIndex !== -1 && row[productWebsiteColumnIndex] ? row[productWebsiteColumnIndex] : ''
      });
      
      instantlyStatus = pushResult ? 'Sent' : 'Failed';
      console.log(`Instantly push for row ${i}: ${instantlyStatus}`);
    }
    
    // Add verification status and include all rows
    rowWithVerification.push(emailStatus);
    rowWithVerification.push(instantlyStatus);
    processedData.push(rowWithVerification);
  }
  
  console.log(`Processed all ${data.length} rows (including header)`);
  return processedData;
}

// Main function
async function uploadCSVToGoogleSheets(csvFilePath) {
  try {
    // Get the Google Sheet ID from environment variables
    const googleSheetId = process.env.GOOGLE_SHEET_ID;
    if (!googleSheetId) {
      throw new Error('GOOGLE_SHEET_ID not found in environment variables');
    }
    
    // Check if credential file exists
    const credentialsPath = path.join(__dirname, 'google-credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      throw new Error('google-credentials.json not found. Please create this file with your Google API credentials.');
    }
    
    // Read the file and extract the date from filename
    console.log(`Reading CSV file: ${csvFilePath}`);
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    
    // Parse the CSV content
    const data = parseCSV(csvContent);
    
    // Verify emails and filter data
    console.log('Verifying emails and filtering data...');
    const verifiedData = await verifyAndFilterData(data);
    
    if (verifiedData.length <= 1) {
      console.log('No valid data rows after email verification. Skipping upload.');
      return false;
    }
    
    // Extract date from filename (used for logging only)
    const filenameMatch = path.basename(csvFilePath).match(/product_hunt_data_(\d{4}-\d{2}-\d{2})\.csv/);
    const fileDate = filenameMatch ? filenameMatch[1] : new Date().toISOString().split('T')[0];
    
    // Create auth client
    const auth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: SCOPES,
    });
    
    // Upload to Google Sheets
    console.log(`Uploading verified data to Google Sheets for date: ${fileDate}...`);
    await appendToSheet(auth, googleSheetId, verifiedData);
    
    console.log(`Successfully uploaded verified data from ${csvFilePath} to Google Sheets!`);
    return true;
  } catch (error) {
    console.error(`Error uploading CSV to Google Sheets: ${error.message}`);
    return false;
  }
}

// If script is run directly, process command line arguments
if (require.main === module) {
  const csvFilePath = process.argv[2];
  
  if (!csvFilePath) {
    console.log('Usage: node google-sheets-exporter.js <path-to-csv-file>');
    process.exit(1);
  }
  
  uploadCSVToGoogleSheets(csvFilePath)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
} else {
  // Export for use in other scripts
  module.exports = { uploadCSVToGoogleSheets }; 
}