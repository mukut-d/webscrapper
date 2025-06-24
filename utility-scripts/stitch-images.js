const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { uploadFileToS3 } = require('./s3util');  // Import your S3 utility

const app = express();
app.use(express.json());

// Helper to fetch image from URL
const fetchImage = async (url) => {
    const response = await axios({
        url,
        responseType: 'arraybuffer',
    });
    return response.data;
};

// Updated stitching logic
const stitchImages = async (banner1, mainImages, banner2) => {
    const images = [];

    // Add banner1
    if (banner1) {
        const banner1Buffer = await fetchImage(banner1);
        images.push(banner1Buffer);
    }

    // Add all main images
    for (let mainImage of mainImages) {
        const mainImageBuffer = await fetchImage(mainImage);
        images.push(mainImageBuffer);
    }

    // Add banner2 (if provided)
    if (banner2) {
        const banner2Buffer = await fetchImage(banner2);
        images.push(banner2Buffer);
    }

    // Get metadata of all images (to calculate total width/height)
    const imageMetadataPromises = images.map(img => sharp(img).metadata());
    const imageMetadata = await Promise.all(imageMetadataPromises);

    // Calculate total height and maximum width
    const totalHeight = imageMetadata.reduce((acc, img) => acc + img.height, 0);
    const maxWidth = Math.max(...imageMetadata.map(img => img.width));

    let yOffset = 0;
    const compositeImages = [];

    // Prepare the composite instructions
    for (let i = 0; i < images.length; i++) {
        compositeImages.push({ input: images[i], top: yOffset, left: 0 });
        yOffset += imageMetadata[i].height; // Increment yOffset by the height of the current image
    }

    // Compose the final image
    const stitchedImage = await sharp({
        create: {
            width: maxWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },  // White background
        }
    })
    .composite(compositeImages)
    .png() // Make sure the output is in PNG format
    .toBuffer();

    return stitchedImage;
};

// Save the stitched image to a temporary file
const saveTempFile = async (imageBuffer) => {
    const fileName = `stitched-image-${uuidv4()}.png`;
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, imageBuffer);
    return filePath;
};

// API endpoint
app.post('/stitch-and-upload', async (req, res) => {
    try {
        const { banner1, mainImages, banner2 } = req.body;

        console.log('Request received:', { banner1, mainImages, banner2 });
        
        // Validate input
        if (!mainImages || !Array.isArray(mainImages) || mainImages.length === 0) {
            return res.status(400).send('Main images are required');
        }

        let stichedImages = [];

        for(let image of mainImages) {
            // Stitch images
            const stitchedImage = await stitchImages(banner1, Array(image), banner2);

            // Save stitched image to temporary file
            const tempFilePath = await saveTempFile(stitchedImage);

            // Upload the image to S3 using your custom utility
            const imageUrl = await uploadFileToS3(tempFilePath, path.basename(tempFilePath));

            stichedImages.push(imageUrl);

            // Clean up temp file
            fs.unlinkSync(tempFilePath);
        }

        

        res.json({ success: true, url: stichedImages });
    } catch (error) {
        console.error('Error stitching and uploading images:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
