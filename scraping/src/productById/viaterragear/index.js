const puppeteer = require("puppeteer");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyWord = require("../../models/productKeyword");
const HttpsProxyAgent = require("https-proxy-agent");

exports.retrieveItemsForViaterragear = async ({ products }) => {
  console.log("Cron job for product By Id Viaterra!!!");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  let { id, asin, projectId, url } = products;

  console.log("url", url);

  const decodeURIComponenturl = decodeURIComponent(url);

  console.log("decodeURIComponent url: ", url);

  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    const title = await page
      .$eval("div.product-block.product-block--header > h1", (el) =>
        el.textContent.trim()
      )
      .catch(() => null);

    const priceElement = await page.$eval(
      "div.product-block.product-block--price > span.product__price",
      (el) => el.textContent.trim()
    );
    const currency = priceElement
      .replace(/[0-9.]/g, "")
      .replace(",", "")
      .trim();
    let priceParts = priceElement.replace(/[^0-9.]/g, "").split(".");
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

    const description = await page.$eval(
      "div.product-block.description-block > div",
      (el) => el.textContent.replace(/\n/g, "")
    );

    let content = await page.$eval("div.product-info-contents", (el) =>
      el.textContent.trim()
    );
    content = content.replace(/\n/g, " ").replace(/\s/g, " ").trim();

    const images = await page.$$eval(
      "div.product__thumbs--scroller > div > div > a",
      (anchors) => anchors.map((anchor) => anchor.href)
    );

    const productSpecifications = await page.$$eval(
      "#product-specification > div:nth-child(2) > div",
      (divs) =>
        divs.map((div) => {
          const specTitle = div.querySelector("button > span:nth-child(2)");

          const contentDivs = Array.from(
            div.querySelectorAll("div > div:first-child")
          ).map((p) => {
            const strongElements = Array.from(p.querySelectorAll("strong"));

            if (strongElements.length === 0) {
              return p.textContent.trim();
            }

            return strongElements.map((strong) => {
              let nextNode = strong.nextSibling;
              let nextElement = strong.parentElement.nextElementSibling;

              // If the next node is a text node and not just whitespace, use its text content as the value
              if (
                nextNode &&
                nextNode.nodeType === Node.TEXT_NODE &&
                nextNode.textContent.trim() !== ""
              ) {
                return {
                  [strong.textContent.trim()]: nextNode.textContent.trim(),
                };
              }

              // If the next element is a UL or P, use its text content as the value
              if (
                nextElement &&
                (nextElement.tagName === "UL" || nextElement.tagName === "P")
              ) {
                return {
                  [strong.textContent.trim()]: nextElement.textContent.trim(),
                };
              }

              return p.textContent.trim();
            });
          });

          const details = {
            specTitle: specTitle.textContent.trim(),
            content: contentDivs,
          };

          return details;
        })
    );

    const variantTypes = await page.$$eval(
      "div.product-block.variant-pickers > div > label",
      (labels) => labels.map((label) => label.innerText.split("\n")[0].trim())
    );

    let allVariants = [];

    for (let i = 0; i < variantTypes.length; i++) {
      const variants = await page.$$eval(
        `div.product-block.variant-pickers > div:nth-child(${
          i + 1
        }) > fieldset > div`,
        (divs) => divs.map((div) => div.getAttribute("data-value"))
      );
      allVariants.push({ variantType: variantTypes[i], variants });
    }

    const productDetailsArray = [];

    if (allVariants.length === 0) {
      const productDetails = {
        title,
        currency,
        price,
        description,
        // content,
        image: Array.isArray(images) && images.length > 0 ? images[0] : null,
        images,
        otherAttributes: productSpecifications,
        variantType: null,
        variant: null,
      };
      productDetailsArray.push(productDetails);
    } else {
      for (let i = 0; i < allVariants.length; i++) {
        for (let j = 0; j < allVariants[i].variants.length; j++) {
          const productDetails = {
            title,
            currency,
            price,
            description,
            // content, // create a column named content
            image:
              Array.isArray(images) && images.length > 0 ? images[0] : null,
            images,
            otherAttributes: productSpecifications,
            variantType: allVariants[i].variantType,
            variant: allVariants[i].variants[j],
          };
          productDetailsArray.push(productDetails);
        }
      }
    }

    // console.dir(productDetailsArray, { depth: null });

    // Fetch the existing record
    const existingRecord = await ScratchProducts.findOne({ where: { id } });

    for (const productDetails of productDetailsArray) {
      if (productDetails) {
        // Create a new record with the existing data and the new variant data
        const newRecord = {
          ...existingRecord.dataValues,
          ...productDetails,
          isScraped: true,
        };
        delete newRecord.id; // remove the id field to allow Sequelize to auto-generate a new one

        // Insert the new record
        await ScratchProducts.create(newRecord);

        // Update ProductKeyword
        // await ProductKeyword.updateOne(
        //   { projectId: "yourProjectId", puid: productDetails.variant },
        //   { $inc: { scrapSuccessCount: 1 } },
        //   { upsert: true }
        // );
      } else {
        console.log("productDetails not found.");
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
};
