const puppeteer = require("puppeteer");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyWord = require("../../models/productKeyword");
const HttpsProxyAgent = require("https-proxy-agent");

exports.scrapKeywordProductsViaterra = async ({
  projectId,
  encodedUrl,
  scrapCount,
  marketplace,
  marketplaceId,
  keyword,
}) => {
  console.log("***********scrapKeywordProductsViaterra***********");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // const keyword = "bag";
  const url = decodeURIComponent(encodedUrl);
  console.log("URL:", url); // Log the URL

  let maxURLs = scrapCount;

  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    const lastPage = await page.evaluate(() => {
      const lastPageElement = document.querySelector(
        "div.pagination > span:nth-last-child(2)"
      );
      return lastPageElement ? parseInt(lastPageElement.textContent.trim()) : 1;
    });

    console.log("Last page: ", lastPage);

    const URLs = [];
    let shouldContinue = true;

    const productKeyword = await ProductKeyWord.findOne({
      where: { projectId },
    });
    const startPage = productKeyword ? productKeyword.pagesPushed + 1 : 1;
    // let totalURLs = 0;
    let totalURLs = productKeyword ? productKeyword.scrapSuccessCount : 0;

    for (
      let currentPage = startPage;
      currentPage <= lastPage && shouldContinue;
      currentPage++
    ) {
      try {
        const pageUrl = `https://viaterragear.com/search?options%5Bprefix%5D=last&page=${currentPage}&q=${keyword}%2A&type=product%2Carticle%2Cpage%2Ccollection`;
        await page.goto(pageUrl, { waitUntil: "networkidle0" });

        const selector =
          "#CollectionAjaxContent > div.grid__item.medium-up--four-fifths.grid__item--content > div.collection-grid__wrapper > div.grid.grid--uniform > div > div > a";
        await page.waitForSelector(selector);

        const pageURLs = await page.evaluate((selector) => {
          const anchors = Array.from(document.querySelectorAll(selector));
          return anchors.map((anchor) => {
            const url = anchor.href;
            const urlParams = new URLSearchParams(url.split("?")[1]);
            const sid = urlParams.get("_sid");
            return { url, sid };
          });
        }, selector);

        // URLs.push(...pageURLs)

        if (maxURLs < pageURLs.length) {
          const URLsToAdd = pageURLs.slice(0, maxURLs);
          console.log("URLs to add: ", URLsToAdd.length);
          URLs.push(
            ...URLsToAdd.map(({ url, sid }) => ({
              keyword,
              asin: sid,
              projectId,
              url,
              domain: marketplace,
              insertionType: "byKeyword",
              marketplaceId,
              isScraped: false,
            }))
          );
          shouldContinue = false; // Stop the loop
        } else {
          URLs.push(
            ...pageURLs.map(({ url, sid }) => ({
              keyword,
              asin: sid,
              projectId,
              url,
              domain: marketplace,
              insertionType: "byKeyword",
              marketplaceId,
              isScraped: false,
            }))
          );
          maxURLs -= pageURLs.length;
        }
        totalURLs += URLs.length;

        // Update the ProductKeyword table
        console.log("Updating ProductKeyword table...");
        const updateResult = await ProductKeyWord.update(
          { scrapSuccessCount: totalURLs, pagesPushed: currentPage },
          { where: { projectId } }
        );
        console.log("Update result:", updateResult);

        // Update the ScratchProducts table
        console.log("Updating ScratchProducts table...");
        const createdRecords = await ScratchProducts.bulkCreate(URLs);
        console.log("Created records:", createdRecords);

        // Clear the allPUIDs array for the next page
        URLs.length = 0;
      } catch (error) {
        console.error(
          `Error occurred while processing page ${currentPage}:`,
          error
        );
        break; // Exit the loop if an error occurs
      }
    }

    console.log("All URLs: ", URLs);
    console.log("Total URLs: ", URLs.length);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
};
