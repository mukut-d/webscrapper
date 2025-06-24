const gm = require('gm').subClass({ imageMagick: true });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { uploadFileToS3 } = require('./s3util');

//I have given Downloads folder's path here, should be changed as per need.
const DOWNLOADS_PATH = path.join(require('os').homedir(), 'Downloads');
// Structure of file expected
// Column A - some id, column B - some other ID, column C - list of comma separated images inside a curly braces
const CSV_FILE_PATH = path.join(DOWNLOADS_PATH, 'FILE_NAME');
const OUTPUT_FOLDER_PATH = path.join(DOWNLOADS_PATH, 'changedImages');
const SUCCESS_CSV_PATH = path.join(DOWNLOADS_PATH, 'success.csv');
const FAILURE_CSV_PATH = path.join(DOWNLOADS_PATH, 'failure.csv');
const RETRY_LIMIT = 3;
const BATCH_SIZE = 10;

if (!fs.existsSync(OUTPUT_FOLDER_PATH)) {
    fs.mkdirSync(OUTPUT_FOLDER_PATH);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(imageUrl, retries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 2000 // Optional: Set a timeout for the request
            });

            if (!response.data || response.data.length === 0) {
                throw new Error(`Failed to download image: ${imageUrl}`);
            }

            return Buffer.from(response.data);
        } catch (error) {
            console.error(`Error downloading ${imageUrl} (Attempt ${attempt}/${retries}):`, error);

            if (attempt < retries) {
                await delay(delayMs);
                delayMs *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }
}

function extractImageName(url) {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/');
    const index = pathSegments.indexOf('z');
    if (index !== -1 && index + 1 < pathSegments.length) {
        const name = pathSegments[index + 1];
        const extension = pathSegments[pathSegments.length - 1].split('.').pop().split('?')[0];
        return `${name}.${extension}`;
    }
    return null; // or handle the case where the format is unexpected
}

function saveSuccessEntry(row) {
    const csv = Papa.unparse([row], { header: false });
    fs.appendFileSync(SUCCESS_CSV_PATH, csv + '\n');
}

function saveFailureEntry(row) {
    const csv = Papa.unparse([row], { header: false });
    fs.appendFileSync(FAILURE_CSV_PATH, csv + '\n');
}

async function processImages(columnA, columnB, columnC, rowIndex) {
    const imageLinks = columnC.slice(1, -1).split(',');

    for (let i = 0; i < imageLinks.length; i++) {
        const imageUrl = imageLinks[i].trim();
        const imageName = extractImageName(imageUrl);
        const tempImagePath = path.join(DOWNLOADS_PATH, `temp-${rowIndex}-${i + 1}.png`);

        let retries = 0;
        while (retries < RETRY_LIMIT) {
            try {
                const imageBuffer = await downloadImage(imageUrl);

                if (!imageBuffer) {
                    throw new Error(`Failed to download or invalid image: ${imageUrl}`);
                }

                fs.writeFileSync(tempImagePath, imageBuffer);

                await new Promise((resolve, reject) => {
                    gm(tempImagePath)
                        .fuzz(10, true) // Add fuzz factor to handle slight color variations
                        .transparent('white') // Make white areas transparent
                        .background('rgb(235,235,235, 1)') // Set background color to RGB (252, 252, 252)
                        .flatten() // Flatten layers
                        .write(tempImagePath, async (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                try {
                                    const s3Url = await uploadFileToS3(tempImagePath, imageName);
                                    console.log(`Processed and uploaded: ${s3Url}`);
                                    saveSuccessEntry({ columnA, columnB, imageUrl, s3Url, rowIndex });
                                    resolve();
                                } catch (uploadErr) {
                                    reject(uploadErr);
                                }
                            }
                        });
                });

                break; // Break the retry loop if successful
            } catch (error) {
                retries++;
                console.error(`Error processing ${imageUrl} (Attempt ${retries}/${RETRY_LIMIT}):`, error);
                if (retries >= RETRY_LIMIT) {
                    console.error(`Failed to process ${imageUrl} after ${RETRY_LIMIT} attempts`);
                    saveFailureEntry({ imageUrl, rowIndex });
                }
            } finally {
                if (fs.existsSync(tempImagePath)) {
                    fs.unlinkSync(tempImagePath);
                }
            }
        }

        // await delay(10000); // Wait for 10 seconds before processing the next image
    }
}

async function processBatch(rows, startIndex) {
    for (const [index, row] of rows.entries()) {
        const rowIndex = startIndex + index + 1; // Calculate the correct row index
        if (row.length === 3) {
            const [columnA, columnB, columnC] = row;
            console.log(`Processing row ${rowIndex}:`, { columnA, columnB, columnC });
            await processImages(columnA.trim(), columnB.trim(), columnC.trim(), rowIndex);
        } else {
            console.error('Incorrect number of columns in row:', row);
        }
    }
}

fs.readFile(CSV_FILE_PATH, 'utf8', async (err, data) => {
    if (err) {
        console.error('Error reading the CSV file:', err);
        return;
    }

    const parsedData = Papa.parse(data, {
        delimiter: ',',
        quoteChar: '"',
        skipEmptyLines: true
    });

    const rows = parsedData.data;
    console.log('Parsed CSV Data:', rows);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        await processBatch(batch, i).catch(console.error);
    }

    console.log('CSV file successfully processed');
});