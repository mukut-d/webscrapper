const { Op, Sequelize } = require("sequelize");
const cron = require("node-cron");
const ProductKeyword = require("../models/productKeyword");
const MarketPlace = require("../models/marketplace");
const constants = require("../utils/constants");
const { scrapKeywordProducts } = require("../keywords/amazon");
const {
  scrapKeywordProductsExoticIndia,
} = require("../keywords/exoticindiaart");
const { scrapKeywordProductsViaterra } = require("../keywords/viaterragear");

const scheduleKeywordTempListing = cron.schedule("*/15 * * * *", async () => {
  try {
    console.log("cron started at: ", new Date());
    console.log("Cron job for keyword list entry in temp table !!!");
    //NOTE - get requested keyword base project details
    const productKeywords = await ProductKeyword.findAll({
      where: {
        keyword: {
          [Op.ne]: null,
        },
        scrapSuccessCount: {
          [Op.lt]: Sequelize.col("scraping_count"),
        },
      },
    });

    await Promise.all(
      productKeywords.map(
        async ({
          projectId,
          keyword,
          marketplace,
          scrapingCount,
          scrapSuccessCount,
        }) => {
          const productNeedToScrap = scrapingCount - scrapSuccessCount;

          // NOTE - check MarketPlace details
          const marketPlace = await MarketPlace.findOne({
            where: { parentMarketplace: marketplace },
          });

          if (!marketPlace) {
            //NOTE: Handle the case where the marketPlace is not found
            console.error(constants.MARKETPLACE_NOT_REGISTERED);
            return; // Skip the rest of the logic for this iteration
          }

          //NOTE - create a encodedUrl
          const encodedUrl = encodeURIComponent(
            `${marketPlace.searchUrl}${keyword}`
          );

          if (marketplace.includes("amazon")) {
            scrapKeywordProducts({
              page: 1,
              projectId,
              encodedUrl,
              scrapCount: productNeedToScrap,
              marketplace,
              marketplaceId: marketPlace.id,
              keyword,
            });
          } else if (marketplace.includes("exoticindiaart")) {
            scrapKeywordProductsExoticIndia({
              projectId,
              encodedUrl,
              scrapCount: productNeedToScrap,
              marketplace,
              marketplaceId: marketPlace.id,
              keyword,
            });
          } else if (marketplace.includes("viaterragear")) {
            scrapKeywordProductsViaterra({
              projectId,
              encodedUrl,
              scrapCount: productNeedToScrap,
              marketplace,
              marketplaceId: marketPlace.id,
              keyword,
            });
          }
        }
      )
    );
  } catch (error) {
    console.log(
      "Error in cron job for insertaion on main product",
      error.message
    );
  }
});

setTimeout(() => {
  console.log("Stopping cron job...");
  console.log("time at it stops: ", new Date());
  scheduleKeywordTempListing.stop(); // Stop the cron job
}, 14 * 60 * 1000);
