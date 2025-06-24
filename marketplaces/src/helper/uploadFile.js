const AWS = require("aws-sdk");
const shortid = require("shortid");

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.S3_REGION,
});
const S3 = new AWS.S3();

exports.uploadToS3 = async (fileData) => {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key:  fileData.originalname?.includes('/') ? fileData.originalname : shortid.generate() + "-" + fileData.originalname,
      Body: fileData.buffer,
      ContentType: fileData.mimetype,
    };

    S3.upload(params, (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data.Location);
      }
    });
  });
};

