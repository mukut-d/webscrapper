const jsdom = require("jsdom");
const fetch = require("node-fetch");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyWord = require("../../models/productKeyword");
const constants = require("../../utils/constants");
const cheerio = require("cheerio");
const HttpsProxyAgent = require("https-proxy-agent");

const proxyUrl = "http://aditya1991arya:TqPTQIp8bB@103.171.51.201:59100";
const proxyAgent = new HttpsProxyAgent(proxyUrl);

//SECTION - scrape Scratch Products for keyword scraping
exports.scrapKeywordProductsExoticIndia = async ({
  projectId,
  encodedUrl,
  scrapCount,
  marketplace,
  marketplaceId,
  keyword,
}) => {
  try {
    console.log("***********scrapKeywordProductsExoticIndia***********");
    let maxPUIDs = scrapCount;
    const url = decodeURIComponent(encodedUrl);
    console.log("URL:", url); // Log the URL

    // Create an array to store all the URLs
    const allPUIDs = [];
    fetch(url, { agent: proxyAgent })
      .then((res) => res.text())
      .then(async (html) => {
        const $ = cheerio.load(html);

        // Get the last page number
        const lastPage = parseInt(
          $(
            "body > section.section.mainbody.pb-0 > div > div > div.column.is-full.is-four-fifths-desktop.is-size-7 > div > div.columns.is-variable.is-2-touch.is-5-desktop > div > nav > ul > li:nth-child(6) > a > span"
          )
            .text()
            .trim()
        );

        let shouldContinue = true;

        const productKeyword = await ProductKeyWord.findOne({
          where: { projectId },
        });
        const startPage = productKeyword ? productKeyword.pagesPushed + 1 : 1;
        let totalPUIDs = productKeyword ? productKeyword.scrapSuccessCount : 0;

        for (let page = startPage; page <= lastPage && shouldContinue; page++) {
          const pageUrl = `${url}&&pagecount=${page}`;

          try {
            const res = await fetch(pageUrl, { agent: proxyAgent });
            const html = await res.text();
            const $ = cheerio.load(html);

            const PUIDs = $(
              "div:nth-child(2) > div > div > div.product-textarea-title.is-size-6.has-text-weight-medium.ellipsis.is-ellipsis-2 > a"
            )
              .map((i, link) => {
                const puidRaw = $(link).attr("href");
                const splitRawPuid = puidRaw.split("/");
                const lastword = splitRawPuid[splitRawPuid.length - 2];
                const puid = lastword.split("-").pop();
                return puid;
              })
              .get();

            if (maxPUIDs < PUIDs.length) {
              const PUIDsToAdd = PUIDs.slice(0, maxPUIDs);
              console.log("PUIDs to add: ", PUIDsToAdd);
              allPUIDs.push(
                ...PUIDsToAdd.map((PUID) => ({
                  keyword,
                  asin: PUID,
                  projectId,
                  domain: marketplace,
                  insertionType: "byKeyword",
                  marketplaceId,
                  isScraped: false,
                }))
              );
              shouldContinue = false; // Stop the loop
            } else {
              allPUIDs.push(
                ...PUIDs.map((PUID) => ({
                  keyword,
                  asin: PUID,
                  projectId,
                  domain: marketplace,
                  insertionType: "byKeyword",
                  marketplaceId,
                  isScraped: false,
                }))
              );
              maxPUIDs -= PUIDs.length;
            }

            totalPUIDs += allPUIDs.length;

            // Update the ProductKeyword table
            console.log("Updating ProductKeyword table...");
            const updateResult = await ProductKeyWord.update(
              { scrapSuccessCount: totalPUIDs, pagesPushed: page },
              { where: { projectId } }
            );
            console.log("Update result:", updateResult);

            // Update the ScratchProducts table
            console.log("Updating ScratchProducts table...");
            const createdRecords = await ScratchProducts.bulkCreate(allPUIDs);
            console.log("Created records:", createdRecords);

            // Clear the allPUIDs array for the next page
            allPUIDs.length = 0;
          } catch (error) {
            console.error("Error occurred while fetching page: " + pageUrl);
            console.error(error);
            break;
          }
        }
        console.log(`Total number of PUIDs fetched: ${totalPUIDs}`);
      })
      .catch((error) => {
        console.error(error);
      });
  } catch (error) {
    console.log("Error in scrapStagingProducts:", error.message);
  }
};
