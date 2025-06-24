const awsS3 = require("aws-sdk");

//NOTE - Push file to S3 Bucket with base 64 data
exports.uploadToS3 = async (base64Data, fileName, type) => {
    // S3 bucket details
    const s3 = new awsS3.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.S3_REGION,
    });
  
    // Convert base64 data to buffer
    const bufferData = Buffer.from(base64Data, "base64");
  
    const s3path = fileName + "." + type.split("/")[1];   
  
    const params = {
      Bucket: process.env.S3_BUCKET_NAME, // Use the parameter consistently
      Key: `${process.env.S3_BUCKET_NAME}/${s3path}`, // Use the parameter consistently
      Body: bufferData,
      ContentType: type,
    };
  
    const { Location, Key } = await s3.upload(params).promise();
  
    console.log("Location", Location);
    return { Location, Key };
  };//NOTE - Push file to S3 Bucket with base 64 data
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