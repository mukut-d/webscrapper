const AWS = require("aws-sdk");
const S3 = new AWS.S3();

async function uploadToS3(key, buffer) {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "text/html",
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
}

module.exports = {
  uploadToS3,
};
