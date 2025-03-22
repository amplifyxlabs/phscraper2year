const fs = require('fs');
const path = require('path');

// Get all files in the current directory
const files = fs.readdirSync(__dirname);

// Filter for PNG files
const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));

console.log(`Found ${pngFiles.length} PNG files to delete.`);

// Delete each PNG file
let deletedCount = 0;
for (const file of pngFiles) {
    try {
        fs.unlinkSync(path.join(__dirname, file));
        deletedCount++;
        console.log(`Deleted: ${file}`);
    } catch (error) {
        console.error(`Error deleting ${file}: ${error.message}`);
    }
}

console.log(`Successfully deleted ${deletedCount} PNG files.`);
