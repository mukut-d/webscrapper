import { Injectable, HttpStatus } from '@nestjs/common';
import { S3 } from 'aws-sdk';

@Injectable()
export class CloudStorageService {
  async uploadImage(file: any): Promise<any> {
    try {
      const { originalname } = file;
      let response = {};

      if (!originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        response = {
          error: { message: 'File type not supported' },
          success: false,
          statusCode: HttpStatus.OK,
          message: 'File type not supported',
        };
      } else {
        const bucket = process.env.AWS_BUCKET;
        const name = `${Date.now()}${originalname}`;
        const resp = await this.uploadS3(file, bucket, name);
        response = {
          statusCode: HttpStatus.OK,
          message: 'File uploaded successfully',
          data: {
            url: resp.Location,
          },
          success: true,
        };
      }
      return await response;
    } catch (error) {
      // console.log(error);
      return error;
    }
  }

  async uploadFile(file: any): Promise<any> {
    try {
      const { originalname } = file;
      let response = {};
      const bucket = process.env.AWS_BUCKET;
      const name = `${Date.now()}${originalname}`;
      const resp = await this.uploadS3(file, bucket, name);
      response = {
        statusCode: HttpStatus.OK,
        message: 'File uploaded successfully',
        data: {
          url: resp.Location,
        },
        success: true,
      };
      return await response;
    } catch (error) {
      // console.log(error);
      return error;
    }
  }

  async uploadS3(file, bucket, name) {
    try {
      const s3 = await this.getS3();
      const params = {
        Bucket: bucket,
        Key: name,
        Body: file.buffer,
      };
      return await s3.upload(params).promise();
    } catch (error) {
      return error;
    }
  }

  async getS3() {
    const s3 = new S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    return s3;
  }
}
