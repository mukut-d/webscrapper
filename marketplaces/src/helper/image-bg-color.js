const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { uploadFileToS3 } = require('./s3util');
const { v4: uuidv4 } = require('uuid');

const DOWNLOADS_PATH = path.join(require('os').homedir(), 'Downloads');
const RETRY_LIMIT = 3;

// Utility function for delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Download image function with retries
async function downloadImage(imageUrl, retries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 2000,
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error(`Error downloading ${imageUrl} (Attempt ${attempt}/${retries}):`, error);
            if (attempt < retries) await delay(delayMs);
            delayMs *= 2;
        }
    }
    throw new Error(`Failed to download image: ${imageUrl}`);
}

// Main image processing function using Sharp
async function processImages(imageLinks) {
    const s3Urls = [];

    for (let i = 0; i < imageLinks.length; i++) {
        const imageUrl = imageLinks[i].trim();
        const imageName = `${uuidv4()}.png`; // Unique name for S3
        const tempImagePath = path.join(DOWNLOADS_PATH, imageName);
        const tempProcessedImagePath = path.join(DOWNLOADS_PATH, `processed_${imageName}`); // New file for processed image

        let retries = 0;
        while (retries < RETRY_LIMIT) {
            try {
                const imageBuffer = await downloadImage(imageUrl);
                fs.writeFileSync(tempImagePath, imageBuffer);

                // Process the image using Sharp and save to a different file
                await sharp(tempImagePath)
                    .ensureAlpha() // Ensure alpha channel for transparency
                    .flatten({ background: { r: 248, g: 248, b: 248 } }) // Set the background color to off-white (RGB)
                    .toFile(tempProcessedImagePath); // Save processed image to a different path

                // Upload the processed image to S3 and collect the URL
                const s3Url = await uploadFileToS3(tempProcessedImagePath, imageName);
                s3Urls.push(s3Url);
                break; // Exit retry loop on success
            } catch (error) {
                retries++;
                console.error(`Error processing ${imageUrl} (Attempt ${retries}/${RETRY_LIMIT}):`, error);
                if (retries >= RETRY_LIMIT) console.error(`Failed after ${RETRY_LIMIT} attempts`);
            } finally {
                // Clean up temporary files
                if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
                if (fs.existsSync(tempProcessedImagePath)) fs.unlinkSync(tempProcessedImagePath);
            }
        }
    }
    return s3Urls;
}

module.exports = { processImages };




// const gm = require('gm').subClass({ imageMagick: true });
// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const { uploadFileToS3 } = require('./s3util');
// const { v4: uuidv4 } = require('uuid');

// const DOWNLOADS_PATH = path.join(require('os').homedir(), 'Downloads');
// const RETRY_LIMIT = 3;

// function delay(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// async function downloadImage(imageUrl, retries = 3, delayMs = 1000) {
//     for (let attempt = 1; attempt <= retries; attempt++) {
//         try {
//             const response = await axios({
//                 url: imageUrl,
//                 responseType: 'arraybuffer',
//                 timeout: 2000,
//             });
//             return Buffer.from(response.data);
//         } catch (error) {
//             console.error(`Error downloading ${imageUrl} (Attempt ${attempt}/${retries}):`, error);
//             if (attempt < retries) await delay(delayMs);
//             delayMs *= 2;
//         }
//     }
//     throw new Error(`Failed to download image: ${imageUrl}`);
// }

// async function processImages(imageLinks) {
//     const s3Urls = [];

//     for (let i = 0; i < imageLinks.length; i++) {
//         const imageUrl = imageLinks[i].trim();
//         const imageName = `${uuidv4()}.png`;
//         const tempImagePath = path.join(DOWNLOADS_PATH, imageName);

//         let retries = 0;
//         while (retries < RETRY_LIMIT) {
//             try {
//                 const imageBuffer = await downloadImage(imageUrl);
//                 fs.writeFileSync(tempImagePath, imageBuffer);

//                 await new Promise((resolve, reject) => {
//                     gm(tempImagePath)
//                         .fuzz(10, true)
//                         .transparent('white')
//                         .background('rgb(235,0,0)')
//                         .flatten()
//                         .write(tempImagePath, async (err) => {
//                             if (err) return reject(err);
//                             try {
//                                 const s3Url = await uploadFileToS3(tempImagePath, imageName);
//                                 s3Urls.push(s3Url);
//                                 resolve();
//                             } catch (uploadErr) {
//                                 reject(uploadErr);
//                             }
//                         });
//                 });
//                 break;
//             } catch (error) {
//                 retries++;
//                 console.error(`Error processing ${imageUrl} (Attempt ${retries}/${RETRY_LIMIT}):`, error);
//             } finally {
//                 if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
//             }
//         }
//     }
//     return s3Urls;
// }


// module.exports = { processImages };
