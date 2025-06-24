const express = require('express');
const gm = require('gm').subClass({ imageMagick: true });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { uploadFileToS3 } = require('./s3util');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

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

// Main image processing function
async function processImages(imageLinks) {
    const s3Urls = [];

    for (let i = 0; i < imageLinks.length; i++) {
        const imageUrl = imageLinks[i].trim();
        const imageName = `${uuidv4()}.png`; // Unique name for S3
        const tempImagePath = path.join(DOWNLOADS_PATH, imageName);

        let retries = 0;
        while (retries < RETRY_LIMIT) {
            try {
                const imageBuffer = await downloadImage(imageUrl);
                fs.writeFileSync(tempImagePath, imageBuffer);

                // Process the image using GraphicsMagick (gm)
                await new Promise((resolve, reject) => {
                    gm(tempImagePath)
                        .fuzz(10, true)
                        .transparent('white')
                        .background('rgb(235,0,0)') // Change to desired RGB color
                        .flatten()
                        .write(tempImagePath, async (err) => {
                            if (err) return reject(err);
                            try {
                                // Upload to S3 and collect the URL
                                const s3Url = await uploadFileToS3(tempImagePath, imageName);
                                s3Urls.push(s3Url);
                                resolve();
                            } catch (uploadErr) {
                                reject(uploadErr);
                            }
                        });
                });
                break; // Exit retry loop on success
            } catch (error) {
                retries++;
                console.error(`Error processing ${imageUrl} (Attempt ${retries}/${RETRY_LIMIT}):`, error);
                if (retries >= RETRY_LIMIT) console.error(`Failed after ${RETRY_LIMIT} attempts`);
            } finally {
                if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
            }
        }
    }
    return s3Urls;
}

// API endpoint to process images and return S3 URLs
app.post('/api/change-bg-color', async (req, res) => {
    const { imageLinks } = req.body;
    if (!imageLinks || !Array.isArray(imageLinks)) {
        return res.status(400).json({ message: 'Please provide a list of image URLs.' });
    }

    try {
        const s3Urls = await processImages(imageLinks);
        res.json({ s3Urls });
    } catch (error) {
        console.error('Error processing images:', error);
        res.status(500).json({ message: 'Error processing images', error: error.message });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
