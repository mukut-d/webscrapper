import { Injectable } from '@nestjs/common';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
const defalutClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defalutClient.authentications['api-key'];
apiKey.apiKey = process.env.SENDINBLUE_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

@Injectable()
export class MailsService {
  async sendMail(
    email: string,
    subject: string,
    templateId?: number,
    htmlContent?: string,
  ) {
    // console.log('hello');
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = {
      name: 'SellerPundit',
      email: process.env.EMAIL_FROM,
    };
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.templateId = templateId;
    try {
      // console.log('hellooo', email, subject);
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      // console.log(data);
      return data;
    } catch (error) {
      return error;
    }
  }
}
