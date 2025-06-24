// Nutristart service
const puppeteer = require("puppeteer");
const xpaths = require("../../xpaths/xpath.json");
const uploadToS3 = require("../../utils/s3");
const Marketplace = require("../../models/marketplace");
const { apiCallLog } = require("../apiCallLog");
const newRelic = require("newrelic");

async function fetchNutristarHtmlBatch(batch, proxyDetails) {
  try {
    const finalData = [];
    if (batch.length > 0) {
      for (var i = 0; i < batch.length; i++) {
        const item = batch[i];
        const link = item.url;
        // You may need to require puppeteer, Marketplace, xpaths, and uploadToS3 at the top of this file
        const marketplace = await Marketplace.findOne({
          where: { id: item.marketplaceId },
        });
        const xpath = xpaths[marketplace.dataValues.parentMarketplace];
        let browser = null;
        let page;
        try {
          browser = await puppeteer.launch({
            args: [
              "--no-sandbox",
              "--proxy-server=http://" + proxyDetails.api_url,
              "--disabled-setupid-sandbox",
            ],
            headless: true,
            waitForInitialPage: 10000,
          });
          page = await browser.newPage();
          await page.authenticate({
            username: proxyDetails.username,
            password: proxyDetails.password,
          });
        } catch (err) {
          if (browser != null) {
            await browser.close();
          }
          finalData.push({
            html: "",
            ...item,
          });
          continue;
        }
        try {
          await page.goto(link, {
            ...proxyDetails.options,
            timeout: 60000,
          });
          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          await delay(10000);
        } catch (err) {
          finalData.push({
            html: "",
            ...item,
          });
          await browser.close();
          continue;
        }
        const uploadHtml = await page.content();
        await uploadToS3(
          `${marketplace.dataValues.parentMarketplace.split(".")[0]}_${
            item.asin
          }.html`,
          Buffer.from(uploadHtml)
        );
        const flavorSelectorPath = xpath.waitForSelectors.select[0];
        const flavorSelector = await page.$(flavorSelectorPath);
        if (flavorSelector) {
          try {
            if (await page.$(flavorSelectorPath)) {
              await page.waitForSelector(flavorSelectorPath, {
                visible: true,
                timeout: 60000,
              });
            }
          } catch (err) {
            finalData.push({
              html: await page.content(),
              ...item,
            });
            await browser.close();
            continue;
          }
          const spanSelector = xpath.waitForSelectors.spanSelector[0];
          const spans = await page.$$(spanSelector);
          let found = false;
          if (item.variant) {
            for (var j = 0; j < spans.length; j++) {
              const span = spans[j];
              const spanText = await page.evaluate(
                (span) => span.textContent,
                span
              );
              if (spanText.replace("Flavour", "") == item.variant) {
                found = true;
                const clicker = await page.$(
                  `label[for="template--22742776938790__main-flavor-opt-${j}"]`
                );
                await clicker.click();
                setTimeout(() => {}, 5000);
                const htmlContent = await page.content();
                await browser.close();
                finalData.push({
                  html: htmlContent,
                  ...item,
                  flavor: spanText,
                });
                break;
              }
            }
            if (!found) {
              const htmlContent = await page.content();
              finalData.push({
                html: htmlContent,
                ...item,
                flavor: "Not Found",
              });
              await browser.close();
            }
          } else {
            const span = spans[0];
            try {
              await page.waitForSelector(spanSelector, {
                visible: true,
                timeout: 2000,
              });
            } catch (err) {
              finalData.push({
                html: await page.content(),
                ...item,
              });
              await browser.close();
              continue;
            }
            setTimeout(() => {}, 5000);
            const spanText = await page.evaluate(
              (span) => span.textContent,
              span
            );
            const button = await page.$(spanSelector);
            await button.click();
            await span.click();
            setTimeout(() => {}, 5000);
            const htmlContent = await page.content();
            await browser.close();
            finalData.push({
              html: htmlContent,
              ...item,
              flavor: spanText,
            });
          }
        } else {
          const select = xpath.waitForSelectors.select[0];
          try {
            const selectExist = await page.$(select);
            if (selectExist) {
              await page.waitForSelector(select, {
                visible: true,
                timeout: 2000,
              });
            }
          } catch (err) {
            if (item.variant == "Unflavoured") {
              finalData.push({
                html: await page.content(),
                ...item,
                flavour: item.variant,
              });
            } else {
              finalData.push({
                html: await page.content(),
                ...item,
                flavour: "Not Found",
              });
            }
            await browser.close();
            continue;
          }
          const htmlContent = await page.content();
          await browser.close();
          if (item.variant == "Unflavoured") {
            finalData.push({
              html: htmlContent,
              ...item,
              flavor: item.variant,
            });
          } else {
            finalData.push({
              html: htmlContent,
              ...item,
              flavor: "Not Found",
            });
          }
        }
      }
    }
    return finalData;
  } catch (err) {
    // Optionally log error
    console.error("Error in fetchNutristarHtmlBatch:", err);
    await apiCallLog(
      "scrapeQueue",
      "fetchNutristarHtmlBatch",
      "fetchNutristarHtmlBatch",
      {},
      {},
      err,
      "error"
    );
    newRelic.recordCustomEvent("NutristarError", { error: err.message });
    return [];
  }
}

module.exports = { fetchNutristarHtmlBatch };
