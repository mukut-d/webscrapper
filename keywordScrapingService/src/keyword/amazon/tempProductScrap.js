const fetch = require("node-fetch");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const ScratchProducts = require("../../models/scratchProducts");
const { ProductInsertionType } = require("../../utils/enum");
const constants = require("../../utils/constants");

//ANCHOR - fetch products from scrapingant
const fetchScrapingAntData = async (encodedUrl, page) => {
  const url = `${process.env.SCRAPING_ANT_API_URL}?url=${encodedUrl}&page=${page}&x-api-key=${process.env.SCRAPING_ANT_TOKEN}&browser=false`;
  console.log("url", url);
  try {
    const response = await fetch(url);
    return await response.text();
  } catch (error) {
    console.log("Error fetching data from ScrapingAnt:", error.message);
    throw error;
  }
};

//ANCHOR - create Scratch Product for bulk create data
const createScratchProduct = (
  elm,
  productIdSelector,
  positionSelector,
  keyword,
  projectId,
  marketplace,
  marketplaceId
) => {
  const asinAttribute = elm.getAttribute(productIdSelector);
  const positionAttribute = elm.getAttribute(positionSelector);

  if (!asinAttribute) return null;

  const asinValue = asinAttribute.split(".").pop();
  const listingPosition = positionAttribute ? Number(positionAttribute) : null;

  return {
    keyword,
    asin: asinValue,
    projectId,
    domain: marketplace,
    listingPosition,
    insertionType: ProductInsertionType.BY_KEYWORD,
    marketplaceId,
    isScraped: false,
  };
};

//SECTION - scrape Scratch Products for keyword scraping
exports.scrapStagingProducts = async ({
  page,
  projectId,
  encodedUrl,
  scrapCount,
  marketplace,
  marketplaceId,
  keyword,
}) => {
  try {
    const result = await fetchScrapingAntData(encodedUrl, page);
    const dom = new JSDOM(result);
    const selectedElems = dom.window.document.querySelectorAll(
      "div[data-csa-c-pos]"
    );

    const productIdSelector = "data-csa-c-item-id";
    const positionSelector = "data-csa-c-pos";

    if (selectedElems.length > 0) {
      const scratchProductsToCreate = Array.from(selectedElems)
        .slice(0, Math.min(scrapCount, selectedElems.length))
        .map((elm) =>
          createScratchProduct(
            elm,
            productIdSelector,
            positionSelector,
            keyword,
            projectId,
            marketplace,
            marketplaceId
          )
        )
        .filter(Boolean);

      //NOTE: Use bulkCreate to insert all records at once
      await ScratchProducts.bulkCreate(scratchProductsToCreate);

      const totalProductCount = Math.max(0, scrapCount - selectedElems.length);

      //NOTE: If there are more products to scrap, recursively call the function
      if (totalProductCount > 0) {
        await exports.scrapStagingProducts({
          page: page + 1,
          projectId,
          encodedUrl,
          scrapCount: totalProductCount,
          marketplace,
          marketplaceId,
          keyword,
        });
      }
    } else {
      console.log(constants.NO_PRODUCT_FOUND);
    }
  } catch (error) {
    console.log("Error in scrapStagingProducts:", error.message);
  }
};
