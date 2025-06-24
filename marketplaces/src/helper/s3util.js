const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.S3_REGION
});

async function uploadFileToS3(filePath, fileName) {
    const fileContent = fs.readFileSync(filePath);

    const params = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ACL: 'public-read'
    };

    return new Promise((resolve, reject) => {
        S3.upload(params, (err, data) => {
            if (err) {
                console.error('Error uploading file:', err);
                reject(err);
            } else {
                console.log('Upload successful:', data);
                resolve(data.Location);
            }
        });
    });
}

module.exports = { uploadFileToS3 };
