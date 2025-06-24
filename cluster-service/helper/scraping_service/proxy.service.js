const puppeteer = require("puppeteer");
const moment = require("moment");
const { uploadToS3 } = require("../../utils/s3.js");
const newRelic = require("newrelic");

/**
 * Fetches data from a proxy using Puppeteer, uploads HTML to S3, and returns the result array.
 * @param {Array} data - Array of rowData objects to process
 * @param {Object} proxyDetails - Proxy configuration (api_url, username, password, options)
 * @param {boolean} first_fetch
 * @param {boolean} changeDate
 * @param {boolean} is_frequency
 * @returns {Array} result - Array of objects with html and rowData
 */
async function fetchDataFromProxy(
  data,
  proxyDetails,
  first_fetch,
  changeDate,
  is_frequency
) {
  let browser;
  const result = [];
  try {
    browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        `--proxy-server=http://${proxyDetails.api_url}`,
        "--disabled-setupid-sandbox",
      ],
      headless: true,
      waitForInitialPage: 10000,
    });

    await Promise.all(
      data.map(async (rowData) => {
        let page;
        try {
          page = await browser.newPage();
          await page.authenticate({
            username: proxyDetails.username,
            password: proxyDetails.password,
          });
        } catch (err) {
          if (browser) await browser.close();
          console.log("Page creation/auth error:", err);
          result.push({ html: "", ...rowData });
          return;
        }

        try {
          await page.goto(rowData.url, {
            ...proxyDetails.options,
            timeout: 60000,
          });
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (err) {
          if (browser) await browser.close();
          console.log("Page navigation error:", err);
          result.push({ html: "", ...rowData });
          return;
        }

        try {
          const marketplace = await Marketplace.findOne({
            where: { id: rowData.marketplaceId },
          });
          if (
            marketplace &&
            xpaths[marketplace.dataValues.parentMarketplace]?.waitForSelectors
          ) {
            await Promise.all(
              Object.entries(
                xpaths[marketplace.dataValues.parentMarketplace]
                  .waitForSelectors
              ).map(async ([key, value]) => {
                for (let i = 0; i < value.length; i++) {
                  const selector = value[i];
                  if (key === "buttonClick") {
                    const button = await page.$(selector);
                    if (button) {
                      await button.click();
                      await page.waitForNavigation({
                        waitUntil: "domcontentloaded",
                      });
                      await new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                  } else {
                    const el = await page.$(selector);
                    if (el) {
                      await page.waitForSelector(selector, { visible: true });
                    }
                  }
                }
              })
            );
          }

          const response = await page.content();
          await uploadToS3(
            `${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment()
              .add(5, "hours")
              .add(30, "minutes")
              .format("DD_MM_YYYY")}.html`,
            Buffer.from(response)
          );
          result.push({ html: response, ...rowData });
        } catch (err) {
          result.push({ html: "", ...rowData });
        } finally {
          if (page) await page.close();
        }
      })
    );
  } catch (error) {
    console.error("Error in fetchDataFromProxyHelper:", error);
    await apiCallLog(
      "scrapeQueue",
      "fetchDataFromProxyHelper",
      "fetchDataFromProxyHelper",
      {},
      {},
      error,
      "error"
    );
    newRelic.recordCustomEvent("ProxyError", { error: error.message });
  } finally {
    if (browser) await browser.close();
  }
  return result;
}

module.exports = {
  fetchDataFromProxy,
};
