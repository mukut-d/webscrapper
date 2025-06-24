const bull = require("bull");
// const async = require("async");
const newRelic = require("newrelic");
const ScrapingAntClient = require("@scrapingant/scrapingant-client");
const dom = require("xmldom").DOMParser;
const xpaths = require("./xpaths/xpath.json");
const xpath = require("xpath");
const validate = require("is-my-json-valid");

const Project = require("./models/project");
const Marketplace = require("./models/marketplace");
const ScratchProducts = require("./models/scratchProducts");
const TimedAttributes = require("./models/timedAttributes");
const queueData = require("./models/queueData");

const puppeteer = require("puppeteer");
const { JSDOM } = require("jsdom");
const nodemailer = require("nodemailer");
const moment = require("moment/moment");
const CSVParser = require("json2csv").Parser;
const cheerio = require("cheerio");
const AWS = require("aws-sdk");
const { Op } = require("sequelize");
const axios = require("axios");
const rp = require("request-promise");
const qs = require("qs");
const { produceCartlowCSV } = require("./cartlowMail");
const connectDB = require("./database/db");
connectDB();
const { apiCallLog } = require("./helper/apiCallLog");
const { Promise } = require("bluebird");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname + "/.env"),
});

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.S3_REGION,
});
const S3 = new AWS.S3();

async function uploadToS3(key, buffer) {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "text/html",
    };

    S3.upload(params, (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data.Location);
      }
    });
  });
}

const fetchQueue = new bull("scrapeQueue", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
  },
});

process.on("message", async (message) => {
  console.log(message === "start", "message");
  if (message === "start") {
    await processTask();
  }
});

async function processTask() {
  const maxQueueSize = 61;
  try {
    const haithTrustData = [];
    console.log("DB_HOST", process.env.DB_HOST);
    fetchQueue.process(5, async (job) => {
      console.log("job " + job);
      console.log(job.data);
      await job.takeLock();
      try {
        console.log("Inside process");
        const {
          batch,
          type,
          first_fetch,
          compare_marketplaces,
          changeDate,
          is_frequency,
        } = job.data;
        console.log(batch.mongoId, "batch.mongoId");
        const mongoId = batch.mongoId;

        const queueDataRes = await queueData.findById(mongoId);

        // What is inside of the queuedata what are we storing here
        const productIds = queueDataRes.queueData;

        // why are you extracting ScratchProducts other than productIds
        const products = await ScratchProducts.findAll({
          where: {
            id: {
              [Op.in]: productIds,
            },
          },
          attributes: [
            "id",
            "asin",
            "reason",
            "url",
            "domain",
            "marketplaceId",
            "scrap_count",
            "nextFetch",
            "pushed_in_queue",
            "isScraped",
            "is_failed",
            "projectId",
            "title",
            "mrp",
            "price",
            "brand",
            "storage",
            "ram",
            "model",
            "variant",
          ],
          raw: true,
        });

        // what will we do by getting the vendors
        const vendors = queueDataRes.vendors;
        console.log(vendors);
        // await Promise.all(
        //     batch.map(async (rowData) => {
        //       try {
        //         console.log("Processing product:", rowData.asin);
        //         const { domain } = rowData;
        //         if (domain.includes("amazon")) {
        //           await fetchProductsFromASIN({ products: rowData });
        //         } else if (domain.includes("filpkart")) {
        //           console.log("filpkart");
        //         } else if (domain.includes("hathitrust")) {
        //           console.log("hathitrust");
        //           haithTrustData.push(rowData); //TODO: Collect HaithiTrust data
        //         } else if (domain.includes("exoticindiaart")) {
        //           // Check if the queue is full
        //           if (writeQueue.length() < maxQueueSize) {
        //             const writeOperation = await retrieveItemsForExoticindia({
        //               products: rowData,
        //             });
        //             console.log(
        //               "Queue length before adding task:",
        //               writeQueue.length()
        //             );
        //             writeQueue.push(writeOperation);
        //           } else {
        //             console.log("Write queue is full, pausing processing");
        //             await new Promise((resolve) => {
        //               // Resume processing when the queue is drained
        //               writeQueue.drain(resolve);
        //             });
        //             console.log("Resuming processing");
        //             const writeOperation = await retrieveItemsForExoticindia({
        //               products: rowData,
        //             });
        //             writeQueue.push(writeOperation);
        //           }
        //         } else if (domain.includes("viaterragear")) {
        //           await retrieveItemsForViaterragear({ products: rowData });
        //         }
        //       } catch (error) {
        //         console.error(
        //           "Error in processing product:",
        //           rowData.asin,
        //           error.message
        //         );
        //         if (error.code === "ECONNREFUSED") {
        //           econnRefusedCount++;
        //         }
        //         newrelic.recordCustomEvent("RowProcessingError", {
        //           error: error.message,
        //         });
        //         return null;
        //       }
        //     })
        //   );

        // here we will process the final data
        const finalData = [];

        // Checking the type and processing the data
        if (type == "api") {
          const marketplaceId = products[0].marketplaceId;

          const vendor = vendors[marketplaceId.toString()];
          const options = vendor.options;
          const password = vendor.password;
          const vendorName = vendor.api_url;

          let i = 0;
          while (i < products.length) {
            const data = products.slice(i, i + 25);
            const htmlArray = await fetchDataFromAPI(
              data,
              options,
              password,
              first_fetch, //What is in first_fetch
              vendorName // Whos vendorName is this?
            );
            i += 25;
            await extractDataFromHtml(
              htmlArray,
              first_fetch,
              changeDate,
              is_frequency
            );
          }
        } else if (type == "proxy") {
          const groupByMarketplaceId = (array) => {
            return array.reduce((acc, currentItem) => {
              const marketplaceId = currentItem.marketplaceId;
              const vendorId = vendors[marketplaceId.toString()].id;
              if (!acc[vendorId]) {
                acc[vendorId] = [];
              }
              acc[vendorId].push(currentItem);
              return acc;
            }, {});
          };

          const batches = groupByMarketplaceId(products);

          await Promise.all(
            Object.entries(batches)?.map(async ([vendorId, batchData]) => {
              let i = 0;
              const proxyDetails = vendors[batchData[0].marketplaceId];
              while (i < batchData.length) {
                console.log("Here");
                const data = batchData.slice(i, i + 2);
                const htmlArray = await fetchDataFromProxy(
                  data,
                  proxyDetails,
                  first_fetch,
                  changeDate,
                  is_frequency
                );
                finalData.push(...htmlArray);
                i += 2;
              }
            })
          );
          // await extractDataFromHtml(finalData);
        } else if (type === "nutristar") {
          let i = 0;
          const proxyDetails = vendors[products[0].marketplaceId];
          console.log("proxy", proxyDetails);
          while (i < products.length) {
            const data = products.slice(i, i + 2);
            const returnData = await extractDataFromNutristar(
              data,
              proxyDetails
            );
            await extractDataFromHtml(
              returnData,
              first_fetch,
              changeDate,
              is_frequency
            );
            i += 2;
          }
        } else if (type == "price_comparision") {
          let i = 0;
          while (i < products.length) {
            const data = products.slice(i, i + 2);
            try {
              await cartlowFetch(data, compare_marketplaces);
            } catch (err) {
              console.log(err);
              i += 2;
              continue;
            }
            i += 2;
          }

          await produceCartlowCSV(batch[0].projectId);
        }

        await job.releaseLock();
        await job.remove();
      } catch (err) {
        console.log(err);
        await job.releaseLock();
        await job.remove();
        await apiCallLog(
          "scrapeQueue",
          "processQueue",
          "QueueManager",
          {},
          {},
          { error: err.message },
          "error"
        );
      }
    });

    //NOTE: Process all HaithiTrust data at once
    // if (haithTrustData.length > 0) {
    //   await retrieveItemsForHaithiTrust({ products: haithTrustData });
    // }
  } catch (err) {
    console.log(err);
    await apiCallLog(
      "scrapeQueue",
      "processQueue",
      "QueueManager",
      {},
      {},
      err,
      "error"
    );
  }
}

async function fetchDataFromAPI(
  data,
  options,
  password,
  first_fetch,
  vendorName = ""
) {
  // Fetch data from API
  try {
    const client = new ScrapingAntClient({ apiKey: password });

    const result = [];

    const retryData = [];
    const flipkartData = [];

    const request = data?.map(async (rowData) => {
      try {
        const marketPlace = await Marketplace.findOne({
          where: { id: rowData.marketplaceId },
          attributes: ["proxy_country", "parentMarketplace"],
        });

        // if (marketPlace.dataValues.parentMarketplace.includes("amazon") && rowData.scrap_count == 2 && (rowData.reason == 'ASIN Not Found' || rowData.reason == 'ASIN Mismatch') || rowData.reason == 'HTML Not Found') {
        //   // await client.scrape(rowData.url, { browser: true, js_snippet: "d2luZG93LnNjcm9sbFRvKDAsZG9jdW1lbnQuYm9keS5zY3JvbGxIZWlnaHQpOw0KYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwMDApKTs=" }).then(async (response) => {
        //   //   result.push({ html: response.content, ...rowData });
        //   //   await uploadToS3(`${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment().add(5, "hours").add(30, "minutes").format("DD_MM_YYYY")}.html`, Buffer.from(response.content))
        //   // });

        //   await fetchDataFromProxy([rowData], { username: "345694b7a88d068c8f61", password: "14cd45ea40373be5", api_url: "gw.dataimpulse.com:823" }, false);
        // } else if (marketPlace.dataValues.parentMarketplace.includes("amazon") && rowData.reason == 'ASIN Mismatch') {

        //   await client.scrape(rowData.url, { browser: true, js_snippet: "d2luZG93LnNjcm9sbFRvKDAsZG9jdW1lbnQuYm9keS5zY3JvbGxIZWlnaHQpOw0KYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwMDApKTs=" }).then(async (response) => {
        //     result.push({ html: response.content, ...rowData });
        //     await uploadToS3(`${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment().add(5, "hours").add(30, "minutes").format("DD_MM_YYYY")}.html`, Buffer.from(response.content))
        //   });

        // }
        // else if (marketPlace.dataValues.parentMarketplace.includes("amazon") && rowData.title != 'Not Found' && rowData.price == 'Not Found' && rowData.reason == 'ASIN Found') {

        //   await fetchDataFromProxy([rowData], { username: "kqahvuvn-rotate", password: "22suvhg9seb1", api_url: "p.webshare.io:80" }, false);

        // }
        // else {

        if (vendorName.includes("scrapeops")) {
          if (options?.premium) {
            const proxyParams = {
              api_key: password,
              url: rowData.url,
              country: "us",
              premium: true,
              bypass: "cloudflare_level_1",
              // residential: true,
              // ...options,
            };

            const proxyUrl =
              "https://proxy.scrapeops.io/v1/?" + qs.stringify(proxyParams);
            const requestOptions = {
              uri: proxyUrl,
              timeout: 120000,
            };

            await rp(requestOptions).then(async (response) => {
              require("fs").writeFileSync("test.html", response);
              result.push({ html: response, ...rowData });
              await uploadToS3(
                `${rowData.domain?.split(".")[0]}_${
                  rowData.asin
                }_scrapeops_${moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
                response
              );
            });
          } else {
            const proxyParams = {
              api_key: "c77f33db-de31-4b51-9416-dd149b605b7a",
              url: rowData.url,
              country:
                marketPlace?.dataValues?.proxy_country[rowData.scrap_count] ??
                "us",
              // bypass: "cloudflare_level_1"
            };

            const proxyUrl =
              "https://proxy.scrapeops.io/v1/?" + qs.stringify(proxyParams);
            const requestOptions = {
              uri: proxyUrl,
              timeout: 120000,
            };

            await rp(requestOptions).then(async (response) => {
              result.push({ html: response, ...rowData });
              await uploadToS3(
                `${rowData.domain?.split(".")[0]}_${
                  rowData.asin
                }_scrapeops_${moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
                response
              );
            });
          }
        } else if (
          marketPlace.dataValues.parentMarketplace.includes("flipkart") ||
          (marketPlace.dataValues.parentMarketplace.includes("amazon") &&
            rowData.scrap_count >= 2)
        ) {
          // Using ScrapeOps
          const proxyParams = {
            api_key: "c77f33db-de31-4b51-9416-dd149b605b7a",
            url: rowData.url,
            country:
              marketPlace?.dataValues?.proxy_country[rowData.scrap_count] ??
              "US",
            // bypass: "cloudflare_level_1"
          };

          const proxyUrl =
            "https://proxy.scrapeops.io/v1/?" + qs.stringify(proxyParams);
          const requestOptions = {
            uri: proxyUrl,
            timeout: 120000,
          };

          await rp(requestOptions).then(async (response) => {
            result.push({ html: response, ...rowData });
            await uploadToS3(
              `${rowData.domain?.split(".")[0]}_${
                rowData.asin
              }_scrapeops_${moment()
                .add(5, "hours")
                .add(30, "minutes")
                .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
              response
            );
          });
        } else if (
          marketPlace.dataValues.parentMarketplace.includes("hathitrust")
        ) {
          await client
            .scrape(rowData.url, {
              ...options,
              return_page_source: true,
              proxy_country:
                marketPlace?.dataValues?.proxy_country[rowData.scrap_count] ??
                "US",
              // return_page_source: true,
            })
            .then(async (response) => {
              result.push({ html: response.content, ...rowData });

              await uploadToS3(
                `${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
                Buffer.from(response.content)
              );
            });
        } else {
          // Using ScrapingAnt
          await client
            .scrape(rowData.url, {
              ...options,
              proxy_country:
                marketPlace?.dataValues?.proxy_country?.[rowData.scrap_count] ??
                "IN",
              // return_page_source: true,
            })
            .then(async (response) => {
              result.push({ html: response.content, ...rowData });

              await uploadToS3(
                `${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
                Buffer.from(response.content)
              );
            });
        }
        // }
      } catch (err) {
        console.log("Error", err);
        result.push({ html: "", ...rowData });
      }
    });

    await Promise.all(request);

    // if (retryData.length > 0) {
    //   console.log("retryData", retryData.length);
    //   retryWithScrapfly(retryData, first_fetch);
    // }

    // if (flipkartData.length > 0) {
    //   await retryQueue.add({ data: flipkartData, first_fetch });
    // }

    return result;
  } catch (error) {
    console.error("Error in fetching data from API:", error.message);
    await apiCallLog(
      "scrapeQueue",
      "fetchDataFromAPI",
      "fetchDataFromAPI",
      {},
      {},
      error,
      "error"
    );
    newRelic.recordCustomEvent("APIError", { error: error.message });
  }
}

async function fetchDataFromProxy(
  data,
  proxyDetails,
  first_fetch,
  changeDate,
  is_frequency
) {
  // Fetch data from Proxy
  let browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--proxy-server=http://" + proxyDetails.api_url,
      "--disabled-setupid-sandbox",
    ],
    headless: true,
    waitForInitialPage: 10000,
  });
  try {
    // const proxy = getNextProxy(proxyDetails.proxy);
    const result = [];

    await Promise.map(
      data,
      async (rowData) => {
        // for (var i = 0; i < data.length; i++) {

        // const rowData = data[i];
        let page;
        try {
          page = await browser.newPage();
          await page.authenticate({
            username: proxyDetails.username,
            password: proxyDetails.password,
          });
        } catch (err) {
          await browser.close();
          console.log(err);
          const pushdata = { html: "", ...rowData };
          result.push(pushdata);
          return result;
        }

        try {
          console.log(rowData.url);
          await page.goto(rowData.url, {
            ...proxyDetails.options,
            timeout: 60000,
          });
          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          await delay(5000);
        } catch (err) {
          await browser.close();
          console.log(err);
          result.push({ html: "", ...rowData });
          return;
        }
        const marketplace = await Marketplace.findOne({
          where: { id: rowData.marketplaceId },
        });
        if (marketplace) {
          if (
            xpaths[marketplace.dataValues.parentMarketplace].waitForSelectors
          ) {
            await Promise.all(
              Object.entries(
                xpaths[marketplace.dataValues.parentMarketplace]
                  .waitForSelectors
              ).map(async ([key, value]) => {
                for (let i = 0; i < value.length; i++) {
                  // Check if the page has a "See All Buying Options" button
                  const seeAllBuyingOptions = value[i];
                  console.log(seeAllBuyingOptions);
                  // await page.waitForSelector(seeAllBuyingOptionsXPath);
                  if (key === "buttonClick") {
                    // Wait for the "See All Buying Options" button to be visible and click it
                    const seeAllBuyingOptionsButton = await page.$(
                      seeAllBuyingOptions
                    );
                    if (seeAllBuyingOptionsButton) {
                      const button = await page.$(seeAllBuyingOptions); // get the first button in the page
                      if (button) {
                        // if the button exists
                        await button.click(); // click the button
                        await page.waitForNavigation({
                          waitUntil: "domcontentloaded",
                        }); // wait for the page to load
                        await waiting(5000);
                      }
                    }
                  } else {
                    const seeAllBuyingOptionsButton = await page.$(
                      seeAllBuyingOptions
                    );
                    if (seeAllBuyingOptionsButton) {
                      await page.waitForSelector(seeAllBuyingOptions, {
                        visibile: true,
                      });
                    }
                  }
                }
              })
            );
          }

          try {
            const response = await page.content();
            await uploadToS3(
              `${rowData.domain?.split(".")[0]}_${rowData.asin}_${moment()
                .add(5, "hours")
                .add(30, "minutes")
                .format("DD_MM_YYYY")}.html`,
              Buffer.from(response)
            );
            result.push({ html: response, ...rowData });
            await page.close();
          } catch (err) {
            console.log(err);
            result.push({ html: "", ...rowData });
            await page.close();
          }
        }
      },
      { concurrency: data.length }
    );

    // await Promise.all(request);
    await browser.close();
    await extractDataFromHtml(result, first_fetch, changeDate, is_frequency);

    return result;
  } catch (error) {
    await browser.close();
    console.error("Error in fetching data from Proxy:", error);
    await apiCallLog(
      "scrapeQueue",
      "fetchDataFromProxy",
      "fetchDataFromProxy",
      {},
      {},
      error,
      "error"
    );
    newRelic.recordCustomEvent("ProxyError", { error: error.message });
  }
}

async function extractDataFromHtml(
  htmlBatchData,
  first_fetch,
  changeDate,
  is_frequency
) {
  console.log("Extracting data from HTML", changeDate);
  try {
    if (htmlBatchData.length > 0) {
      const finalData = [];
      const timedData = [];

      const projectDetail = await Project.findOne({
        where: { id: htmlBatchData[0].projectId },
      });

      const projectMandatoryAttr =
        projectDetail.dataValues.mandatory_attributes;
      console.log(projectMandatoryAttr);

      for (let i = 0; i < htmlBatchData.length; i++) {
        let html = htmlBatchData[i].html;

        const marketplace = await Marketplace.findOne({
          where: { id: parseInt(htmlBatchData[i].marketplaceId) },
        });

        const data = {
          id: htmlBatchData[i].id,
          isScraped: htmlBatchData[i].isScraped || true,
          marketplaceId: marketplace.dataValues.id,
        };

        if (!html || html === "") {
          data.isScraped = false;
          data.scrap_count =
            htmlBatchData[i].scrap_count + 1 == 4
              ? 0
              : htmlBatchData[i].scrap_count + 1;
          data.marketplaceId = marketplace.dataValues.id;
          data.projectId = htmlBatchData[i].projectId;
          data.asin = htmlBatchData[i].asin;
          data.url = htmlBatchData[i].url;
          data.domain = htmlBatchData[i].domain;
          data.pushed_in_queue = false;
          data.is_failed = data.scrap_count == 0 ? true : false;
          data.reason = "HTML Not Found";
          if (data.scrap_count >= 3) {
            console.log(
              "Before Timed Product Fetch",
              moment().add(5, "hours").add(30, "minutes")
            );
            const prevData = await TimedAttributes.findOne({
              where: {
                unique_product_id: htmlBatchData[i].id.toString(),
                price: { [Op.notIn]: ["Not Found", "OOS"] },
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .subtract(1, "days")
                  .format("YYYY-MM-DD"),
              },
            });
            console.log(
              "Before Timed Product Fetch",
              moment().add(5, "hours").add(30, "minutes")
            );
            if (prevData) {
              data.mrp = prevData.dataValues.mrp;
              data.price = prevData.dataValues.price;
              data.title = prevData.dataValues.title;
              data.seller = prevData.dataValues.seller;
              data.brand = prevData.dataValues.brand;
              data.reason = "ASIN Found";
              data.is_failed = true;
              data.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
            } else {
              data.title = "Not Found";
              data.mrp = "Not Found";
              data.price = "Not Found";
              data.brand = "Not Found";
              data.seller = "Not Found";
              data.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
              data.is_failed = true;
            }
          } else {
            data.title = "Not Found";
            data.mrp = "Not Found";
            data.price = "Not Found";
            data.brand = "Not Found";
            data.seller = "Not Found";
            data.is_failed = false;
          }
          finalData.push(data);
          continue;
        }
        let marketplaceXpaths =
          xpaths[marketplace.dataValues.parentMarketplace].xpaths;
        const $ = cheerio.load(html);
        let doc;
        try {
          // Extract data from html
          // const timeoutPromise = new Promise((resolve, reject) => {
          //   setTimeout(() => {
          //     reject(new Error('Timeout exceeded'));
          //   }, 2000);
          // });

          // const parsePromise = new Promise((resolve, reject) => {
          //   setTimeout(() => {
          //     try {

          //       resolve();
          //     } catch (error) {
          //       reject(error);
          //     }
          //   }, 1000);
          //   reject(new Error('Parsing failed'));
          // });

          // await Promise.race([timeoutPromise, parsePromise])
          //   .then(() =>
          // if (!marketplace.dataValues.parentMarketplace.includes("healthxp")) {
          doc = new dom({ errorHandler: function () {} }).parseFromString(
            $.xml()
          );
          // Code after parsing the HTML
          let oufOfStock = false;

          Object.entries(marketplaceXpaths).map(([key, value]) => {
            for (let j = 0; j < value.length; j++) {
              let nodes = xpath.select(value[j], doc);

              // Special handling for "pages" in HathiTrust
              if (
                key == "pages" &&
                marketplace.dataValues.parentMarketplace.includes("hathi")
              ) {
                const totalSeqMatch = html.match(
                  /HT\.params\.totalSeq\s*=\s*(\d+);/
                );
                const totalSeqValue =
                  totalSeqMatch?.length > 0 ? totalSeqMatch[1] : 0;

                data.pages = totalSeqValue;
                continue;
              }

              if (nodes.length > 0) {
                let values =
                  nodes[0]?.textContent?.toString()?.trim() != ""
                    ? nodes[0].textContent?.toString().trim()
                    : "Not Found";

                // Clean up brand for Amazon
                if (
                  key == "brand" &&
                  marketplace.dataValues.parentMarketplace.includes("amazon")
                ) {
                  values = values.replace("Visit the", "").replace("Store", "");
                }
                // Clean up brand for Blinkit
                if (
                  key == "brand" &&
                  marketplace.dataValues.parentMarketplace.includes("blinkit")
                ) {
                  values = values.replace("View all by", "");
                }

                // Parse attributes for Meesho
                if (
                  key == "attributes" &&
                  marketplace.dataValues.parentMarketplace.includes("meesho")
                ) {
                  const obj = {};
                  values = [];
                  nodes.forEach((element) => {
                    const text = element.textContent.trim();
                    const parts = text.split("\u00a0:\u00a0");
                    if (parts.length === 2) {
                      obj[parts[0]] = parts[1];
                    }
                  });
                  values.push(obj);
                }

                // Collect image sources for Meesho
                if (
                  key == "images" &&
                  marketplace.dataValues.parentMarketplace.includes("meesho")
                ) {
                  values = [];
                  nodes.forEach((img) => {
                    const src = img.getAttribute("src");
                    if (src) {
                      values.push(src);
                    }
                  });
                }

                // Collect image sources for Amazon
                if (
                  key == "images" &&
                  marketplace.dataValues.parentMarketplace.includes("amazon")
                ) {
                  values = [];
                  nodes.forEach((img) => {
                    const src = img.getAttribute("src");
                    if (src) {
                      values.push(src);
                    }
                  });
                }

                // Boolean flags for certain keys
                if (
                  key == "aplus_content" ||
                  key == "highlights" ||
                  key == "limited_time_deal" ||
                  key == "flipkart_assured"
                ) {
                  values =
                    values || values != "" || values != null ? true : false;
                }

                // Boolean flag for video_tag on Amazon/Flipkart
                if (
                  key == "video_tag" &&
                  (marketplace.dataValues.parentMarketplace.includes(
                    "amazon"
                  ) ||
                    marketplace.dataValues.parentMarketplace.includes(
                      "flipkart"
                    ))
                ) {
                  values = values || values != null ? true : false;
                }

                // Count for image_count and variant
                if (key == "image_count" || key == "variant") {
                  values = nodes.length;
                }

                // Parse and clean up ratings/reviews
                if (
                  (key == "totalRatings" ||
                    key == "totalReviews" ||
                    key == "rating") &&
                  (marketplace.dataValues.parentMarketplace.includes(
                    "meesho"
                  ) ||
                    marketplace.dataValues.parentMarketplace.includes(
                      "amazon"
                    ) ||
                    marketplace.dataValues.parentMarketplace.includes(
                      "flipkart"
                    ) ||
                    marketplace.dataValues.parentMarketplace.includes(
                      "firstcry"
                    ) ||
                    marketplace.dataValues.parentMarketplace.includes("shopsy"))
                ) {
                  values =
                    values || values != "" || values != null
                      ? parseFloat(
                          values
                            .toLowerCase()
                            .replace("&", "")
                            .replace("ratings", "")
                            .replace("reviews", "")
                            .replace("global ratings", "")
                            .replace(",", "")
                            .trim()
                        )
                      : "";
                }

                // Clean up brand for Blinkit (again, in case of multiple passes)
                if (
                  key == "brand" &&
                  marketplace.dataValues.parentMarketplace.includes("blinkit")
                ) {
                  values = values.replace("View all by", "");
                }

                // Clean up price/mrp
                if (key === "price" || key === "mrp") {
                  values = values.replace("per item").replace(/[,$€£¥₹]/g, "");
                  values = values.replaceAll("Rs.", "").trim();
                  values = values.replaceAll("Rs", "").trim();
                  values = values.replaceAll("from", "").trim();
                  values = values == "Currently Unavailable" ? "OOS" : values;
                }

                // Join all node texts for category/description
                if (key === "category" || key === "description") {
                  values = nodes
                    .map((item) => item.textContent.toString().trim())
                    .join(":");
                }

                // Out-of-stock detection for oosCond (not Meesho/Nutrabay)
                if (
                  key === "oosCond" &&
                  values &&
                  values.trim().length > 0 &&
                  !marketplace.dataValues.parentMarketplace.includes(
                    "meesho"
                  ) &&
                  !marketplace.dataValues.parentMarketplace.includes("nutrabay")
                ) {
                  oufOfStock = true;
                }
                // Out-of-stock detection for oosCond (Nutrabay)
                if (
                  key === "oosCond" &&
                  values &&
                  values.trim().length > 0 &&
                  marketplace.dataValues.parentMarketplace.includes(
                    "nutrabay"
                  ) &&
                  !marketplace.dataValues.parentMarketplace.includes("meesho")
                ) {
                  if (values.trim().toLowerCase() == "out of stock!") {
                    oufOfStock = true;
                  }
                }

                // Extract technical info for Amazon attributes/otherAttributes
                let techInfo = {};
                if (
                  (key === "attributes" || key === "otherAttributes") &&
                  marketplace.dataValues.parentMarketplace.includes("amazon")
                ) {
                  if (nodes.length === 1) {
                    const th = xpath.select(
                      marketplaceXpaths.SpecsInnerXpaths.key,
                      nodes[0]
                    );
                    const td = xpath.select(
                      marketplaceXpaths.SpecsInnerXpaths.value,
                      nodes[0]
                    );
                    if (th.length > 0 && td.length > 0) {
                      const keyArr = th.map((item) =>
                        item.textContent.toString().trim()
                      );
                      const valueArr = td.map((item) =>
                        item.textContent.toString().trim()
                      );
                      if (keyArr.length > 0 && valueArr.length > 0) {
                        for (var l = 0; l < keyArr.length; l++) {
                          techInfo[keyArr[l]] = valueArr[l];
                        }
                      }
                    }
                  } else if (nodes.length > 1) {
                    for (let k = 0; k < nodes.length; k++) {
                      const th = xpath.select(
                        marketplaceXpaths.SpecsInnerXpaths.key,
                        nodes[k]
                      );
                      const td = xpath.select(
                        marketplaceXpaths.SpecsInnerXpaths.value,
                        nodes[k]
                      );
                      if (th.length > 0 && td.length > 0) {
                        const keyArr = th.map((item) =>
                          item.textContent.toString().trim()
                        );
                        const valueArr = td.map((item) =>
                          item.textContent.toString().trim()
                        );
                        if (keyArr.length > 0 && valueArr.length > 0) {
                          for (var l = 0; l < keyArr.length; l++) {
                            techInfo[keyArr[l]] = valueArr[l];
                          }
                        }
                      }
                    }
                  }
                  values = [techInfo];
                }

                // Set the value in the data object, with fallback for arrays
                if (
                  key == "attributes" ||
                  key == "otherAttributes" ||
                  key == "images"
                ) {
                  data[key] =
                    !values || values == "" || values == null ? [] : values;
                } else {
                  data[key] =
                    !values || values == "" || values == null
                      ? "Not Found"
                      : values;
                }
                values = values.toString();
                break;
              } else {
                // If no nodes found, set default values
                if (
                  key == "attributes" ||
                  key == "otherAttributes" ||
                  key == "images"
                ) {
                  data[key] = [];
                } else if (key != "pages") {
                  data[key] = "Not Found";
                }
                // Special handling for Meesho's oosCond
                if (
                  key == "oosCond" &&
                  marketplace.dataValues.parentMarketplace.includes("meesho")
                ) {
                  console.log("In OOS Condition");
                  oufOfStock = true;
                }
              }
            }
          });

          if (data.pages == "Not Found") {
            data.pages = 0;
          }

          data.image_count =
            data.image_count == "Not Found" ? 0 : data.image_count;
          data.totalRatings =
            data.totalRatings == "Not Found" ? 0 : data.totalRatings;
          data.totalReviews =
            data.totalReviews == "Not Found" ? 0 : data.totalReviews;
          data.rating = data.rating == "Not Found" ? 0 : data.rating;
          data.aplus_content =
            !data.aplus_content ||
            (data.aplus_content == "Not Found" &&
              marketplace.dataValues?.parentMarketplace?.includes("amazon"))
              ? false
              : true;
          data.highlights =
            !data.highlights || data.highlights == "Not Found" ? false : true;
          data.limited_time_deal =
            !data.limited_time_deal || data.limited_time_deal == "Not Found"
              ? false
              : true;
          data.flipkart_assured =
            !data.flipkart_assured ||
            (data.flipkart_assured == "Not Found" &&
              marketplace?.dataValues?.parentMarketplace?.includes("flipkart"))
              ? false
              : true;

          if (
            (!data.mrp || data.mrp == "" || data.mrp == "Not Found") &&
            data.price != "" &&
            data.price != "Not Found"
          ) {
            data.mrp = data.price;
          }

          if (
            oufOfStock &&
            (data.price == "" || data.price == "Not Found") &&
            !marketplace.dataValues.parentMarketplace.includes("meesho")
          ) {
            data.price = "OOS";
            data.reason = "Out Of Stock";
            delete data.oosCond;
          }

          if (
            oufOfStock &&
            marketplace.dataValues.parentMarketplace.includes("swiggy")
          ) {
            data.price = "OOS";
            data.reason = "Out Of Stock";
            delete data.oosCond;
          }

          if (
            oufOfStock &&
            (marketplace.dataValues.parentMarketplace.includes("meesho") ||
              marketplace.dataValues.parentMarketplace.includes("nutrabay"))
          ) {
            data.price = "OOS";
            data.reason = "Out Of Stock";
            delete data.oosCond;
          }

          if (
            marketplace.dataValues.parentMarketplace.includes("amazon") &&
            htmlBatchData[i].reason != "ASIN Mismatch"
          ) {
            if (data.asin && data.asin != "Not Found") {
              if (!data.asin.includes(htmlBatchData[i].asin)) {
                data.mrp = "Not Found";
                data.price = "Not Found";
                data.reason = "ASIN Mismatch";
              } else {
                data.reason = "ASIN Found";
              }
            } else {
              data.reason = "ASIN Not Found";
              data.mrp = "Not Found";
              data.price = "Not Found";
            }
          } else if (
            marketplace.dataValues.parentMarketplace.includes("amazon") &&
            htmlBatchData[i].reason == "ASIN Mismatch"
          ) {
            if (data.asinCheck && data.asinCheck != "Not Found") {
              if (!data.asinCheck.includes(htmlBatchData[i].asin)) {
                data.mrp = "Not Found";
                data.price = "Not Found";
                data.reason = "ASIN Mismatch";
              } else {
                data.reason = "ASIN Found";
              }
            } else {
              data.reason = "ASIN Not Found";
              data.mrp = "Not Found";
              data.price = "Not Found";
            }
          }

          if (data.video_tag == "Not Found") {
            data.video_tag = false;
          } else {
            data.video_tag = true;
          }

          if (
            marketplace.dataValues.parentMarketplace?.includes("firstcry") &&
            data.price != "Not Found"
          ) {
            data.price =
              data.price +
              (data.decimal != "Not Found" ? `.${data.decimal}` : ".00");
          }

          if (
            data.mrp == "Not Found" &&
            data.price == "Not Found" &&
            htmlBatchData[i].scrap_count >= 3
          ) {
            const prevData = await TimedAttributes.findOne({
              where: {
                unique_product_id: htmlBatchData[i].id.toString(),
                price: { [Op.notIn]: ["Not Found", "OOS"] },
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .subtract(1, "days")
                  .format("YYYY-MM-DD"),
              },
            });
            if (prevData) {
              data.mrp = prevData.dataValues.mrp;
              data.price = prevData.dataValues.price;
              data.title = prevData.dataValues.title;
              data.seller = prevData.dataValues.seller;
              data.brand = prevData.dataValues.brand;
            }
          }

          let validateJSON = validate(
            marketplace.dataValues.mandatory_attributes_1st
          );
          if (htmlBatchData[i].scrap_count >= 1 && !first_fetch) {
            validateJSON = validate(
              marketplace.dataValues.mandatory_attributes_nth
            );
          }
          if (projectMandatoryAttr) {
            const porject_validate = validate(projectMandatoryAttr);

            if (validateJSON(data) && porject_validate(data)) {
              data.isScraped = true;
              data.scrap_count = 0;
              data.marketplaceId = marketplace.dataValues.id;
              data.projectId = htmlBatchData[i].projectId;
              data.asin = htmlBatchData[i].asin;
              data.url = htmlBatchData[i].url;
              data.domain = htmlBatchData[i].domain;
              data.pushed_in_queue = false;
              data.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
              finalData.push(data);
              timedData.push({
                unique_product_id: htmlBatchData[i].id,
                title: data.title,
                price: data.price,
                mrp: data.mrp,
                brand: data.brand,
                seller: data.seller,
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("YYYY-MM-DD"),
              });
              data.is_failed = false;
              data.to_be_scraped = is_frequency == true ? true : false;
            } else {
              let scrapCount = htmlBatchData[i].scrap_count + 1;
              data.isScraped = false;
              data.scrap_count = scrapCount >= 4 ? 0 : ++scrapCount;
              data.marketplaceId = marketplace.dataValues.id;
              data.projectId = htmlBatchData[i].projectId;
              data.asin = htmlBatchData[i].asin;
              data.url = htmlBatchData[i].url;
              data.domain = htmlBatchData[i].domain;
              data.pushed_in_queue = false;
              data.nextFetch =
                data.scrap_count == 0
                  ? changeDate
                    ? moment()
                        .add(5, "hours")
                        .add(30, "minutes")
                        .add(1, "days")
                        .format("YYYY-MM-DD")
                    : moment()
                        .add(5, "hours")
                        .add(30, "minutes")
                        .format("YYYY-MM-DD")
                  : null;
              data.is_failed = scrapCount >= 4 ? true : false;
              data.to_be_scraped =
                is_frequency == true || !data.is_failed ? true : false;
              finalData.push(data);
              timedData.push({
                unique_product_id: htmlBatchData[i].id,
                title: data.title,
                price: data.price,
                mrp: data.mrp,
                brand: data.brand,
                seller: data.seller,
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("YYYY-MM-DD"),
              });
            }
          } else {
            if (validateJSON(data)) {
              data.isScraped = true;
              data.scrap_count = 0;
              data.marketplaceId = marketplace.dataValues.id;
              data.projectId = htmlBatchData[i].projectId;
              data.asin = htmlBatchData[i].asin;
              data.url = htmlBatchData[i].url;
              data.domain = htmlBatchData[i].domain;
              data.pushed_in_queue = false;
              data.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
              finalData.push(data);
              timedData.push({
                unique_product_id: htmlBatchData[i].id,
                title: data.title,
                price: data.price,
                mrp: data.mrp,
                brand: data.brand,
                seller: data.seller,
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("YYYY-MM-DD"),
              });
              data.is_failed = false;
              data.to_be_scraped = is_frequency == true ? true : false;
            } else {
              let scrapCount = htmlBatchData[i].scrap_count + 1;
              data.isScraped = false;
              data.scrap_count = scrapCount >= 4 ? 0 : ++scrapCount;
              data.marketplaceId = marketplace.dataValues.id;
              data.projectId = htmlBatchData[i].projectId;
              data.asin = htmlBatchData[i].asin;
              data.url = htmlBatchData[i].url;
              data.domain = htmlBatchData[i].domain;
              data.pushed_in_queue = false;
              data.nextFetch =
                data.scrap_count == 0
                  ? changeDate
                    ? moment()
                        .add(5, "hours")
                        .add(30, "minutes")
                        .add(1, "days")
                        .format("YYYY-MM-DD")
                    : moment()
                        .add(5, "hours")
                        .add(30, "minutes")
                        .format("YYYY-MM-DD")
                  : null;
              data.is_failed = scrapCount >= 4 ? true : false;
              data.to_be_scraped =
                is_frequency == true || !data.is_failed ? true : false;
              finalData.push(data);
              timedData.push({
                unique_product_id: htmlBatchData[i].id,
                title: data.title,
                price: data.price,
                mrp: data.mrp,
                brand: data.brand,
                seller: data.seller,
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("YYYY-MM-DD"),
              });
            }
          }

          // }
          // .catch((error) =>
          // else if (marketplace.dataValues.parentMarketplace.includes("healthxp")) {
          //   // Handle the error
          //   const doc = new JSDOM(html).window.document;
          //   let marketplaceSelectors = xpaths[marketplace.dataValues.parentMarketplace].querySelectors;

          //   Object.entries(marketplaceSelectors).map(([key, value]) => {
          //     for (let i = 0; i < value.length; i++) {
          //       const values = doc?.querySelector(value[i])?.textContent;
          //       data[key] = values.replace(/[,$€£¥₹]/g, "");
          //       break;
          //     }
          //   });
          //   if (!data.mrp && data.price) {
          //     data.mrp = data.price;
          //   }
          //   let validateJSON = validate(marketplace.dataValues.mandatory_attributes_1st);
          //   if (htmlBatchData[i].scrapCount >= 1) {
          //     validateJSON = validate(marketplace.dataValues.mandatory_attributes_nth);
          //   }

          //   if (validateJSON(data)) {
          //     data.isScraped = true;
          //     data.scrap_count = htmlBatchData[i].scrap_count + 1;
          //     data.marketplaceId = htmlBatchData[i].marketplaceId;
          //     data.projectId = htmlBatchData[i].projectId;
          //     data.asin = htmlBatchData[i].asin;
          //     data.url = htmlBatchData[i].url;
          //     data.domain = htmlBatchData[i].domain;
          //     data.pushed_in_queue = false;
          //     finalData.push(data);
          //   } else {
          //     data.isScraped = false;
          //     data.scrap_count = htmlBatchData[i].scrap_count + 1;
          //     data.marketplaceId = htmlBatchData[i].marketplaceId;
          //     data.projectId = htmlBatchData[i].projectId;
          //     data.asin = htmlBatchData[i].asin;
          //     data.url = htmlBatchData[i].url;
          //     data.domain = htmlBatchData[i].domain;
          //     data.pushed_in_queue = false;
          //     finalData.push(data);
          //   }

          // };
        } catch (err) {
          console.log(err);
          let scrapCount = htmlBatchData[i].scrap_count + 1;
          data.title = "Not Found";
          data.price = "Not Found";
          data.mrp = "Not Found";
          data.scrap_count = scrapCount >= 4 ? 0 : ++scrapCount;
          data.marketplaceId = marketplace.dataValues.id;
          data.projectId = htmlBatchData[i].projectId;
          data.asin = htmlBatchData[i].asin;
          data.url = htmlBatchData[i].url;
          data.domain = htmlBatchData[i].domain;
          data.isScraped = false;
          data.pushed_in_queue = false;
          data.is_failed = scrapCount >= 4 ? true : false;
          data.to_be_scraped =
            is_frequency == true || !data.is_failed ? true : false;
          await ScratchProducts.bulkCreate([data], {
            updateOnDuplicate: [
              "isScraped",
              "mrp",
              "price",
              "scrap_count",
              "totalRatings",
              "totalReviews",
              "rating",
              "bestSellersRank",
              "attributes",
              "price",
              "mrp",
              "category",
              "pushed_in_queue",
              "nextFetch",
              "is_failed",
              "reason",
              "to_be_scraped",
            ],
          });
          continue;
        }
      }

      if (finalData.length > 0) {
        console.log(finalData);
        if (first_fetch == true) {
          await ScratchProducts.bulkCreate(finalData, {
            updateOnDuplicate: [
              "reason",
              "flipkart_assured",
              "aplus_content",
              "highlights",
              "image_count",
              "limited_time_deal",
              "variant",
              "video_tag",
              "pages",
              "dimensions",
              "image",
              "images",
              "isScraped",
              "mrp",
              "price",
              "scrap_count",
              "totalRatings",
              "totalReviews",
              "rating",
              "bestSellersRank",
              "attributes",
              "price",
              "mrp",
              "category",
              "pushed_in_queue",
              "seller",
              "nextFetch",
              "is_failed",
              "title",
              "brand",
              "bestSellerRankCategoryOne",
            ],
          });
        } else {
          console.log(
            "In Else Product Create",
            moment().add(5, "hours").add(30, "minutes")
          );
          await ScratchProducts.bulkCreate(finalData, {
            updateOnDuplicate: [
              "reason",
              "flipkart_assured",
              "aplus_content",
              "highlights",
              "image_count",
              "limited_time_deal",
              "variant",
              "video_tag",
              "pages",
              "dimensions",
              "image",
              "images",
              "isScraped",
              "mrp",
              "price",
              "scrap_count",
              "totalRatings",
              "totalReviews",
              "rating",
              "bestSellersRank",
              "attributes",
              "price",
              "mrp",
              "category",
              "pushed_in_queue",
              "nextFetch",
              "is_failed",
              "seller",
              "bestSellerRankCategoryOne",
              "to_be_scraped",
            ],
          });
          // await ScratchProducts.bulkCreate(finalData, { updateOnDuplicate: ["reason", "flipkart_assured", "aplus_content", "highlights", "image_count", "limited_time_deal", "variant", "video_tag", "pages", "dimensions", "image", "images", "isScraped", "scrap_count", "totalRatings", "totalReviews", "rating", "bestSellersRank", "attributes", "category", "pushed_in_queue", "nextFetch", "is_failed", "seller", "bestSellerRankCategoryOne"] });
          //   // await ScratchProducts.bulkCreate(finalData, { updateOnDuplicate: ["rating", "totalRating", "totalReviews"] });
        }
        // mailCsv(finalData, "aditya@mergekart.com");
      }

      if (timedData.length > 0) {
        await TimedAttributes.bulkCreate(timedData, {
          updateOnDuplicate: ["title", "price", "mrp", "brand", "seller"],
        });
      }
    }

    return finalData || [];
  } catch (error) {
    console.error("Error in extracting data from html:", error);
    await apiCallLog(
      "scrapeQueue",
      "extractDataFromHtml",
      "extractDataFromHtml",
      {},
      {},
      error,
      "error"
    );
    newRelic.recordCustomEvent("ExtractingError", { error: error.message });
  }
}

async function searchPageExtractor(batch) {
  try {
    const finalData = [];

    for (var i = 0; i < batch.length; i++) {
      require("fs").writeFileSync(`${batch[i].asin}.html`, batch[i].html);
      const marketplace = await Marketplace.findOne({
        where: { id: batch[i].marketplaceId },
      });
      // console.log(marketplace.dataValues.parentMarketplace);
      const searchXpath =
        xpaths[marketplace.dataValues.parentMarketplace].searchXpath;
      // console.log("Xpath:", searchXpath);
      const $ = cheerio.load(batch[i].html);

      const xmlDom = new dom().parseFromString($.xml(), "text/xml");

      const functionString = searchXpath.functionString;
      console.log("Function String:", functionString);
      const extractDataFunction = new Function(
        "xmlDoc",
        "xpath",
        functionString
      );

      const extractedData = await extractDataFunction(xmlDom, xpath);
      finalData.push(...extractedData);
    }

    return finalData || [];
  } catch (err) {
    console.error("Error in searchPageExtractor:", err);
    await apiCallLog(
      "searchPageExtractor",
      "searchPageExtractor",
      "searchPageExtractor",
      {},
      {},
      { error: err.message },
      "error"
    );
    newRelic.recordCustomEvent("SearchPageExtractorError", {
      error: err.message,
    });
    throw new Error("Failed to extract search page data");
  }
}

async function extractDataFromNutristar(batch, proxyDetails) {
  try {
    // const proxy = getNextProxy(proxyDetails.proxy);
    if (batch.length > 0) {
      console.log("Here");
      const finalData = [];
      for (var i = 0; i < batch.length; i++) {
        const item = batch[i];

        const link = item.url;
        console.log(link);
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
          console.log(err);
          if (browser != null) {
            await browser.close();
          }
          finalData.push({
            html: "",
            ...item,
          });
          continue;
        }
        // console.log(proxy.proxy)
        // Navigate to the webpage
        try {
          await page.goto(link, { ...proxyDetails.options, timeout: 60000 });
          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          await delay(10000);
        } catch (err) {
          console.log(err);
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

        // const select = xpath.waitForSelectors.select[0];
        // try {
        //   await page.waitForSelector(select, { visible: true, timeout: 2000 });
        // } catch (err) {
        //   console.log(err);
        //   finalData.push({
        //     html: await page.content(),
        //     ...item
        //   });
        //   await browser.close();
        //   continue;
        // }

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
            console.log(err);
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
          console.log(spans.length);
          if (item.variant) {
            for (var j = 0; j < spans.length; j++) {
              const span = spans[j];

              const spanText = await page.evaluate(
                (span) => span.textContent,
                span
              );
              console.log(spanText.replace("Flavour", ""));
              if (spanText.replace("Flavour", "") == item.variant) {
                // const button = await page.$(
                //   "#root > div.main-content > section.product-detail-main.bg-white > div.container-fluid.w-80.mb-4 > div > div.row.px-md-3.px-xl-4.py-3.py-md-3.h-100.mt-5 > div.col-12.col-lg-5.mb-3.mb-lg-0.product-detail-right > div > div.col-12.col-xl-8.mb-4.mt-3 > div > button"
                // );
                // await button.click();
                found = true;
                const clicker = await page.$(
                  `label[for="template--22742776938790__main-flavor-opt-${j}"]`
                );
                await clicker.click();
                // Add a delay if necessary
                setTimeout(() => {}, 5000);

                // Get the HTML content
                const htmlContent = await page.content();

                await browser.close();

                finalData.push({
                  html: htmlContent,
                  ...item,
                  flavor: spanText,
                });
                break;
                // Use xmldom to parse the HTML content
                // const parser = new dom();
                // const xmlDoc = parser.parseFromString(htmlContent, 'text/html');

                // const title = xmlDoc.getElementsByTagName("h1", xmlDoc);
                // const actualTitle = Array.from(title).map(item => {
                //   if (item.getAttribute("class") === xpath.xpaths.title[0]) return item.textContent
                // })

                // const pr = Array.from(xmlDoc.getElementsByClassName(xpath.xpaths.price[0]))[0].textContent;
                // const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(item => item.getAttribute("class") == xpath.xpaths.brand[0])
                // // Use xpath to extract data from the HTML
                // const mrp = Array.from(xmlDoc.getElementsByTagName(xpath.xpaths.mrp[0]));

                // data.title = actualTitle[0];
                // data.price = pr.replace(/[.,$€£¥₹]/g, "");
                // data.flavour = spanText;
                // data.mrp = mrp[0].textContent.replace(/[.,$€£¥₹]/g, "");
                // data.brand = brand.textContent;
                // console.log(data)
                // let validateJSON = validate(marketplace.dataValues.mandatory_attributes_1st);
                // if (item.scrapCount >= 1) {
                //   validateJSON = validate(marketplace.dataValues.mandatory_attributes_nth);
                // }

                // if (!data.mrp && data.price) {
                //   data.mrp = data.price;
                // }

                // if (validateJSON(data)) {
                //   data.isScraped = true;
                //   data.scrap_count = item.scrap_count + 1;
                //   data.marketplaceId = item.marketplaceId;
                //   data.projectId = item.projectId;
                //   data.asin = item.asin;
                //   data.url = item.url;
                //   data.domain = item.domain;
                //   finalData.push(data);
                // } else {
                //   data.isScraped = false;
                //   data.scrap_count = item.scrap_count + 1;
                //   data.marketplaceId = item.marketplaceId;
                //   data.projectId = item.projectId;
                //   data.asin = item.asin;
                //   data.url = item.url;
                //   data.domain = item.domain;
                //   finalData.push(data);
                // }
              }

              // existingData.push(...finalData);

              // fs.writeFile("nutristar.json", JSON.stringify(existingData), "utf-8", () => {
              //     console.log("Done");
              // });
            }
            if (!found) {
              // Get the HTML content
              const htmlContent = await page.content();
              finalData.push({
                html: htmlContent,
                ...item,
                flavor: "Not Found",
              });
              await browser.close();
              // // Use xmldom to parse the HTML content
              // const parser = new DOMParser();
              // const xmlDoc = parser.parseFromString(htmlContent, 'text/html');

              // const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(item => item.getAttribute("class") == "f-rob-med f-16")

              // finalData.push({
              //     Index: j,
              //     Title: splitArray[j].Title,
              //     Price: "N/A",
              //     Flavour: splitArray[j].Flavour,
              //     MRP: "N/A",
              //     URL: link,
              //     Brand: brand.textContent,
              //     SKU: splitArray[j]['SKU Code']
              // })
            }
          } else {
            const span = spans[0];
            const spanSelector = xpath.waitForSelectors.spanSelector[0];
            try {
              await page.waitForSelector(spanSelector, {
                visible: true,
                timeout: 2000,
              });
            } catch (err) {
              console.log(err);
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
            found = true;
            await span.click();
            // Add a delay if necessary
            setTimeout(() => {}, 5000);

            // Get the HTML content
            const htmlContent = await page.content();
            await browser.close();

            finalData.push({ html: htmlContent, ...item, flavor: spanText });

            // Use xmldom to parse the HTML content
            // const parser = new dom();
            // const xmlDoc = parser.parseFromString(htmlContent, 'text/html');

            // const title = xmlDoc.getElementsByTagName("h1", xmlDoc);
            // const actualTitle = Array.from(title).map(item => {
            //   if (item.getAttribute("class") === xpath.xpaths.title[0]) return item.textContent
            // })

            // const pr = Array.from(xmlDoc.getElementsByClassName(xpath.xpaths.price[0]))[0].textContent;
            // const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(item => item.getAttribute("class") == xpath.xpaths.brand[0])
            // // Use xpath to extract data from the HTML
            // const mrp = Array.from(xmlDoc.getElementsByTagName(xpath.xpaths.mrp[0]));

            // data.title = actualTitle[0];
            // data.price = pr?.replace(/[.,$€£¥₹]/g, "");
            // data.flavour = spanText;
            // data.mrp = mrp[0].textContent?.replace(/[.,$€£¥₹]/g, "");
            // data.brand = brand.textContent;
            // console.log(data)
            // let validateJSON = validate(marketplace.dataValues.mandatory_attributes_1st);
            // if (item.scrapCount >= 1) {
            //   validateJSON = validate(marketplace.dataValues.mandatory_attributes_nth);
            // }

            // if (!data.mrp && data.price) {
            //   data.mrp = data.price;
            // }

            // if (validateJSON(data)) {
            //   data.isScraped = true;
            //   data.scrap_count = item.scrap_count + 1;
            //   data.marketplaceId = item.marketplaceId;
            //   data.projectId = item.projectId;
            //   data.asin = item.asin;
            //   data.url = item.url;
            //   data.domain = item.domain;
            //   finalData.push(data);
            // } else {
            //   data.isScraped = false;
            //   data.scrap_count = item.scrap_count + 1;
            //   data.marketplaceId = item.marketplaceId;
            //   data.projectId = item.projectId;
            //   data.asin = item.asin;
            //   data.url = item.url;
            //   data.domain = item.domain;
            //   finalData.push(data);
            // }

            // existingData.push(...finalData);

            // fs.writeFile("nutristar.json", JSON.stringify(existingData), "utf-8", () => {
            //     console.log("Done");
            // });
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
            console.log(err);
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

          // Get the HTML content
          const htmlContent = await page.content();
          await browser.close();

          if (item.variant == "Unflavoured") {
            finalData.push({
              html: htmlContent,
              ...item,
              flavor: item.variant,
            });
          } else {
            finalData.push({ html: htmlContent, ...item, flavor: "Not Found" });
          }
          // Use xmldom to parse the HTML content
          // const parser = new dom();
          // const xmlDoc = parser.parseFromString(htmlContent, 'text/html');

          // const title = xmlDoc.getElementsByTagName("h1", xmlDoc);
          // const actualTitle = Array.from(title).map(item => {
          //   if (item.getAttribute("class") === xpath.xpaths.title[0]) return item.textContent
          // })

          // const pr = Array.from(xmlDoc.getElementsByClassName(xpath.xpaths.price[0]))[0].textContent;
          // const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(item => item.getAttribute("class") == xpath.xpaths.brand[0])
          // // Use xpath to extract data from the HTML
          // const mrp = Array.from(xmlDoc.getElementsByTagName(xpath.xpaths.mrp[0]));

          // data.title = actualTitle[0];
          // data.price = pr?.replace(/[.,$€£¥₹]/g, "");
          // data.flavour = "Not found";
          // data.mrp = mrp[0].textContent?.replace(/[.,$€£¥₹]/g, "");
          // data.brand = brand.textContent;

          // let validateJSON = validate(marketplace.dataValues.mandatory_attributes_1st);
          // if (item.scrapCount >= 1) {
          //   validateJSON = validate(marketplace.dataValues.mandatory_attributes_nth);
          // }

          // if (!data.mrp && data.price) {
          //   data.mrp = data.price;
          // }

          // if (validateJSON(data)) {
          //   data.isScraped = true;
          //   data.scrap_count = item.scrap_count + 1;
          //   data.marketplaceId = item.marketplaceId;
          //   data.projectId = item.projectId;
          //   data.asin = item.asin;
          //   data.url = item.url;
          //   data.domain = item.domain;
          //   data.pushed_in_queue = true;
          //   finalData.push(data);
          // } else {
          //   data.isScraped = false;
          //   data.scrap_count = item.scrap_count + 1;
          //   data.marketplaceId = item.marketplaceId;
          //   data.projectId = item.projectId;
          //   data.asin = item.asin;
          //   data.url = item.url;
          //   data.domain = item.domain;
          //   data.pushed_in_queue = false;
          //   finalData.push(data);
          // }

          // existingData.push(...finalData);
        }
        // await ScratchProducts.bulkCreate(finalData, { updateOnDuplicate: ["isScraped", "mrp", "price", "scrap_count", "totalRatings", "totalReviews", "rating", "bestSellersRank", "brand", "attributes", "title", "price", "mrp", "category", "pushed_in_queue"] });
      }

      return finalData;
    }
  } catch (err) {
    console.log(err);
    await apiCallLog(
      "scrapeQueue",
      "extractDataFromNutristar",
      "extractDataFromNutristar",
      {},
      {},
      err,
      "error"
    );
  }
}

async function extractNutristarHTML(data, first_fetch, changeDate) {
  try {
    console.log(data[0].marketplaceId);
    if (data.length > 0) {
      const finalData = [];
      const timedData = [];
      const marketplace = await Marketplace.findOne({
        where: { id: data[0].marketplaceId },
      });
      const res = data.map(async (item) => {
        await uploadToS3(
          `${item.domain?.split(".")[0]}_${item.asin}_${moment()
            .add(5, "hours")
            .add(30, "minutes")
            .format("DD_MM_YYYY")}.html`,
          Buffer.from(item.html)
        );

        const obj = {
          id: item.id,
          isScraped: item.isScraped || true,
        };
        if (item.html === "") {
          obj.isScraped = false;
          obj.scrap_count = item.scrap_count + 1;
          obj.marketplaceId = marketplace.dataValues.id;
          obj.projectId = item.projectId;
          obj.asin = item.asin;
          obj.url = item.url;
          obj.domain = item.domain;
          obj.pushed_in_queue = false;
          if (obj.scrap_count >= 3) {
            const prevData = await TimedAttributes.findOne({
              where: {
                unique_product_id: item.id.toString(),
                price: { [Op.notIn]: ["Not Found", "OOS"] },
                scrap_date: moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .subtract(1, "days")
                  .format("YYYY-MM-DD"),
              },
            });
            if (prevData) {
              obj.mrp = prevData.dataValues.mrp;
              obj.price = prevData.dataValues.price;
              obj.title = item.title;
              obj.seller = prevData.dataValues.seller;
              obj.brand = item.brand;
              obj.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
              obj.is_failed = true;
            } else {
              obj.title = item.title;
              obj.mrp = item.mrp;
              obj.price = item.price;
              obj.brand = item.brand;
              obj.seller = item.seller;
              obj.nextFetch = changeDate
                ? moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .add(1, "days")
                    .format("YYYY-MM-DD")
                : moment()
                    .add(5, "hours")
                    .add(30, "minutes")
                    .format("YYYY-MM-DD");
              obj.is_failed = true;
            }
          } else {
            obj.title = "Not Found";
            obj.mrp = "Not Found";
            obj.price = "Not Found";
            obj.brand = "Not Found";
            obj.seller = "Not Found";
            obj.is_failed = false;
          }
          finalData.push(obj);
          return;
        } else if (item.flavor && item.flavor == "Not Found") {
          const parser = new dom();
          const xmlDoc = parser.parseFromString(item.html, "text/html");

          const xpath = xpaths[marketplace.dataValues.parentMarketplace];

          const title = xmlDoc.getElementsByTagName("h1", xmlDoc);
          const actualTitle = Array.from(title).map((ti) => {
            if (ti.getAttribute("class") === xpath.xpaths.title[0])
              return ti.textContent;
          });

          const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(
            (br) => br.getAttribute("class") == xpath.xpaths.brand[0]
          );

          obj.title = actualTitle[0] || "Not Found";
          obj.price = "Not Found";
          obj.flavour =
            item.flavor?.replace("Flavour", "")?.trim() || "Not Found";
          obj.mrp = "Not Found";
          obj.brand = brand?.textContent || "Not Found";
          obj.isScraped = true;
          obj.scrap_count =
            item.scrap_count + 1 == 4 ? 0 : item.scrap_count + 1;
          obj.marketplaceId = marketplace.dataValues.id;
          obj.projectId = item.projectId;
          obj.asin = item.asin;
          obj.url = item.url;
          obj.domain = item.domain;
          obj.pushed_in_queue = false;
          obj.is_failed = false;
          obj.nextFetch = changeDate
            ? moment()
                .add(5, "hours")
                .add(30, "minutes")
                .add(1, "days")
                .format("YYYY-MM-DD")
            : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD");
          finalData.push(obj);
          timedData.push({
            unique_product_id: item.id,
            title: obj.title,
            price: obj.price,
            mrp: obj.mrp,
            brand: obj.brand,
          });
        } else {
          const parser = new dom();
          const xmlDoc = parser.parseFromString(item.html, "text/html");

          const xpath = xpaths[marketplace.dataValues.parentMarketplace];

          const title = xmlDoc.getElementsByTagName("h1", xmlDoc);
          const actualTitle = Array.from(title).map((ti) => {
            if (ti.getAttribute("class") === xpath.xpaths.title[0])
              return ti.textContent;
          });

          const pr = Array.from(
            xmlDoc.getElementsByClassName(xpath.xpaths.price[0])
          )[0]?.textContent;
          const brand = Array.from(xmlDoc.getElementsByTagName("h4")).find(
            (br) => br.getAttribute("class") == xpath.xpaths.brand[0]
          );
          // Use xpath to extract data from the HTML
          const mrp = Array.from(
            xmlDoc.getElementsByTagName(xpath.xpaths.mrp[0])
          );

          const oosCond = Array.from(
            xmlDoc.getElementsByClassName(xpath.xpaths.oosCond[0])
          )[0]?.textContent;

          obj.title = actualTitle[0] ?? "Not Found";
          obj.price = pr?.replace(/[,$€£¥₹]/g, "") ?? "Not Found";
          obj.flavour =
            item.flavor?.replace("Flavour", "")?.trim() ?? "Not Found";
          obj.mrp = mrp[0]?.textContent.replace(/[,$€£¥₹]/g, "") ?? "Not Found";
          obj.brand = brand?.textContent ?? "Not Found";

          if (oosCond && oosCond.trim() == "Out of Stock") {
            obj.price = "OOS";
          }

          let validateJSON = validate(
            marketplace.dataValues.mandatory_attributes_1st
          );
          if (item.scrapCount >= 1) {
            validateJSON = validate(
              marketplace.dataValues.mandatory_attributes_nth
            );
          }

          if (!obj.mrp && obj.price) {
            obj.mrp = obj.price;
          }

          if (validateJSON(data)) {
            obj.isScraped = true;
            obj.scrap_count =
              item.scrap_count + 1 == 4 ? 0 : item.scrap_count + 1;
            obj.marketplaceId = marketplace.dataValues.id;
            obj.projectId = item.projectId;
            obj.asin = item.asin;
            obj.url = item.url;
            obj.domain = item.domain;
            obj.pushed_in_queue = false;
            obj.is_failed = false;
            obj.nextFetch = changeDate
              ? moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .add(1, "days")
                  .format("YYYY-MM-DD")
              : moment()
                  .add(5, "hours")
                  .add(30, "minutes")
                  .format("YYYY-MM-DD");
            finalData.push(obj);
            timedData.push({
              unique_product_id: item.id,
              title: obj.title,
              price: obj.price,
              mrp: obj.mrp,
              brand: obj.brand,
            });
          } else {
            obj.isScraped = false;
            obj.scrap_count =
              item.scrap_count + 1 == 4 ? 0 : item.scrap_count + 1;
            obj.marketplaceId = marketplace.dataValues.id;
            obj.projectId = item.projectId;
            obj.asin = item.asin;
            obj.url = item.url;
            obj.domain = item.domain;
            obj.pushed_in_queue = false;
            obj.nextFetch =
              obj.scrap_count == 0
                ? changeDate
                  ? moment()
                      .add(5, "hours")
                      .add(30, "minutes")
                      .add(1, "days")
                      .format("YYYY-MM-DD")
                  : moment()
                      .add(5, "hours")
                      .add(30, "minutes")
                      .format("YYYY-MM-DD")
                : null;
            obj.is_failed = obj.scrap_count == 4 ? true : false;
            finalData.push(obj);
            timedData.push({
              unique_product_id: item.id,
              title: obj.title,
              price: obj.price,
              mrp: obj.mrp,
              brand: obj.brand,
            });
          }
        }
      });

      await Promise.all(res);
      if (first_fetch == true) {
        await ScratchProducts.bulkCreate(finalData, {
          updateOnDuplicate: [
            "isScraped",
            "mrp",
            "price",
            "scrap_count",
            "totalRatings",
            "totalReviews",
            "rating",
            "bestSellersRank",
            "attributes",
            "price",
            "mrp",
            "category",
            "pushed_in_queue",
            "seller",
            "nextFetch",
            "is_failed",
            "title",
            "brand",
          ],
        });
      } else {
        await ScratchProducts.bulkCreate(finalData, {
          updateOnDuplicate: [
            "isScraped",
            "mrp",
            "price",
            "scrap_count",
            "totalRatings",
            "totalReviews",
            "rating",
            "bestSellersRank",
            "attributes",
            "price",
            "mrp",
            "category",
            "pushed_in_queue",
            "seller",
            "nextFetch",
            "is_failed",
          ],
        });
      }
      // mailCsv(finalData, "aditya@mergekart.com");
      if (timedData.length > 0) {
        await TimedAttributes.bulkCreate(timedData);
      }
    }
  } catch (err) {
    console.log(err);
  }
}

// (async function () {
//   try {

//     const mongoProject = await queueData.findById("6821be34d06b3885754d7e32")

//     // console.log(mongoProject.queueData);

//     const products = await ScratchProducts.findAll({
//       where: {
//         id: {
//           [Op.in]: mongoProject.queueData
//         }
//       },
//       attributes: ["id", "url", "domain", "marketplaceId", "scrap_count", "nextFetch", "pushed_in_queue", "isScraped", "is_failed", "projectId"]
//     });

//     let i = 0;

//     while (i < products.length) {
//       console.log("index", i)
//       const batch = products.slice(i, i + 25).map((item) => item.dataValues);
//       const res = await fetchDataFromAPI(
//         batch,
//         { premium: false },
//         "c77f33db-de31-4b51-9416-dd149b605b7a",
//         false,
//         "scrapeops.io"
//       );
//       await extractDataFromHtml(res, false, true);
//       i += 25;
//     }

//   } catch (err) {
//     console.log(err);
//   }
// }())

// (async function () {
//   const data = await ScratchProducts.findAll({
//     where: {
//       projectId: { [Op.in]: [237] },
//       marketplaceId: { [Op.in]: [23] },
//       // url: "https://smytten.com/shop/product/dermarollers/silkshave-body-razor-and-face-razor-combo-pack-for-women-1-body-razor-1-face-razor-5-stainless-steel-blade-with-aloe-vera-and-vit-e-lubrating/HYN0022AB8"
//       // rating: { [Op.eq]: null },
//       // price: "Not Found",
//       // pushed_in_queue: true
//       // title: null
//     },
//     // limit: 1
//   });
//   let i = 0;
//   console.log(data.length);
//   while (i < data.length) {
//     console.log(i)
//     const batch = data.slice(i, i + 50).map((item) => item.dataValues);
//     const res = await fetchDataFromAPI(
//       batch,
//       {
//         premium: true,
//        },
//       "c77f33db-de31-4b51-9416-dd149b605b7a",
//       false,
//       "scrapeops.io"
//     );
//     await extractDataFromHtml(res, true, true);
//     i += 50;
//   }
// })();

// (async function () {
//   const data = await ScratchProducts.findAll({
//     where: {
//       projectId: { [Op.in]: [242] },
//       // title: null,
//       // pushed_in_queue: true
//       marketplaceId: { [Op.in]: [25, 29] },
//       // image_count: null,
//       // asin: 'HVZY22M0'
//       // price: "Not Found"
//     },
//     // limit: 200,
//   });
//   let i = 0;
//   console.log(data.length)
//   while (i < data.length) {
//     console.log(i);
//     const batch = data.slice(i, i + 10).map((item) => item.dataValues);
//     const res = await fetchDataFromProxy(
//       batch,
//       {
//         username: "kqahvuvn-rotate",
//         password: "22suvhg9seb1",
//         api_url: "p.webshare.io:80",
//       },
//       true,
//       false
//     );
//     // await extractDataFromHtml(res, false, false);
//     i += 10;
//   }
// })();

// (async function () {
//   const data = await ScratchProducts.findAll({
//     where: {
//       projectId: { [Op.in]: [227] },
//       // pushed_in_queue: true
//     marketplaceId: { [Op.in]: [12] },
//       price: "Not Found"
//     },
//     limit: 200,
//   });
//   let i = 0;
//   console.log(data.length)
//   while (i < data.length) {
//     console.log(i);
//     const batch = data.slice(i, i + 2).map((item) => item.dataValues);
//     const res = await extractDataFromNutristar(
//       batch,
//       {
//         username: "kqahvuvn-rotate",
//         password: "22suvhg9seb1",
//         api_url: "p.webshare.io:80",
//       },
//       true,
//       false
//     );
//     // await extractData/FromHtml(res, false, false);
//     i += 2;
//   }
// })();

async function waiting(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function cartlowFetch(data, compare_marketplaces) {
  try {
    const amazonData = [];
    const noonData = [];
    const revibeData = [];
    const client = new ScrapingAntClient({
      apiKey: "3b03950ccb7e41ff9f66b98c8eb1e190",
    });
    for (var i = 0; i < data.length; i++) {
      const rowData = data[i];
      const { id, asin, title, brand, storage, ram, model, variant } = rowData;
      let searchTitle = title;
      try {
        const searchParams = encodeURIComponent(`${searchTitle} - Renewed`);
        let html = "";
        try {
          const amazonRes = await client.scrape(
            `https://www.amazon.ae/s?k=${searchParams}&ref=nb_sb_noss`,
            { browser: false, proxy_country: "US" }
          );
          html = amazonRes.content;
          await uploadToS3(
            `Cartlow_Amazon_${asin}_${moment()
              .add(5, "hours")
              .add(30, "minutes")
              .format("DD_MM_YYYY")}.html`,
            Buffer.from(amazonRes.content)
          );
        } catch (err) {
          console.log(err);
          amazonData.push({
            asin,
            title,
            brand,
            storage,
            ram,
            model,
            variant,
            projectId: rowData.projectId,
            marketplaceId: "19",
            price: "Not Found",
          });
          html = "";
        }
        if (html != "") {
          let config = {
            method: "post",
            maxBodyLength: Infinity,
            url: "https://api.amazon.com/auth/o2/token?grant_type=refresh_token&client_id=amzn1.application-oa2-client.7cd12d52b00f4ac0946e1ac66e56c0ac&client_secret=amzn1.oa2-cs.v1.5ab3ced86c99d776f38b3c5380ff8c3294f790b713efe336ad48488b9e16464c&refresh_token=Atzr|IwEBIE4rn-Em1sUlc9DLiI_HPQdXpJOrOQNvp_kgsULrXqIotv6-9scbNGN-bP7IGhewqw6o4SSwDVPOO8v936GKfxhZOUR2RoNNehTulI9B__jmdvnu12ucO3WLicFVJNI4QDfG7_43mMMJNO_3p2k0Yc_sS_T4BdfRyKqplzPmaMY9i76SZ9c8GcHtiGiM3mhIeC7AiAOr0z0T3eGR9OpJR_YAOewBk5GKVLzK1VIRWJN_6B1fJ8kUZ1uAHEQTeFGP-gDPXv2Ol0_RWhCv1wpzyWC-W1WH1cKYZJ8umyeyP8qxaF1qo2KtmnGQUa4K3Jn15sqbT3DCrgRiRFDKjPdCVqDk",
            headers: {},
          };
          let token;
          await axios
            .request(config)
            .then((response) => {
              console.log(response.data);
              token = response.data.access_token;
            })
            .catch((error) => {
              console.log(error);
            });
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const dom = new DOMParser().parseFromString($.xml(), "text/xml");
          const nodes = xpath.select(
            "//div[@class='a-section a-spacing-base']",
            dom
          );
          nodes.map(async (item) => {
            let found = false;
            let title = xpath.select1(
              ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']",
              item
            ).textContent;
            title = title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            if (model?.toLowerCase().includes("iphone")) {
              const split = title.split(
                model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
              );
              const regex = new RegExp(
                model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
                "i"
              );
              if (
                (title.includes("renewed") || title.includes("refurbished")) &&
                regex.test(title) &&
                title.includes(
                  storage?.toLowerCase().replace("gb", "").trim()
                ) &&
                title.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                )
              ) {
                found = true;
                const price = xpath.select1(
                  ".//span[@class='a-price-whole']",
                  item
                );
                const decimal = xpath.select1(
                  ".//span[@class='a-price-fraction']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='a-price-symbol']",
                  item
                );
                const url = xpath.select1(
                  ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']/a",
                  item
                );
                const prodId = url.getAttribute("href")?.match(/dp\/([^/]+)/);
                let is_competitor = false;
                if (prodId?.length > 0) {
                  let config = {
                    method: "get",
                    maxBodyLength: Infinity,
                    url:
                      "https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/" +
                      prodId[1] +
                      "?marketplaceIds=A2VIGQ35RCS4UG&includedData=summaries&locale=en_US",
                    headers: {
                      Accept: "application/json",
                      "x-amz-access-token": token,
                    },
                  };
                  await axios
                    .request(config)
                    .then((response) => {
                      if (response.data.summaries.length > 0) {
                        const brand = response.data.summaries[0].brand;
                        if (brand == "Apple" || brand == "Amazon Renewed") {
                          is_competitor = true;
                        }
                      }
                    })
                    .catch((error) => {
                      console.log(error);
                    });
                }

                const obj = {
                  asin,
                  title: title,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: !isNaN(
                    parseFloat(
                      price?.textContent.replace(",", "") + decimal?.textContent
                    )
                  )
                    ? price?.textContent.replace(",", "") + decimal?.textContent
                    : "Not Found",
                  currency: currency?.textContent,
                  projectId: rowData.projectId,
                  marketplaceId: "19",
                  url: `https://www.amazon.ae${url?.getAttribute("href")}`,
                  is_competitor:
                    is_competitor &&
                    split[1] &&
                    !/\bpro\b/.test(split[1]) &&
                    !split[1]?.includes("promax") &&
                    !split[1]?.includes("max") &&
                    !split[1]?.includes("mini")
                      ? true
                      : false,
                };
                amazonData.push(obj);
              }
            } else if (model?.toLowerCase().includes("macbook")) {
              if (
                (title.includes("renewed") || title.includes("refurbished")) &&
                (title.includes(
                  model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  title.includes("2020macbookpro")) &&
                title.includes(storage?.toLowerCase().trim()) &&
                (title.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  title.includes(variant?.toUpperCase()))
              ) {
                found = true;
                const price = xpath.select1(
                  ".//span[@class='a-price-whole']",
                  item
                );
                const decimal = xpath.select1(
                  ".//span[@class='a-price-fraction']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='a-price-symbol']",
                  item
                );
                const url = xpath.select1(
                  ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']/a",
                  item
                );
                const prodId = url?.getAttribute("href")?.match(/dp\/([^/]+)/)
                  ? url?.getAttribute("href")?.match(/dp\/([^/]+)/)[1]
                  : "";
                let is_competitor = false;
                if (prodId?.length > 0) {
                  let config = {
                    method: "get",
                    maxBodyLength: Infinity,
                    url:
                      "https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/" +
                      prodId +
                      "?marketplaceIds=A2VIGQ35RCS4UG&includedData=summaries&locale=en_US",
                    headers: {
                      Accept: "application/json",
                      "x-amz-access-token": token,
                    },
                  };
                  await axios
                    .request(config)
                    .then((response) => {
                      if (response.data.summaries.length > 0) {
                        const brand = response.data.summaries[0].brand;
                        if (brand == "Apple" || brand == "Amazon Renewed") {
                          is_competitor = true;
                        }
                      }
                    })
                    .catch((error) => {
                      console.log(error);
                    });
                }
                const obj = {
                  asin,
                  title: title,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: !isNaN(
                    parseFloat(
                      price?.textContent.replace(",", "") + decimal?.textContent
                    )
                  )
                    ? price?.textContent.replace(",", "") + decimal?.textContent
                    : "Not Found",
                  currency: currency?.textContent,
                  projectId: rowData.projectId,
                  marketplaceId: "19",
                  url: `https://www.amazon.ae${url?.getAttribute("href")}`,
                  is_competitor: is_competitor,
                };
                amazonData.push(obj);
              }
            } else {
              if (
                (title.includes("renewed") || title.includes("refurbished")) &&
                (title.includes(
                  model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  title.includes("t440thinkpad")) &&
                title.includes(storage?.toLowerCase().trim()) &&
                (title.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  title.includes(variant?.toUpperCase())) &&
                title.includes(ram?.toLowerCase().trim())
              ) {
                found = true;
                const price = xpath.select1(
                  ".//span[@class='a-price-whole']",
                  item
                );
                const decimal = xpath.select1(
                  ".//span[@class='a-price-fraction']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='a-price-symbol']",
                  item
                );
                const url = xpath.select1(
                  ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']/a",
                  item
                );
                const prodId = url?.getAttribute("href")?.match(/dp\/([^/]+)/)
                  ? url?.getAttribute("href")?.match(/dp\/([^/]+)/)[1]
                  : "";
                let is_competitor = false;
                if (prodId?.length > 0 && model.includes("iphone")) {
                  let config = {
                    method: "get",
                    maxBodyLength: Infinity,
                    url:
                      "https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/" +
                      prodId +
                      "?marketplaceIds=A2VIGQ35RCS4UG&includedData=summaries&locale=en_US",
                    headers: {
                      Accept: "application/json",
                      "x-amz-access-token": token,
                    },
                  };
                  await await axios
                    .request(config)
                    .then((response) => {
                      if (response.data.summaries.length > 0) {
                        const brand = response.data.summaries[0].brand;
                        if (brand == "Apple" || brand == "Amazon Renewed") {
                          is_competitor = true;
                        }
                      }
                    })
                    .catch((error) => {
                      console.log(error);
                    });
                }
                const obj = {
                  asin,
                  title: title,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: !isNaN(
                    parseFloat(
                      price?.textContent.replace(",", "") + decimal?.textContent
                    )
                  )
                    ? price?.textContent.replace(",", "") + decimal?.textContent
                    : "Not Found",
                  currency: currency?.textContent,
                  projectId: rowData.projectId,
                  marketplaceId: "19",
                  url: `https://www.amazon.ae${url?.getAttribute("href")}`,
                  is_competitor: is_competitor,
                };
                amazonData.push(obj);
              }
            }
            if (!found) {
              const price = xpath.select1(
                ".//span[@class='a-price-whole']",
                item
              );
              const decimal = xpath.select1(
                ".//span[@class='a-price-fraction']",
                item
              );
              const currency = xpath.select1(
                ".//span[@class='a-price-symbol']",
                item
              );
              const url = xpath.select1(
                ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']/a",
                item
              );
              const obj = {
                asin,
                title: title,
                brand: brand,
                storage: storage,
                ram: ram,
                model: model,
                variant: variant,
                price: !isNaN(
                  parseFloat(
                    price?.textContent.replace(",", "") + decimal?.textContent
                  )
                )
                  ? price?.textContent.replace(",", "") + decimal?.textContent
                  : "Not Found",
                currency: currency?.textContent,
                projectId: rowData.projectId,
                marketplaceId: "19",
                url: `https://www.amazon.ae${url?.getAttribute("href")}`,
                is_competitor: false,
              };
              amazonData.push(obj);
            }
          });
        }
        try {
          html = "";
          // const browser = await puppeteer.launch({
          //   headless: true,
          //   args: [
          //     "--no-sandbox",
          //     "--disable-setuid-sandbox",
          //   ]
          // });
          // const page = await browser.newPage();
          // await page.goto(`https://www.noon.com/uae-en/search/?q=${searchParams}`, { waitUntil: "domcontentloaded", timeout: 0 });
          const res = await client.scrape(
            `https://www.noon.com/uae-en/search/?q=${searchParams}`,
            { browser: true, proxy_country: "AE" }
          );
          html = res.content;
          await uploadToS3(
            `Cartlow_Noon_${asin}_${moment()
              .add(5, "hours")
              .add(30, "minutes")
              .format("DD_MM_YYYY")}.html`,
            Buffer.from(res.content)
          );
        } catch (err) {
          console.log(err);
          noonData.push({
            asin,
            title,
            brand,
            storage,
            ram,
            model,
            variant,
            price: "Not Found",
            projectId: rowData.projectId,
            marketplaceId: "20",
          });
          html = "";
        }
        if (html != "") {
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const dom = new DOMParser().parseFromString($.xml(), "text/xml");
          const nodes = xpath.select(
            "//div[@class='ProductBoxLinkHandler_linkWrapper__b0qZ9']",
            dom
          );
          nodes.map((item) => {
            let found = false;
            // console.log(item.getAttribute('title'));
            const select = xpath.select1(
              ".//h2[@class='ProductDetailsSection_title__JorAV']",
              item
            );
            let link = select?.getAttribute("title");
            link = link?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            if (model?.toLowerCase().includes("iphone")) {
              const split = link.split(
                model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
              );
              const regex = new RegExp(model.replace(/[^a-zA-Z0-9]/g, ""), "i");
              if (
                (link?.includes("renewed") || link?.includes("refurbished")) &&
                regex.test(link) &&
                link?.includes(
                  storage?.toLowerCase().replace("gb", "").trim()
                ) &&
                (link?.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  link?.includes(variant?.toUpperCase()))
              ) {
                found = true;
                const price = xpath.select1(
                  ".//strong[@class='Price_amount__2sXa7']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='Price_currency__taKQj']",
                  item
                );
                const url = xpath.select1(".//a", item);
                noonData.push({
                  asin,
                  title: link,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: price?.textContent.replace(",", "") ?? "Not Found",
                  currency: currency?.textContent ?? "Not Found",
                  projectId: rowData.projectId,
                  marketplaceId: "20",
                  url: `https://www.noon.com${url?.getAttribute("href")}`,
                  is_competitor:
                    split[1] &&
                    !split[1]?.includes("pro") &&
                    !split[1]?.includes("promax") &&
                    !split[1]?.includes("max") &&
                    !split[1]?.includes("mini")
                      ? true
                      : false,
                });
              }
            } else if (model?.toLowerCase().includes("macbook")) {
              if (
                (link?.includes("renewed") || link?.includes("refurbished")) &&
                (link?.includes(
                  model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  link?.includes("2020macbookpro")) &&
                link?.includes(storage?.toLowerCase().trim()) &&
                (link?.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  link?.includes(variant?.toUpperCase()))
              ) {
                found = true;
                const price = xpath.select1(
                  ".//strong[@class='Price_amount__2sXa7']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='Price_currency__taKQj']",
                  item
                );
                const url = xpath.select1(".//a", item);
                noonData.push({
                  asin,
                  title: link,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: price?.textContent.replace(",", "") ?? "Not Found",
                  currency: currency?.textContent ?? "Not Found",
                  projectId: rowData.projectId,
                  marketplaceId: "20",
                  url: `https://www.noon.com${url?.getAttribute("href")}`,
                  is_competitor: true,
                });
              }
            } else {
              if (
                (link?.includes("renewed") || link?.includes("refurbished")) &&
                (link?.includes(
                  model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  link?.includes("t440thinkpad")) &&
                link?.includes(storage?.toLowerCase().trim()) &&
                (link?.includes(
                  variant?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                ) ||
                  link?.includes(variant?.toUpperCase())) &&
                title.includes(ram?.toLowerCase().trim())
              ) {
                found = true;
                const price = xpath.select1(
                  ".//strong[@class='Price_amount__2sXa7']",
                  item
                );
                const currency = xpath.select1(
                  ".//span[@class='Price_currency__taKQj']",
                  item
                );
                const url = xpath.select1(".//a", item);
                noonData.push({
                  asin,
                  title: link,
                  brand: brand,
                  storage: storage,
                  ram: ram,
                  model: model,
                  variant: variant,
                  price: price?.textContent.replace(",", "") ?? "Not Found",
                  currency: currency?.textContent ?? "Not Found",
                  projectId: rowData.projectId,
                  marketplaceId: "20",
                  url: `https://www.noon.com${url?.getAttribute("href")}`,
                  is_competitor: true,
                });
              }
            }
            if (!found) {
              const price = xpath.select1(
                ".//strong[@class='Price_amount__2sXa7']",
                item
              );
              const currency = xpath.select1(
                ".//span[@class='Price_currency__taKQj']",
                item
              );
              const url = xpath.select1(".//a", item);
              noonData.push({
                asin,
                title: link,
                brand: brand,
                storage: storage,
                ram: ram,
                model: model,
                variant: variant,
                price: price.textContent?.replace(",", "") ?? "Not Found",
                currency: currency?.textContent ?? "Not Found",
                url: `https://www.noon.com${url?.getAttribute("href")}`,
                projectId: rowData.projectId,
                marketplaceId: "20",
                is_competitor: false,
              });
            }
          });
        }
        try {
          html = "";
          const res = await client.scrape(
            `https://revibe.me/search?q=${searchTitle.replace(
              " ",
              "+"
            )}&options%5Bprefix%5D=last&filter.v.option.color=${variant?.replace(
              " ",
              "+"
            )}&filter.v.option.storage=${storage
              ?.toLowerCase()
              .replace("gb", "")
              .trim()
              .concat("+GB")}`,
            { browser: false, proxy_country: "AE" }
          );
          html = res.content;
          await uploadToS3(
            `Cartlow_Revibe_${asin}_${moment()
              .add(5, "hours")
              .add(30, "minutes")
              .format("DD_MM_YYYY")}.html`,
            Buffer.from(res.content)
          );
        } catch (err) {
          console.log(err);
          noonData.push({
            asin,
            title,
            brand,
            storage,
            ram,
            model,
            variant,
            price: "Not Found",
            projectId: rowData.projectId,
            marketplaceId: "21",
          });
          html = "";
        }
        if (html != "") {
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const doc = new DOMParser().parseFromString($.xml(), "text/xml");
          const xpath = require("xpath");
          const nodes = xpath.select(
            "//div[@class='card-information__wrapper text-center']",
            doc
          );
          await Promise.all(
            nodes?.map(async (item) => {
              const acTitle = xpath.select1(".//h2", item).textContent;
              const split = acTitle
                ?.replace(/[^a-zA-Z0-9]/g, "")
                .toLowerCase()
                .split(model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
              const regex = new RegExp(
                model.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
                "i"
              );

              if (
                regex.test(acTitle.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
              ) {
                console.log("In product");
                const url = xpath
                  .select1(
                    ".//a[@class='card-title link-underline card-title-ellipsis card-title-change']",
                    item
                  )
                  ?.getAttribute("href");

                try {
                  const priceRes = await client.scrape(
                    "https://revibe.me" + url,
                    { browser: true, proxy_country: "AE" }
                  );

                  const priceCh = cheerio.load(priceRes.content);
                  const priceDoc = new DOMParser().parseFromString(
                    priceCh.xml(),
                    "text/xml"
                  );

                  let is_competitor = false;
                  if (
                    split[1] == "" &&
                    !split[1]?.includes("pro") &&
                    !split[1]?.includes("promax") &&
                    !split[1]?.includes("max") &&
                    !split[1]?.includes("mini") &&
                    !split[1]?.includes("plus")
                  ) {
                    console.log("Competitor Found");
                    is_competitor = true;
                  }

                  const price =
                    xpath.select1(
                      "//label[contains(@class, 'product-form__label')]/span[@class='text' and (contains(text(), 'Very Good') or contains(text(), 'Excellent'))]/span[@class='variant-price-in-box']",
                      priceDoc
                    )?.textContent ??
                    xpath.select1(
                      "//dd[@class='price__last']/h2[@class='price-item price-item--sale']",
                      priceDoc
                    )?.textContent;

                  revibeData.push({
                    asin,
                    title: acTitle.replace(/[^a-zA-Z0-9]/g, "").trim(),
                    url: "https://revibe.me" + url,
                    brand,
                    storage,
                    ram,
                    model,
                    variant,
                    price:
                      price
                        ?.replace("AED ", "")
                        .replace("SAR", "")
                        .replaceAll(",", "")
                        .trim() ?? "Not Found",
                    projectId: rowData.projectId,
                    marketplaceId: "21",
                    is_competitor: is_competitor,
                  });
                } catch (err) {
                  console.log(err);

                  revibeData.push({
                    asin,
                    title: acTitle.replace(/[^a-zA-Z0-9]/g, "").trim(),
                    url: "https://revibe.me" + url,
                    brand,
                    storage,
                    ram,
                    model,
                    variant,
                    price: "Not Found",
                    projectId: rowData.projectId,
                    marketplaceId: "21",
                    is_competitor: false,
                  });
                }
              } else {
                const price = xpath.select1(
                  ".//span[@class='price-item price-item--sale']",
                  item
                ).textContent;
                const url = xpath
                  .select1(
                    ".//a[@class='card-title link-underline card-title-ellipsis card-title-change']",
                    item
                  )
                  ?.getAttribute("href");
                revibeData.push({
                  asin,
                  title: acTitle.replace(/[^a-zA-Z0-9]/g, "").trim(),
                  url: "https://revibe.me" + url,
                  brand,
                  storage,
                  ram,
                  model,
                  variant,
                  price: price?.replace("AED ", "").replaceAll(",", "").trim(),
                  projectId: rowData.projectId,
                  marketplaceId: "21",
                  is_competitor: false,
                });
              }
            })
          );
        }
      } catch (err) {
        console.log(err);
      }

      try {
        await ScratchProducts.update(
          {
            pushed_in_queue: false,
            nextFetch: moment()
              .add(5, "hours")
              .add(30, "minutes")
              .add(1, "days")
              .format("YYYY-MM-DD"),
          },
          { where: { id: id } }
        );
      } catch (err) {
        console.log(err);
      }
    }

    // await Promise.all(result);
    if (amazonData.length > 0) {
      await uploadDataOneByOne(amazonData);
      console.log("All data processed.");
    }
    if (noonData.length > 0) {
      await uploadDataOneByOne(noonData);
      console.log("All data processed.");
    }
    if (revibeData.length > 0) {
      await uploadDataOneByOne(revibeData);
      console.log("All data processed.");
    }
  } catch (err) {
    console.log(err);
    await apiCallLog(
      "scrapeQueue",
      "cartlowFetch",
      "cartlowFetch",
      {},
      {},
      err,
      "error"
    );
  }
}

const uploadDataOneByOne = async (data) => {
  try {
    const result = await ScratchProducts.bulkCreate(data);
    console.log(`Inserted: ${result}`);
  } catch (err) {
    console.error(`Error inserting ${data}:`, err);
  }
};

// (async function () {
//   try {
//     const products = await ScratchProducts.findAll({
//       where: {
//         projectId: "232",
//         owned: true
//       }
//     });

//     let i = 72;

//     while (i < products.length) {
//       const batch  = products.slice(i, i + 2);

//       await cartlowFetch(batch);

//       i += 2;

//       console.log(i, "products processed");

//     }

//   } catch (err) {
//     console.error("Error in main function:", err);
//   }
// }());

async function waiting(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

module.exports = {
  extractDataFromHtml,
  fetchDataFromAPI,
  searchPageExtractor,
};
