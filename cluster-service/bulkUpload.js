const cheerio = require("cheerio");
const xpath = require("xpath");
const ScrapingAntClient = require("@scrapingant/scrapingant-client");
const { DOMParser } = require("xmldom");
const ScratchProducts = require("./models/scratchProducts"); // Adjust the import as needed

const client = new ScrapingAntClient({
  apiKey: "3b03950ccb7e41ff9f66b98c8eb1e190",
});

process.on("message", async (message) => {
  if (message === "start") {
    processTask();
  }
});

async function scrapeAmazon(rowData) {
  const { asin, title, brand, storage, ram, model, variant } = rowData;
  let html = "";

  try {
    const amazonRes = await client.scrape(
      `https://www.amazon.ae/s?k=${title}&ref=nb_sb_noss`,
      { browser: false, proxy_country: "AE" }
    );
    html = amazonRes.content;
  } catch (err) {
    console.log(err);
    return {
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
    };
  }

  if (!html) return null;

  const $ = cheerio.load(html);
  const dom = new DOMParser().parseFromString($.xml(), "text/xml");
  const nodes = xpath.select(
    "//div[@class='a-section a-spacing-small puis-padding-left-small puis-padding-right-small']",
    dom
  );
  let result = null;

  nodes.some((item) => {
    const title = xpath.select1(
      ".//span[@class='a-size-base-plus a-color-base a-text-normal']",
      item
    ).textContent;

    if (
      model.includes("i phone") &&
      (title.includes("Renewed") || title.includes("Refurbished"))
    ) {
      result = extractAmazonData(item, rowData, title);
      return true;
    } else if (
      model.includes("macbook") &&
      (title.includes("Renewed") || title.includes("Refurbished"))
    ) {
      result = extractAmazonData(item, rowData, title);
      return true;
    } else if (title.includes("Renewed") || title.includes("Refurbished")) {
      result = extractAmazonData(item, rowData, title);
      return true;
    }
  });

  if (!result) {
    return {
      asin,
      title,
      brand,
      storage,
      ram,
      model,
      variant,
      price: "Not Found",
      currency: "Not Found",
      projectId: rowData.projectId,
      marketplaceId: "19",
    };
  }
  return result;
}

async function scrapeNoon(rowData) {
  const { asin, title, brand, storage, ram, model, variant } = rowData;
  const searchParams = encodeURIComponent(`${title} - Renewed`);
  let html = "";

  try {
    const res = await client.scrape(
      `https://www.noon.com/uae-en/search/?q=${searchParams}`,
      { browser: true, proxy_type: "datacenter", proxy_country: "AE" }
    );
    html = res.content;
  } catch (err) {
    console.log(err);
    return {
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
    };
  }

  if (!html) return null;

  const $ = cheerio.load(html);
  const dom = new DOMParser().parseFromString($.xml(), "text/xml");
  const nodes = xpath.select("//div[@class='sc-61baf88b-7 dRkNeo grid']", dom);
  let result = null;

  nodes.some((item) => {
    const link = xpath
      .select1(".//div[@class='sc-f979c9d7-24 gvzcQ']", item)
      .getAttribute("title");

    if (
      model.includes("i phone") &&
      (link.includes("Renewed") || link.includes("Refurbished"))
    ) {
      result = extractNoonData(item, rowData, link);
      return true;
    } else if (
      model.includes("macbook") &&
      (link.includes("Renewed") || link.includes("Refurbished"))
    ) {
      result = extractNoonData(item, rowData, link);
      return true;
    } else if (link.includes("Renewed") || link.includes("Refurbished")) {
      result = extractNoonData(item, rowData, link);
      return true;
    }
  });

  if (!result) {
    return {
      asin,
      title,
      brand,
      storage,
      ram,
      model,
      variant,
      price: "Not Found",
      currency: "Not Found",
      projectId: rowData.projectId,
      marketplaceId: "20",
    };
  }
  return result;
}

function extractAmazonData(item, rowData, title) {
  const price = xpath.select1(".//span[@class='a-price-whole']", item);
  const decimal = xpath.select1(".//span[@class='a-price-fraction']", item);
  const currency = xpath.select1(".//span[@class='a-price-symbol']", item);
  const url = xpath.select1(
    ".//h2[@class='a-size-mini a-spacing-none a-color-base s-line-clamp-4']/a",
    item
  );

  return {
    asin: rowData.asin,
    title: title,
    brand: rowData.brand,
    storage: rowData.storage,
    ram: rowData.ram,
    model: rowData.model,
    variant: rowData.variant,
    price: !isNaN(
      parseFloat(price?.textContent.replace(",", "") + decimal?.textContent)
    )
      ? price?.textContent.replace(",", "") + decimal?.textContent
      : "Not Found",
    currency: currency?.textContent,
    projectId: rowData.projectId,
    marketplaceId: "19",
    url: `https://www.amazon.ae/${url?.getAttribute("href")}`,
  };
}

function extractNoonData(item, rowData, link) {
  const price = xpath.select1(".//strong[@class='amount']", item);
  const currency = xpath.select1(".//span[@class='currency']", item);
  const url = xpath.select1(".//div[@class='sc-19767e73-0 bwele']/a", item);

  return {
    asin: rowData.asin,
    title: rowData.title,
    brand: rowData.brand,
    storage: rowData.storage,
    ram: rowData.ram,
    model: rowData.model,
    variant: rowData.variant,
    price: price?.textContent.replace(",", "") ?? "Not Found",
    currency: currency?.textContent ?? "Not Found",
    projectId: rowData.projectId,
    marketplaceId: "20",
    url: `https://www.noon.com/${url?.getAttribute("href")}`,
  };
}

async function cartlowFetch(data) {
  try {
    const amazonData = [];
    const noonData = [];

    const results = await Promise.all(
      data?.map(async (rowData) => {
        const amazonResult = await scrapeAmazon(rowData);
        if (amazonResult) amazonData.push(amazonResult);

        const noonResult = await scrapeNoon(rowData);
        if (noonResult) noonData.push(noonResult);
      })
    );

    if (amazonData.length > 0) {
      await uploadDataOneByOne(amazonData);
      console.log("All Amazon data processed.");
    }

    if (noonData.length > 0) {
      await uploadDataOneByOne(noonData);
      console.log("All Noon data processed.");
    }
  } catch (err) {
    console.log(err);
  }
}

const uploadDataOneByOne = async (data) => {
  for (const item of data) {
    try {
      const result = await ScratchProducts.create(item);
      console.log(`Inserted: ${result.title}  ${result.price}`);
    } catch (err) {
      console.error(`Error inserting ${item.title}:`, err);
    }
  }
};

(async function () {
  try {
    const data = await ScratchProducts.findAll({
      where: { projectId: "232", owned: true },
      order: [["createdAt", "ASC"]],
    });
    console.log(data.length);

    let i = 0;
    while (i < data.length) {
      let batch = data.slice(i, i + 5);
      batch = batch.map((item) => item.dataValues);
      console.log(batch.length);
      console.log(i);
      console.log("START");
      await cartlowFetch(batch);
      console.log(i);
      console.log("END");
      i += 5;
    }
  } catch (err) {
    console.log(err);
  }
})();
