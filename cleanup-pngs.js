const fs = require('fs');
const path = require('path');

// Get all files in the current directory
const files = fs.readdirSync(__dirname);

// Filter for PNG files
const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));

console.log(`Found ${pngFiles.length} PNG files to delete.`);

// Delete each PNG file
let deletedCount = 0;
let totalSize = 0;

for (const file of pngFiles) {
    try {
        const filePath = path.join(__dirname, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`Deleted: ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
        console.error(`Error deleting ${file}: ${error.message}`);
    }
}

console.log(`Successfully deleted ${deletedCount} PNG files.`);
console.log(`Total space freed: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
