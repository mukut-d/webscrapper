const fetch = require("node-fetch");
const cheerio = require("cheerio");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyword = require("../../models/productKeyword");
const MarketPlace = require("../../models/marketplace");

const HttpsProxyAgent = require("https-proxy-agent");

// previous proxy
// const proxyUrl = "http://aditya1991arya:TqPTQIp8bB@103.171.51.201:59100";
// const proxyUrl = "http://aditya1991arya:TqPTQIp8bB@103.167.32.115:59100";

// current proxy
const proxyUrl = "http://aditya1991arya:TqPTQIp8bB@45.112.173.111:59100";

const proxyAgent = new HttpsProxyAgent(proxyUrl);

exports.retrieveItemsForExoticindia = async ({ products }) => {
  try {
    const { id, asin, projectId } = products;
    const marketplace = await MarketPlace.findOne({
      where: { parentMarketplace: "exoticindiaart.com" },
      attributes: ["id", "idUrl"],
    });
    const url = `${marketplace.idUrl}${asin}`;

    return fetch(url, { agent: proxyAgent })
      .then((res) => res.text())
      .then(async (html) => {
        const $ = cheerio.load(html);

        const titleElement = $(
          "body > section.section.mainbody > div > div.columns.is-multiline > div:nth-child(2) > h1"
        ).clone();
        titleElement.find("div").remove();

        // Get the text from the cloned h1 element
        const title = titleElement.text().trim() || null;

        // Get the price and currency
        let priceElement = $(
          "#product-details-prices > div:nth-child(2) > strong"
        )
          .html()
          ?.trim();

        // If the price wasn't found, try the less specific selector
        if (!priceElement) {
          priceElement = $("#product-details-prices > div > strong")
            .html()
            ?.trim();
        }

        const currency =
          priceElement
            ?.replace(/[0-9.]/g, "")
            .replace(",", "")
            .trim() || null;
        let priceParts = priceElement?.replace(/[^0-9.]/g, "").split(".");
        if (
          Array.isArray(priceParts) &&
          priceParts.length > 0 &&
          priceParts[0] === ""
        ) {
          priceParts = priceParts.slice(1);
        }

        let price = null;
        if (Array.isArray(priceParts)) {
          price =
            priceParts.length > 1
              ? priceParts.slice(-2).join(".")
              : priceParts[0] || null;
        }
        // Get the MRP and remove any non-digit characters
        let mrpElement = $(
          "span.is-original-price.is-size-6.has-text-black.has-text-weight-normal"
        )
          .text()
          .trim();

        let mrpParts =
          typeof mrpElement === "string"
            ? mrpElement.replace(/[^0-9.]/g, "").split(".")
            : [];

        if (
          Array.isArray(mrpParts) &&
          mrpParts.length > 0 &&
          mrpParts[0] === ""
        ) {
          mrpParts = mrpParts.slice(1);
        }

        let mrp = null;
        if (Array.isArray(mrpParts)) {
          mrp =
            mrpParts.length > 1
              ? mrpParts.slice(-2).join(".")
              : mrpParts[0] || null;
        }

        // Get the breadcrumbs
        let breadcrumbs =
          $(
            "body > section.section.pagetitle.producttitle.has-background-light > div > div > nav"
          )
            .text()
            .trim()
            .split("\n")
            .map((line) => line.trim())
            .join(" > ") || null;

        if (breadcrumbs === "") {
          breadcrumbs = null;
        }

        // Get the image URLs
        let imageUrls = $("div.product-details-alt-tiny-inner-container a")
          .map((i, link) => $(link).attr("href"))
          .get();

        // Check if any image URLs were found
        if (Array.isArray(imageUrls) && imageUrls.length === 0) {
          const primaryImageSrc = $("#detailsPrimaryImageSrc").attr("src");
          if (primaryImageSrc) {
            imageUrls.push(primaryImageSrc);
          } else {
            imageUrls.push("image not found");
          }
        }

        // Create an object for the fetched product details
        const fetchedProductDetails = {};

        // Iterate over each product detail label
        $(".product-details-specifications-label").each((i, label) => {
          // Get the label and value
          const labelName = $(label).text().trim().replace(":", "");
          const value = $(label).next().text().trim() || null;

          // Convert the label to camelCase to use as the property name
          const propertyName = labelName
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());

          // Assign the value to the property in the object
          fetchedProductDetails[propertyName] = value;
        });

        let categories = $(
          "body > section.section.pagetitle.producttitle.has-background-light > div > div > nav > ul"
        )
          .children()
          .map((i, el) => $(el).text().trim())
          .get();

        let pagesMatch = fetchedProductDetails.pages
          ? fetchedProductDetails.pages.match(/\d+(,\d+)*/)
          : null;
        let pages = pagesMatch ? pagesMatch[0].replace(/,/g, "") : null;

        const productDetails = {
          url: url,
          categories: categories,
          title: title,
          price: price,
          mrp: mrp,
          currency: currency,
          category: breadcrumbs,
          image:
            Array.isArray(imageUrls) && imageUrls.length > 0
              ? imageUrls[0]
              : null,
          images: imageUrls,
          otherAttributes: fetchedProductDetails,
          author: fetchedProductDetails.author || null,
          publisher: fetchedProductDetails.publisher || null,
          language: fetchedProductDetails.language || null,
          edition: fetchedProductDetails.edition || null,
          pages: pages || null,
          cover: fetchedProductDetails.cover || null,
          weight: fetchedProductDetails.weight || null,
          origin: fetchedProductDetails.origin || null,
        };

        if (productDetails && productDetails.title != null) {
          // Return a function that performs the write operations
          return async () => {
            //NOTE: Update Scratch Products details
            await ScratchProducts.update(
              { ...productDetails, isScraped: true },
              { where: { id } }
            );

            //NOTE: Update ProductKeyword table as product scraped successfully
            await ProductKeyword.update(
              { scrapSuccessCount: 1 },
              { where: { projectId, puid: asin } }
            );
          };
        } else {
          console.log("productDetails not found.");
          return async () => {}; // Return an empty function if there's no product details
        }
      })
      .catch((error) => {
        console.error(error);
        return async () => {}; // Return an empty function if an error occurs
      });
  } catch (error) {
    console.error("Error:", error.message);
    return async () => {}; // Return an empty function if an error occurs
  }
};
