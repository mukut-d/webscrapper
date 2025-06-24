const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const awsS3 = require("aws-sdk");

//NOTE - Convert base64 to json format
const convertFile = async (file) => {
  const buff = Buffer.from(file, "base64");
  const buffread = XLSX.read(buff);
  const report = XLSX.utils.sheet_to_json(
    buffread.Sheets[buffread.SheetNames[0]],
    { rawNumbers: true }
  );

  return report;
};

//NOTE - Push file to S3 Bucket with base 64 data
const pushToS3Bucket = async (base64Data, type) => {
  // S3 bucket details
  const s3 = new awsS3.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.S3_REGION,
  });

  // Convert base64 data to buffer
  const bufferData = Buffer.from(base64Data, "base64");

  const s3path = new Date().getTime() + "-" + uuidv4() + ".csv";

  const params = {
    Bucket: process.env.S3_BUCKET_NAME, // Use the parameter consistently
    Key: `${process.env.S3_BUCKET_NAME}/${type}/${s3path}`, // Use the parameter consistently
    Body: bufferData,
    ContentType: "text/csv; charset=utf-8",
  };

  const { Location, Key } = await s3.upload(params).promise();

  console.log("Location", Location);
  return Key;
};

module.exports = {
  convertFile,
  pushToS3Bucket,
};
