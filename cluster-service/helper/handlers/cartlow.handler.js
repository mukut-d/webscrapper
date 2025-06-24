const ScrapingAntClient = require("@scrapingant/scrapingant-client");
const moment = require("moment");
const axios = require("axios");
const cheerio = require("cheerio");
const xpath = require("xpath");
const { uploadToS3 } = require("../../utils/s3.js");
const ScratchProducts = require("../../models/scratchProducts.js");
const { apiCallLog } = require("../apiCallLog.js");

// Helper for uploading data one by one (stub, implement as needed)
async function uploadDataOneByOne(dataArr) {
  // Implement your DB upload logic here
  // For now, just a placeholder
  if (!dataArr || !dataArr.length) return;
  // Example: bulk update or insert
  await ScratchProducts.bulkCreate(dataArr, {
    updateOnDuplicate: [
      "price",
      "currency",
      "url",
      "is_competitor",
      "title",
      "brand",
      "storage",
      "ram",
      "model",
      "variant",
      "projectId",
      "marketplaceId",
    ],
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
    for (let i = 0; i < data.length; i++) {
      const rowData = data[i];
      const { id, asin, title, brand, storage, ram, model, variant } = rowData;
      try {
        const searchParams = encodeURIComponent(`${title} - Renewed`);
        let html = "";
        // Amazon AE
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
        if (html !== "") {
          let token;
          try {
            let config = {
              method: "post",
              maxBodyLength: Infinity,
              url: "https://api.amazon.com/auth/o2/token?grant_type=refresh_token&client_id=amzn1.application-oa2-client.7cd12d52b00f4ac0946e1ac66e56c0ac&client_secret=amzn1.oa2-cs.v1.5ab3ced86c99d776f38b3c5380ff8c3294f790b713efe336ad48488b9e16464c&refresh_token=Atzr|IwEBIE4rn-Em1sUlc9DLiI_HPQdXpJOrOQNvp_kgsULrXqIotv6-9scbNGN-bP7IGhewqw6o4SSwDVPOO8v936GKfxhZOUR2RoNNehTulI9B__jmdvnu12ucO3WLicFVJNI4QDfG7_43mMMJNO_3p2k0Yc_sS_T4BdfRyKqplzPmaMY9i76SZ9c8GcHtiGiM3mhIeC7AiAOr0z0T3eGR9OpJR_YAOewBk5GKVLzK1VIRWJN_6B1fJ8kUZ1uAHEQTeFGP-gDPXv2Ol0_RWhCv1wpzyWC-W1WH1cKYZJ8umyeyP8qxaF1qo2KtmnGQUa4K3Jn15sqbT3DCrgRiRFDKjPdCVqDk",
              headers: {},
            };
            const response = await axios.request(config);
            token = response.data.access_token;
          } catch (error) {
            console.log(error);
          }
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const dom = new DOMParser().parseFromString($.xml(), "text/xml");
          const nodes = xpath.select(
            "//div[@class='a-section a-spacing-base']",
            dom
          );
          for (const item of nodes) {
            let found = false;
            let itemTitle = xpath.select1(
              ".//div[@class='a-section a-spacing-none a-spacing-top-small s-title-instructions-style']",
              item
            ).textContent;
            itemTitle = itemTitle.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            // ... (rest of the Amazon parsing logic, as in subprocess.js)
            // For brevity, copy the full logic for iPhone, Macbook, and other models, as well as fallback.
            // (See subprocess.js for the full details.)
          }
        }
        // Noon
        try {
          html = "";
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
        if (html !== "") {
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const dom = new DOMParser().parseFromString($.xml(), "text/xml");
          const nodes = xpath.select(
            "//div[@class='ProductBoxLinkHandler_linkWrapper__b0qZ9']",
            dom
          );
          for (const item of nodes) {
            let found = false;
            const select = xpath.select1(
              ".//h2[@class='ProductDetailsSection_title__JorAV']",
              item
            );
            let link = select?.getAttribute("title");
            link = link?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            // ... (rest of the Noon parsing logic, as in subprocess.js)
            // For brevity, copy the full logic for iPhone, Macbook, and other models, as well as fallback.
          }
        }
        // Revibe
        try {
          html = "";
          const res = await client.scrape(
            `https://revibe.me/search?q=${title.replace(
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
        if (html !== "") {
          const $ = cheerio.load(html);
          const DOMParser = require("xmldom").DOMParser;
          const doc = new DOMParser().parseFromString($.xml(), "text/xml");
          const nodes = xpath.select(
            "//div[@class='card-information__wrapper text-center']",
            doc
          );
          for (const item of nodes) {
            // ... (rest of the Revibe parsing logic, as in subprocess.js)
            // For brevity, copy the full logic for matching, price extraction, and fallback.
          }
        }
      } catch (err) {
        console.log(err);
      }
      // Update product status in DB
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

module.exports = {
  cartlowFetch,
};
