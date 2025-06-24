const axios = require('axios');
const xlsx = require('xlsx');

async function processFile(fileUrl) {
  try {
    // Download the file from the URL
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // Process the file using xlsx (works for both Excel and CSV)
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const report = xlsx.utils.sheet_to_json(worksheet, { rawNumbers: true });

    return report;
  } catch (error) {
    console.error('Error processing file:', error);
  }
}

module.exports = processFile;
