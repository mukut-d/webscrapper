const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure AWS SDK with your credentials and region
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

async function uploadFileToS3({ mimetype, buffer, originalname, bucketName, folderName }) {
  try {
    // Generate a unique file name and include the folder name in the key
    const fileName = `${uuidv4()}-${path.basename(originalname)}`;
    const key = folderName ? `${folderName}/${fileName}` : fileName;

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      // ACL: 'public-read'
    };

    const data = await s3.upload(params).promise();
    return data;
  } catch (error) {
    throw error;
  }
}

module.exports = { uploadFileToS3 };
