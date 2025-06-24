const axios = require("axios");
const { apiCallLog } = require("../helper/apiCallLog");

const ExtractDataFromHtml = async (requestData) => {
  try {
    const request = {
      method: "POST",
      url: `http://localhost:5050/api/scraping/extract`,
      headers: {
        "Content-Type": "application/json",
      },
      data: requestData,
    };

    const response = await axios(request);
    if (response.status === 200 && response.data) {
      await apiCallLog(
        "scrapeSimilarProducts",
        "scrapeSimilarProducts",
        "scrapeSimilarProducts",
        { requestData },
        {},
        {},
        "success"
      );
      return response.data.data;
    } else {
      throw new Error("Failed to scrape similar products");
    }
  } catch (err) {
    console.error("Error in scrapeSimilarProducts:", err);
    await apiCallLog(
      "scrapeSimilarProducts",
      "scrapeSimilarProducts",
      "scrapeSimilarProducts",
      { requestData },
      {},
      { error: err.message },
      "error"
    );
    throw err.response?.data?.message || err.message;
  }
};

module.exports = ExtractDataFromHtml;
