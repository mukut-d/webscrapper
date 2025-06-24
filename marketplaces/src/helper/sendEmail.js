const axios = require("axios");
const newRelic = require("newrelic");
const { apiCallLog } = require("./apiCallLog");

exports.SendEmail = async (data) => {
  try {
    const { fromEmail, template_id, toEmail } = data;

    const options = {
      method: "POST",
      url: process.env.MSG91_URL + "/v5/email/send",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey: process.env.MSG91_AUTH_KEY,
      },
      data: {
        to: [{ email: toEmail }],
        from: { email: fromEmail },
        domain: process.env.MSG91_DOMAIN,
        template_id: template_id,
      },
    };

    axios
      .request(options)
      .then(function (response) {
        res.status(200).json({
          success: true,
          message: "Invoice saved and mailed successfully",
          response: response,
        });
      })
      .catch(function (error) {
        newRelic.recordCustomEvent(`Error while sending email. Error ${error}`);
        // res.json(error);
      });
  } catch (error) {
    newRelic.recordCustomEvent(`Error while sending email. Error ${error}`);
    console.log(error);
  }
};

exports.CreateTemplate = async (data) => {
  try {
    const { name, slug, subject, body } = data;

    const options = {
      method: "POST",
      url: process.env.MSG91_URL + "/v5/email/templates",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey: process.env.MSG91_AUTH_KEY,
      },
      data: {
        "name": name,
        "slug": slug,
        "subject": subject,
        "body": body,
      },
    };

    axios
      .request(options)
      .then(function (response) {
        res.status(200).json({
          success: true,
          message: "Template created successfully",
          response: response,
        });
      })
      .catch(function (error) {
        newRelic.recordCustomEvent(
          `Error while saving template. Error ${error}`
        );
        res.json(error);
      });
  } catch (error) {
    newRelic.recordCustomEvent(`Error while saving template. Error ${error}`);
    console.log(error);
  }
};

exports.sendMailUsingNodemailer = async (userId, subject, text) => {
  try {

    const nodemailer = require("nodemailer");

    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname, // Replace with your SMTP host
      port: process.env.SMTP_Port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_Username, // Replace with your SMTP username
        pass: process.env.SMTP_Password, // Replace with your SMTP password
      },
    });

    const userData = await User.findOne({
      where: { id: userId },
    });

    if (userData) {
      // Set up email data
      let mailOptions = {
        from: process.env.FROM_EMAIL, // Replace with your email
        to: "aditya@mergekart.com", // Replace with the receiver's email
        cc: userData.dataValues.email,
        subject: subject,
        text: text,
      };

      // Send the email
      await transporter.sendMail(mailOptions, async (error, info) => {
        if (error) {
          await apiCallLog("SendMail", "sendMailUsingNodemailer", "sendMailUsingNodemailer", mailOptions, {}, error, "error");
          newRelic.recordCustomEvent(`mail_send`, { error: error.message });
          console.log(error);
        } else {
          console.log("Message sent: %s", info.messageId);
          await apiCallLog("SendMail", "sendMailUsingNodemailer", "sendMailUsingNodemailer", mailOptions, {}, info, "success");
        }
      });
    }

  } catch (err) {
    await apiCallLog("SendMail", "sendMailUsingNodemailer", "sendMailUsingNodemailer", { userId, subject, text }, {}, err, "error");
    newRelic.recordCustomEvent("mail_send", { error: err.message });
    console.log(err);
  }
}