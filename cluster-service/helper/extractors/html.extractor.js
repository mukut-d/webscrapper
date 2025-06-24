const { Op } = require("sequelize");
const moment = require("moment");
const dom = require("xmldom").DOMParser;
const cheerio = require("cheerio");
const xpath = require("xpath");
const validate = require("is-my-json-valid");

/**
 * Handles the case when HTML is empty or not found.
 * Returns the data object to be pushed to finalData.
 */
async function handleEmptyHtml({
  htmlBatchItem,
  marketplace,
  changeDate,
  TimedAttributes,
}) {
  const data = {
    id: htmlBatchItem.id,
    isScraped: false,
    marketplaceId: marketplace.dataValues.id,
    projectId: htmlBatchItem.projectId,
    asin: htmlBatchItem.asin,
    url: htmlBatchItem.url,
    domain: htmlBatchItem.domain,
    pushed_in_queue: false,
    scrap_count:
      htmlBatchItem.scrap_count + 1 == 4 ? 0 : htmlBatchItem.scrap_count + 1,
    is_failed: htmlBatchItem.scrap_count + 1 == 4 ? true : false,
    reason: "HTML Not Found",
  };
  if (data.scrap_count >= 3 && TimedAttributes) {
    const prevData = await TimedAttributes.findOne({
      where: {
        unique_product_id: htmlBatchItem.id.toString(),
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
      data.reason = "ASIN Found";
      data.is_failed = true;
      data.nextFetch = changeDate
        ? moment()
            .add(5, "hours")
            .add(30, "minutes")
            .add(1, "days")
            .format("YYYY-MM-DD")
        : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD");
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
        : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD");
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
  return data;
}

/**
 * Parses HTML and extracts data using xpaths and other logic.
 * Returns the data object to be pushed to finalData.
 */
function parseHtmlAndExtractData({ html, xpaths, marketplace, htmlBatchItem }) {
  const $ = cheerio.load(html);
  const doc = new dom({ errorHandler: function () {} }).parseFromString(
    $.xml()
  );
  let data = {
    id: htmlBatchItem.id,
    isScraped: htmlBatchItem.isScraped || true,
    marketplaceId: marketplace.dataValues.id,
  };
  let oufOfStock = false;
  Object.entries(xpaths).map(([key, value]) => {
    for (let j = 0; j < value.length; j++) {
      let nodes = xpath.select(value[j], doc);
      if (
        key == "pages" &&
        marketplace.dataValues.parentMarketplace.includes("hathi")
      ) {
        const totalSeqMatch = html.match(/HT\.params\.totalSeq\s*=\s*(\d+);/);
        const totalSeqValue = totalSeqMatch?.length > 0 ? totalSeqMatch[1] : 0;
        data.pages = totalSeqValue;
        continue;
      }
      if (nodes.length > 0) {
        let values =
          nodes[0]?.textContent?.toString()?.trim() != ""
            ? nodes[0].textContent?.toString().trim()
            : "Not Found";
        if (
          key == "brand" &&
          marketplace.dataValues.parentMarketplace.includes("amazon")
        ) {
          values = values.replace("Visit the", "").replace("Store", "");
        }
        if (
          key == "brand" &&
          marketplace.dataValues.parentMarketplace.includes("blinkit")
        ) {
          values = values.replace("View all by", "");
        }
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
        if (
          key == "images" &&
          (marketplace.dataValues.parentMarketplace.includes("meesho") ||
            marketplace.dataValues.parentMarketplace.includes("amazon"))
        ) {
          values = [];
          nodes.forEach((img) => {
            const src = img.getAttribute("src");
            if (src) {
              values.push(src);
            }
          });
        }
        if (
          key == "aplus_content" ||
          key == "highlights" ||
          key == "limited_time_deal" ||
          key == "flipkart_assured"
        ) {
          values = values || values != "" || values != null ? true : false;
        }
        if (
          key == "video_tag" &&
          (marketplace.dataValues.parentMarketplace.includes("amazon") ||
            marketplace.dataValues.parentMarketplace.includes("flipkart"))
        ) {
          values = values || values != null ? true : false;
        }
        if (key == "image_count" || key == "variant") {
          values = nodes.length;
        }
        if (
          (key == "totalRatings" || key == "totalReviews" || key == "rating") &&
          (marketplace.dataValues.parentMarketplace.includes("meesho") ||
            marketplace.dataValues.parentMarketplace.includes("amazon") ||
            marketplace.dataValues.parentMarketplace.includes("flipkart") ||
            marketplace.dataValues.parentMarketplace.includes("firstcry") ||
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
        if (
          key == "brand" &&
          marketplace.dataValues.parentMarketplace.includes("blinkit")
        ) {
          values = values.replace("View all by", "");
        }
        if (key === "price" || key === "mrp") {
          values = values.replace("per item", "").replace(/[,$€£¥₹]/g, "");
          values = values.replaceAll("Rs.", "").trim();
          values = values.replaceAll("Rs", "").trim();
          values = values.replaceAll("from", "").trim();
          values = values == "Currently Unavailable" ? "OOS" : values;
        }
        if (key === "category" || key === "description") {
          values = nodes
            .map((item) => item.textContent.toString().trim())
            .join(":");
        }
        if (
          key === "oosCond" &&
          values &&
          values.trim().length > 0 &&
          !marketplace.dataValues.parentMarketplace.includes("meesho") &&
          !marketplace.dataValues.parentMarketplace.includes("nutrabay")
        ) {
          oufOfStock = true;
        }
        if (
          key === "oosCond" &&
          values &&
          values.trim().length > 0 &&
          marketplace.dataValues.parentMarketplace.includes("nutrabay") &&
          !marketplace.dataValues.parentMarketplace.includes("meesho")
        ) {
          if (values.trim().toLowerCase() == "out of stock!") {
            oufOfStock = true;
          }
        }
        let techInfo = {};
        if (
          (key === "attributes" || key === "otherAttributes") &&
          marketplace.dataValues.parentMarketplace.includes("amazon")
        ) {
          if (nodes.length === 1) {
            const th = xpath.select(xpaths.SpecsInnerXpaths.key, nodes[0]);
            const td = xpath.select(xpaths.SpecsInnerXpaths.value, nodes[0]);
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
              const th = xpath.select(xpaths.SpecsInnerXpaths.key, nodes[k]);
              const td = xpath.select(xpaths.SpecsInnerXpaths.value, nodes[k]);
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
        if (
          key == "attributes" ||
          key == "otherAttributes" ||
          key == "images"
        ) {
          data[key] = !values || values == "" || values == null ? [] : values;
        } else {
          data[key] =
            !values || values == "" || values == null ? "Not Found" : values;
        }
        values = values.toString();
        break;
      } else {
        if (
          key == "attributes" ||
          key == "otherAttributes" ||
          key == "images"
        ) {
          data[key] = [];
        } else if (key != "pages") {
          data[key] = "Not Found";
        }
        if (
          key == "oosCond" &&
          marketplace.dataValues.parentMarketplace.includes("meesho")
        ) {
          oufOfStock = true;
        }
      }
    }
  });
  return { data, oufOfStock };
}

/**
 * Finalizes the data object after extraction, including validation and business rules.
 * Returns the finalized data object and any timedData to be saved.
 */
function finalizeDataObject({
  data,
  oufOfStock,
  marketplace,
  htmlBatchItem,
  projectMandatoryAttr,
  first_fetch,
  changeDate,
  is_frequency,
  TimedAttributes,
}) {
  if (data.pages == "Not Found") data.pages = 0;
  data.image_count = data.image_count == "Not Found" ? 0 : data.image_count;
  data.totalRatings = data.totalRatings == "Not Found" ? 0 : data.totalRatings;
  data.totalReviews = data.totalReviews == "Not Found" ? 0 : data.totalReviews;
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
    (marketplace.dataValues.parentMarketplace.includes("meesho") ||
      marketplace.dataValues.parentMarketplace.includes("nutrabay"))
  ) {
    data.price = "OOS";
    data.reason = "Out Of Stock";
    delete data.oosCond;
  }
  if (
    marketplace.dataValues.parentMarketplace.includes("amazon") &&
    htmlBatchItem.reason != "ASIN Mismatch"
  ) {
    if (data.asin && data.asin != "Not Found") {
      if (!data.asin.includes(htmlBatchItem.asin)) {
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
    htmlBatchItem.reason == "ASIN Mismatch"
  ) {
    if (data.asinCheck && data.asinCheck != "Not Found") {
      if (!data.asinCheck.includes(htmlBatchItem.asin)) {
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
      data.price + (data.decimal != "Not Found" ? `.${data.decimal}` : ".00");
  }
  let timedData = null;
  if (
    data.mrp == "Not Found" &&
    data.price == "Not Found" &&
    htmlBatchItem.scrap_count >= 3 &&
    TimedAttributes
  ) {
    // fallback to previous day's data
    // (async/await not used here, caller should await if needed)
    // This is a sync function, so we can't await here
    // Instead, the caller should handle this if needed
  }
  let validateJSON = validate(marketplace.dataValues.mandatory_attributes_1st);
  if (htmlBatchItem.scrap_count >= 1 && !first_fetch) {
    validateJSON = validate(marketplace.dataValues.mandatory_attributes_nth);
  }
  if (projectMandatoryAttr) {
    const porject_validate = validate(projectMandatoryAttr);
    if (validateJSON(data) && porject_validate(data)) {
      data.isScraped = true;
      data.scrap_count = 0;
      data.marketplaceId = marketplace.dataValues.id;
      data.projectId = htmlBatchItem.projectId;
      data.asin = htmlBatchItem.asin;
      data.url = htmlBatchItem.url;
      data.domain = htmlBatchItem.domain;
      data.pushed_in_queue = false;
      data.nextFetch = changeDate
        ? moment()
            .add(5, "hours")
            .add(30, "minutes")
            .add(1, "days")
            .format("YYYY-MM-DD")
        : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD");
      data.is_failed = false;
      data.to_be_scraped = is_frequency == true ? true : false;
      timedData = {
        unique_product_id: htmlBatchItem.id,
        title: data.title,
        price: data.price,
        mrp: data.mrp,
        brand: data.brand,
        seller: data.seller,
        scrap_date: moment()
          .add(5, "hours")
          .add(30, "minutes")
          .format("YYYY-MM-DD"),
      };
    } else {
      let scrapCount = htmlBatchItem.scrap_count + 1;
      data.isScraped = false;
      data.scrap_count = scrapCount >= 4 ? 0 : ++scrapCount;
      data.marketplaceId = marketplace.dataValues.id;
      data.projectId = htmlBatchItem.projectId;
      data.asin = htmlBatchItem.asin;
      data.url = htmlBatchItem.url;
      data.domain = htmlBatchItem.domain;
      data.pushed_in_queue = false;
      data.nextFetch =
        data.scrap_count == 0
          ? changeDate
            ? moment()
                .add(5, "hours")
                .add(30, "minutes")
                .add(1, "days")
                .format("YYYY-MM-DD")
            : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD")
          : null;
      data.is_failed = scrapCount >= 4 ? true : false;
      data.to_be_scraped =
        is_frequency == true || !data.is_failed ? true : false;
      timedData = {
        unique_product_id: htmlBatchItem.id,
        title: data.title,
        price: data.price,
        mrp: data.mrp,
        brand: data.brand,
        seller: data.seller,
        scrap_date: moment()
          .add(5, "hours")
          .add(30, "minutes")
          .format("YYYY-MM-DD"),
      };
    }
  } else {
    if (validateJSON(data)) {
      data.isScraped = true;
      data.scrap_count = 0;
      data.marketplaceId = marketplace.dataValues.id;
      data.projectId = htmlBatchItem.projectId;
      data.asin = htmlBatchItem.asin;
      data.url = htmlBatchItem.url;
      data.domain = htmlBatchItem.domain;
      data.pushed_in_queue = false;
      data.nextFetch = changeDate
        ? moment()
            .add(5, "hours")
            .add(30, "minutes")
            .add(1, "days")
            .format("YYYY-MM-DD")
        : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD");
      data.is_failed = false;
      data.to_be_scraped = is_frequency == true ? true : false;
      timedData = {
        unique_product_id: htmlBatchItem.id,
        title: data.title,
        price: data.price,
        mrp: data.mrp,
        brand: data.brand,
        seller: data.seller,
        scrap_date: moment()
          .add(5, "hours")
          .add(30, "minutes")
          .format("YYYY-MM-DD"),
      };
    } else {
      let scrapCount = htmlBatchItem.scrap_count + 1;
      data.isScraped = false;
      data.scrap_count = scrapCount >= 4 ? 0 : ++scrapCount;
      data.marketplaceId = marketplace.dataValues.id;
      data.projectId = htmlBatchItem.projectId;
      data.asin = htmlBatchItem.asin;
      data.url = htmlBatchItem.url;
      data.domain = htmlBatchItem.domain;
      data.pushed_in_queue = false;
      data.nextFetch =
        data.scrap_count == 0
          ? changeDate
            ? moment()
                .add(5, "hours")
                .add(30, "minutes")
                .add(1, "days")
                .format("YYYY-MM-DD")
            : moment().add(5, "hours").add(30, "minutes").format("YYYY-MM-DD")
          : null;
      data.is_failed = scrapCount >= 4 ? true : false;
      data.to_be_scraped =
        is_frequency == true || !data.is_failed ? true : false;
      timedData = {
        unique_product_id: htmlBatchItem.id,
        title: data.title,
        price: data.price,
        mrp: data.mrp,
        brand: data.brand,
        seller: data.seller,
        scrap_date: moment()
          .add(5, "hours")
          .add(30, "minutes")
          .format("YYYY-MM-DD"),
      };
    }
  }
  return { data, timedData };
}

/**
 * Creates a fallback data object for a product when extraction fails.
 * Mirrors the original per-product catch block logic from subprocess.js.
 */
function createFallbackDataObject({
  htmlBatchItem,
  marketplace,
  is_frequency,
}) {
  let scrapCount = htmlBatchItem.scrap_count + 1;
  return {
    id: htmlBatchItem.id,
    title: "Not Found",
    price: "Not Found",
    mrp: "Not Found",
    scrap_count: scrapCount >= 4 ? 0 : ++scrapCount,
    marketplaceId: marketplace.dataValues.id,
    projectId: htmlBatchItem.projectId,
    asin: htmlBatchItem.asin,
    url: htmlBatchItem.url,
    domain: htmlBatchItem.domain,
    isScraped: false,
    pushed_in_queue: false,
    is_failed: scrapCount >= 4 ? true : false,
    to_be_scraped:
      is_frequency == true || !(scrapCount >= 4 ? true : false) ? true : false,
  };
}

module.exports = {
  handleEmptyHtml,
  parseHtmlAndExtractData,
  finalizeDataObject,
  createFallbackDataObject,
};
