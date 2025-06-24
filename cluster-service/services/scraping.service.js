const { fetchDataFromAPI, searchPageExtractor } = require("../subprocess");

const ScrapingService = {
  async fetchDataFromAPIService(data, options, password, vendorName) {
    if (!data || !options || !password || !vendorName) {
      throw new Error("Missing required fields");
    }

    try {
      const apiResponse = await fetchDataFromAPI(
        data,
        options,
        password,
        false,
        vendorName
      );
      return { success: true, data: apiResponse };
    } catch (error) {
      throw new Error(error.message || "Error fetching data from API");
    }
  },

  async extractDataFromHtmlService(data) {
    try {
      if (!data) {
        throw new Error("Missing required field: data");
      }

      const extractedData = await searchPageExtractor(data);

      if (!extractedData || Object.keys(extractedData).length === 0) {
        throw new Error("No data found");
      }

      return extractedData;
    } catch (error) {
      throw new Error(
        "Error extracting data from HTML: " + error.message || "Unknown error"
      );
    }
  },
};

module.exports = ScrapingService;
