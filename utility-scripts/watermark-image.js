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

const downloadImage = async (url) => {
    const response = await axios({
        url,
        responseType: 'arraybuffer',
    });
    return response.data;
};

const generateRepeatedTextWatermarkBuffer = (text, width, height) => {
    const textSize = 8; // Text size
    const opacity = 0.8; // Opacity of the watermark text
    const spacingX = 100; // Horizontal spacing between watermarks
    const spacingY = 100; // Vertical spacing between watermarks

    const svg = `
    <svg width="${width}" height="${height}">
        <style>
            .text {
                fill: rgba(92, 92, 92, ${opacity}); /* White text with transparency */
                font-size: ${textSize}px;
                font-family: Arial, sans-serif;
            }
        </style>
        ${Array.from({ length: Math.ceil(height / spacingY) }).map((_, yIndex) => (
            Array.from({ length: Math.ceil(width / spacingX) }).map((_, xIndex) => (
                `<text x="${xIndex * spacingX}" y="${yIndex * spacingY}" class="text" transform="rotate(-30, ${xIndex * spacingX}, ${yIndex * spacingY})">
                    ${text}
                </text>`
            )).join('')
        )).join('')}
    </svg>`;

    return Buffer.from(svg);
};

app.post('/apply-watermark', async (req, res) => {
    try {
        const { watermarkText, imageUrls } = req.body;
        if (!watermarkText || !imageUrls || !Array.isArray(imageUrls)) {
            return res.status(400).json({ message: 'Invalid input data' });
        }

        const results = [];

        for (const imageUrl of imageUrls) {
            const imageBuffer = await downloadImage(imageUrl);

            // Get image dimensions
            const imageMetadata = await sharp(imageBuffer).metadata();

            // Generate repeated text watermark as SVG buffer to fit the image dimensions
            const textWatermarkBuffer = generateRepeatedTextWatermarkBuffer(
                watermarkText,
                imageMetadata.width,
                imageMetadata.height
            );

            // Apply watermark text all over the image
            const imageWithWatermark = await sharp(imageBuffer)
                .composite([{ input: textWatermarkBuffer }])
                .toBuffer();

            // Save image locally before uploading to S3
            const fileName = `watermarked-${uuidv4()}.jpg`;
            const filePath = path.join(__dirname, fileName);
            fs.writeFileSync(filePath, imageWithWatermark);

            // Upload to S3 using your s3util.js
            const s3Url = await uploadFileToS3(filePath, fileName);

            // Clean up local file after upload
            fs.unlinkSync(filePath);

            // Collect the S3 URLs
            results.push(s3Url);
        }

        res.json({ newUrls: results });
    } catch (error) {
        console.error('Error processing images:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
