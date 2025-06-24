// const fetch = require("node-fetch");
const constants = require("../../../utils/constants");
const Project = require("../../../models/project");
const MarketPlace = require("../../../models/marketplace");
const ProductKeyword = require("../../../models/productKeyword");

module.exports = {
  //SECTION - scrap Product With Keywords
  async scrapProductWithKeywords(req, res) {
    try {
      const { projectId, isVariant, domains } = req.body;

      //NOTE: Check if the requested project exists
      const checkProject = await Project.findOne({ where: { id: projectId } });

      if (!checkProject) {
        return res.status(400).json({
          status: 400,
          message: constants.RECORD_NOT_FOUND,
        });
      }

      //NOTE: Parse domain details
      const parsedDomains = JSON.parse(domains);

      if (parsedDomains.length === 0) {
        return res.status(400).json({
          status: 400,
          message: constants.EMPTY_PARSED_DOMAINS,
        });
      }

      for (const data of parsedDomains) {
        await Promise.all(
          Object.entries(data.marketPlaces).map(
            async ([mrktPlcKey, scrapingCount]) => {
              const marketPlace = await MarketPlace.findOne({
                where: { parentMarketplace: mrktPlcKey },
              });

              if (!marketPlace || !data.keyword) {
                return res.status(400).json({
                  status: 400,
                  message: constants.MARKETPLACE_NOT_REGISTERED,
                });
              }

              const existingData = await ProductKeyword.findOne({
                where: {
                  projectId,
                  keyword: data.keyword,
                  marketplace: mrktPlcKey,
                },
              });

              if (!existingData) {
                await ProductKeyword.create({
                  projectId,
                  keyword: data.keyword,
                  marketplace: mrktPlcKey,
                  scrapingCount,
                });
              }
            }
          )
        );
      }

      // //NOTE: If all ProductKeyword records were created successfully, fetch for scraping
      // const scrapeResponse = await fetch(
      //   process.env.KEYWORD_SCRAPING_URL + "/scrape/list",
      //   {
      //     method: "POST",
      //     body: JSON.stringify({ projectId, isVariant, fileStreamPath: "" }),
      //     headers: { "Content-type": "application/json; charset=UTF-8" },
      //   }
      // );

      // if (!scrapeResponse.ok) {
      //   console.log(scrapeResponse.statusText);
      //   return res.status(400).json({
      //     status: 400,
      //     message: constants.SCRAPING_ERROR_PRODUCTS,
      //   });
      // }

      // Update the status of the project to 'started'
      await Project.update({ status: "started" }, { where: { id: projectId } });

      return res.status(200).json({
        status: 200,
        message: constants.START_SCRAPING_PRODUCTS_SUCCESS,
      });
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },
};
