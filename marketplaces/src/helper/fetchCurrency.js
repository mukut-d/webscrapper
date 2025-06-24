const { default: axios } = require("axios");
const sendUpdateReportEmail = require("./sendUpdateReportEmail");

async function fetchCurrencyAndPrice({ currency, amount, convertedTo }) {
  try {
    const response = await axios.post(
      "http://localhost:5001/currency/convert",
      {
        currency,
        amount: Number(amount),
        convertedTo,
      }
    );
    return response?.data?.data;
  } catch (error) {
    console.log(error);

    // Step 3: Send Email with the S3 File Link
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: "akhlaq@mergekart.com", // Multiple recipients passed in fileOptions
      subject: `Failed Currency Conversion`,
      text: `Hello, please find the attached failed update report. Error: ${JSON.stringify(error)}`,
    };

    try {
      await sendUpdateReportEmail(mailOptions);
    } catch (err) {
      console.log(err);
    }
    throw new Error('Currency conversion failed');
  }
}

module.exports = fetchCurrencyAndPrice;
