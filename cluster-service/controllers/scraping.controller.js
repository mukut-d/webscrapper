const ScrapingService = require('../services/scraping.service');
const { ApiResponse } = require('../utils');

const ScrapingController = {
  async scrape(req, res) {
    try {
      const { data, options, password, vendorName } = req.body;
      console.log('ScrapingController scrape called with data:', req.body);
      if (!data || !options || !password || !vendorName) throw new Error('Missing required fields');

      const scrapedData = await ScrapingService.fetchDataFromAPIService(data, options, password, vendorName);

      return ApiResponse.success(
        res,
        scrapedData,
        'Scraping completed successfully',
        200
      );
    } catch (error) {
      return ApiResponse.error(
        res,
        error,
        error.message || 'Error during scraping',
        400
      );
    }
  },

  async extract(req, res) {
    try {
      const { data } = req.body;

      if (!data) throw new Error("Missing required field: data");

      const extractedData = await ScrapingService.extractDataFromHtmlService(
        data
      );

      return ApiResponse.success(
        res,
        extractedData,
        "Data extracted successfully",
        200
      );
    } catch (error) {
      return ApiResponse.error(
        res,
        error,
        error.message || 'Error extracting data from HTML',
        400
      );
    }
  }
};

module.exports = ScrapingController;