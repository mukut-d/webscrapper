const nodemailer = require("nodemailer");

async function sendUpdateReportEmail(mailOptions) {
  try {
    console.log("Sending the Update Report to User --------->");

    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname,
      port: process.env.SMTP_Port,
      secure: false,
      auth: {
        user: process.env.SMTP_Username,
        pass: process.env.SMTP_Password,
      },
    });

    return await transporter.sendMail(mailOptions);

  } catch (error) {
    console.log(
      "Error occurred while sending the report to user ------------>",
      error
    );
    return false;
  }
}

module.exports = sendUpdateReportEmail;
