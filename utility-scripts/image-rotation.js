const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { uploadFileToS3 } = require('./s3util');

const app = express();
const port = 3000;

app.use(express.json());

/**
 * Download an image from a given URL and return it as a buffer.
 * @param {string} url - The URL of the image.
 * @returns {Promise<Buffer>} - The image buffer.
 */
const downloadImage = async (url) => {
    const response = await axios({
        url,
        responseType: 'arraybuffer',
    });
    return response.data;
};

app.post('/rotate-image', async (req, res) => {
    try {
        const { rotationAngle, imageUrls } = req.body;

        // Validate input
        if (![90, 180, 270].includes(rotationAngle)) {
            return res.status(400).json({ message: 'Invalid rotation angle. Only 90, 180, or 270 degrees allowed.' });
        }
        if (!imageUrls || !Array.isArray(imageUrls)) {
            return res.status(400).json({ message: 'Invalid image URLs. Provide a list of URLs.' });
        }

        const results = [];

        // Process each image URL
        for (const imageUrl of imageUrls) {
            const imageBuffer = await downloadImage(imageUrl);

            // Rotate the image by the specified angle
            const rotatedImageBuffer = await sharp(imageBuffer)
                .rotate(rotationAngle)
                .toBuffer();

            // Save rotated image locally before uploading to S3
            const fileName = `rotated-${rotationAngle}-${uuidv4()}.jpg`;
            const filePath = path.join(__dirname, fileName);
            fs.writeFileSync(filePath, rotatedImageBuffer);

            // Upload rotated image to S3 using s3util.js
            const s3Url = await uploadFileToS3(filePath, fileName);

            // Clean up local file after upload
            fs.unlinkSync(filePath);

            // Collect the S3 URLs
            results.push(s3Url);
        }

        // Return the list of new S3 URLs for the rotated images
        res.json({ rotatedImageUrls: results });
    } catch (error) {
        console.error('Error processing images:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
