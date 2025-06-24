const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { uploadFileToS3 } = require('./s3util');
const downloadImage = async (url) => {
    const response = await axios({
        url,
        responseType: 'arraybuffer',
    });
    return response.data;
};

const generateRepeatedTextWatermarkBuffer = (text, width, height) => {
    const textSize = 17; // Text size
    const opacity = 0.9; // Opacity of the watermark text
    const spacingX = 170; // Horizontal spacing between watermarks
    const spacingY = 170; // Vertical spacing between watermarks

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


exports.AddWatermark = async (imageUrls, watermarkText) => {
    try {
        if (!watermarkText || !imageUrls || !Array.isArray(imageUrls)) {
            throw new Error('Invalid input data');
        }

        const results = [];

        for (const imageUrl of imageUrls) {
            const imageBuffer = await downloadImage(imageUrl);

            // Get image dimensions
            const imageMetadata = await sharp(imageBuffer).metadata();

            const textWatermarkBuffer = generateRepeatedTextWatermarkBuffer(
                watermarkText,
                imageMetadata.width,
                imageMetadata.height
            );

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
        return results;
    } catch (error) {
        console.error('Error processing images:', error);
        throw new Error('Internal server error');
    }
};
