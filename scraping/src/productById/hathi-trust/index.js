const fetch = require("node-fetch");
const cheerio = require("cheerio");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyword = require("../../models/productKeyword");
const MarketPlace = require("../../models/marketplace");

//SECTION - haith trust Product By Id
exports.retrieveItemsForHaithiTrust = async ({ products }) => {
  for (const data of products) {
    const { id, asin, projectId } = data;
    try {

      //NOTE: Fetch marketplace details
      const marketplace = await MarketPlace.findOne({
        where: { parentMarketplace: "hathitrust.org" },
        attributes: ["id", "idUrl"],
      });

      const encodedUrl = `${marketplace.idUrl}${asin}`;

      const url = `${process.env.SCRAPING_ANT_API_URL}?url=${encodedUrl}&page=1&x-api-key=${process.env.SCRAPING_ANT_TOKEN}&proxy_country=US&browser=false`;
      console.log("haith trust url:", url);

      //NOTE: Fetch HTML content
      const response = await fetch(url);

      if (!response.ok) {
        console.log('response', response.status);
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const htmlContent = await response.text();

      //NOTE: Load the HTML content into Cheerio
      const $ = cheerio.load(htmlContent);

      //NOTE: Find the <script> element containing HT.params.totalSeq
      const scriptText = $("script")
        .filter((i, el) => {
          return $(el).text().includes("HT.params.totalSeq");
        })
        .text();

      // NOTE: Extract the value of HT.params.totalSeq using regex
      const match = /HT\.params\.totalSeq\s*=\s*(\d+)/.exec(scriptText);

      console.log('match', match);

      if (match) {
        const totalSeqValue = match[1];
        console.log("HT.params.totalSeq:", totalSeqValue);

        //NOTE: Update Scratch Products details
        await ScratchProducts.update(
          { size: totalSeqValue, isScraped: true },
          { where: { id } }
        );

        //NOTE: Update ProductKeyword table as product scraped successfully
        await ProductKeyword.update(
          { scrapSuccessCount: 1 },
          { where: { projectId, puid: asin } }
        );
      } else {
        console.log("HT.params.totalSeq not found.");
      }

      // Wait for 2 seconds before fetching the next product
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error("Error:", error.message);
    }
  }
};

