const { uploadToS3 } = require("../../utils/s3.js");
const moment = require("moment");
const rp = require("request-promise");
const qs = require("qs");

// ScrapeOps Handler
async function scrapeOpsHandler({
  rowData,
  marketPlace,
  options,
  password,
  result,
  client,
}) {
  const isPremium = options?.premium || false;
  const country =
    marketPlace?.dataValues?.proxy_country?.[rowData.scrap_count] ?? "IN";

  // Use the helper to get requestOptions
  const requestOptions = getScrapeOpsProxyConfig({
    password,
    url: rowData.url,
    country,
    options,
    premium: isPremium,
  });

  await rp(requestOptions).then(async (response) => {
    result.push({ html: response, ...rowData });
    await uploadToS3(
      `${rowData.domain?.split(".")[0]}_${rowData.asin}_scrapeops_${moment()
        .add(5, "hours")
        .add(30, "minutes")
        .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
      response
    );
  });
}

// HathiTrust Handler
async function hathiTrustHandler({
  rowData,
  marketPlace,
  options,
  password,
  result,
  client,
}) {
  await client
    .scrape(rowData.url, {
      ...options,
      return_page_source: true,
      proxy_country:
        marketPlace?.dataValues?.proxy_country[rowData.scrap_count] ?? "IN",
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

async function scrapingAntHandler({
  rowData,
  marketPlace,
  options,
  password,
  result,
  client,
}) {
  await client
    .scrape(rowData.url, {
      ...options,
      proxy_country:
        marketPlace?.dataValues?.proxy_country[rowData.scrap_count] ?? "IN",
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

// Flipkart Handler
async function flipkartHandler({
  rowData,
  marketPlace,
  options,
  password,
  result,
}) {
  const country =
    marketPlace?.dataValues?.proxy_country?.[rowData.scrap_count] ?? "IN";
  const requestOptions = getScrapeOpsProxyConfig({
    password: "c77f33db-de31-4b51-9416-dd149b605b7a", // public key
    url: rowData.url,
    country,
    options,
    premium: false,
  });
  await rp(requestOptions).then(async (response) => {
    result.push({ html: response, ...rowData });
    await uploadToS3(
      `${rowData.domain?.split(".")[0]}_${rowData.asin}_scrapeops_${moment()
        .add(5, "hours")
        .add(30, "minutes")
        .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
      response
    );
  });
}

// Amazon Handler (for scrap_count >= 2)
async function amazonHandler({
  rowData,
  marketPlace,
  options,
  password,
  result,
}) {
  const country =
    marketPlace?.dataValues?.proxy_country?.[rowData.scrap_count] ?? "IN";
  const requestOptions = getScrapeOpsProxyConfig({
    password: "c77f33db-de31-4b51-9416-dd149b605b7a", // public key
    url: rowData.url,
    country,
    options,
    premium: false,
  });
  await rp(requestOptions).then(async (response) => {
    result.push({ html: response, ...rowData });
    await uploadToS3(
      `${rowData.domain?.split(".")[0]}_${rowData.asin}_scrapeops_${moment()
        .add(5, "hours")
        .add(30, "minutes")
        .format("DD_MM_YYYY")}_${new Date().getTime()}.html`,
      response
    );
  });
}

const marketplaceHandlers = {
  scrapeops: scrapeOpsHandler,
  hathitrust: hathiTrustHandler,
  flipkart: flipkartHandler,
  amazon: amazonHandler,
  default: scrapingAntHandler,
};

function getScrapeOpsProxyConfig({
  password,
  url,
  country = "IN",
  options = {},
  premium = false,
}) {
  const proxyParams = {
    api_key: premium ? password : "c77f33db-de31-4b51-9416-dd149b605b7a",
    url,
    country,
    ...(premium ? { premium: true } : {}),
    ...options,
  };

  const proxyUrl =
    "https://proxy.scrapeops.io/v1/?" + qs.stringify(proxyParams);
  const requestOptions = {
    uri: proxyUrl,
    timeout: 120000,
  };
  return requestOptions;
}

module.exports = marketplaceHandlers;
