const { Op } = require("sequelize");
const Product = require("../../../models/product");
const MarketPlace = require("../../../models/marketplace");
const ProductKeyword = require("../../../models/productKeyword");
const UniqueProduct = require("../../../models/uniqueProduct");
const Project = require("../../../models/project");
const http = require("https");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const xpath = require("xpath-html");
const { HTMLToJSON } = require("html-to-json-parser");
const fs = require("fs");
const fetch = require("node-fetch");

const rp = require("request-promise");
const cheerio = require("cheerio");
const { getUser } = require("../../../utils/user.util");

const updateAllData = async (finalArr, projectId, isCompleted) => {
  if (finalArr.length > 0) {
    let filteredData = [];
    let ids = [];

    for (let x of finalArr) {
      console.log("**********x**********");
      console.log(x);

      let obj = {
        url: x.request_metadata.amazon_url,
        productId: x.entityId,
        projectId: projectId,
        ASIN: x.product.asin,
        BestSellersRank:
          x.product.bestsellers_rank && x.product.bestsellers_rank.length > 0
            ? x.product.bestsellers_rank
            : null,
        Brand: x.product.brand,
        Manufacturer: x.product.manufacturer,
        PUID: x.product.asin,
        categories:
          x.product.categories && x.product.categories.length > 0
            ? x.product.categories
            : null,
        category: "",
        currency: x.newer_model?.price?.currency,
        image: x.product.main_image.link,
        keywordName:
          x.product.keywords_list && x.product.keywords_list.length > 0
            ? x.product.keywords_list
            : null,
        // marketplaceId: '',
        marketplaceName: x.domain,
        price:
          x.product.buybox_winner && x.product.buybox_winner.price
            ? x.product.buybox_winner.price.value
            : null,
        mrp:
          x.product.buybox_winner && x.product.buybox_winner.rrp
            ? x.product.buybox_winner.rrp.value
            : null,
        title: x.product.title,
        rating: x.product.rating,
        totalRatings: x.product.ratings_total,
        otherAttributes: x,
        //   variants: (isVariant && x.product.variants && x.product.variants.length > 0) ? x.product.variants : null,
        // seller: '',
        description: x.product.description,
      };

      if (!ids.includes(obj.productId)) {
        ids.push(obj.productId);
        filteredData.push(obj);
      }
    }

    UniqueProduct.bulkCreate(filteredData)
      .then(async () => {
        console.log("**********Scraping completed**********");
        console.log(filteredData.length);

        await Product.update(
          { isScraped: true },
          {
            where: {
              id: ids,
            },
          }
        );

        // global.socketIo.emit('project-status', { id: projectId });

        filteredData = [];
        ids = [];
      })
      .catch((err) => {
        console.log("**********Table insertion error**********");
        console.log(err);
        ids = [];
      });
  }

  if (isCompleted) {
    let scrapedProducts = await UniqueProduct.findAll({
      where: {
        projectId,
      },
    });

    await Project.update(
      { status: "completed", productCount: scrapedProducts.length },
      {
        where: {
          id: projectId,
        },
      }
    ).then(() => {
      global.socketIo.emit("keyword-update-status", { id: projectId });
    });

    return;
  }
};

const startProductDetailsScraping = (products) => {
  console.log(
    `********product detail wise scraping starts for: ${products.length}********`
  );

  let productslength = products.length;

  if (productslength > 0) {
    var entityId = products[0].id;
    let prodId = products[0].PUID;
    let projectId = products[0].projectId;
    let domain = products[0].domain;

    let url = `https://api.asindataapi.com/request?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${prodId}`;

    //   let url = `https://res.cloudinary.com/dflu2lwke/raw/upload/v1700743201/k84o1pssjf5ss1pbbywv.json`

    fetch(url)
      .then((response) => {
        return response.json();
      })
      .then((result) => {
        console.log("**********product wise scraping success************");

        let finalData = [];

        if (result.request_info.success === true) {
          let extractedProduct = result;
          extractedProduct.entityId = entityId;
          extractedProduct.domain = domain;

          finalData.push(extractedProduct);
          if (products.length > 1) {
            updateAllData(finalData, projectId, false);
          }
          console.log("**********products before removing************");
          console.log(products.length);

          products.shift();

          console.log("**********products after removed************");
          console.log(products.length);

          let newProducts = products;
          if (newProducts.length > 0) {
            startProductDetailsScraping(newProducts);
          } else {
            updateAllData(finalData, projectId, true);
          }
        } else {
          console.log("******response request_info false******");
          products.shift();

          let newProducts = products;
          if (newProducts.length > 0) {
            startProductDetailsScraping(newProducts);
          } else {
            updateAllData(finalData, projectId, true);
          }
        }
      })
      .catch((err) => {
        console.log("err");
        console.log(err);
      });
  }
};

const scrapeOtherMarketPlaceProductDetails = (storedProducts, projectId) => {
  try {
    let productslength = storedProducts.length;

    console.log("**********productslength**********");
    console.log(productslength);

    if (productslength > 0) {
      let selectedProduct = storedProducts[0];
      let encodedUrl = encodeURIComponent(selectedProduct["url"]);

      let url = `https://api.scrapingant.com/v2/general?url=${encodedUrl}&x-api-key=5fee56a621ef4490b1b8cef9cff625b8`;

      console.log("*********listing fetch url**************");
      console.log(url);

      fetch(url)
        .then((response) => {
          console.log("*********listing fetch first response**********");
          return response.text();
        })
        .then(async function (result) {
          const $ = cheerio.load(result);
          let title = $(".B_NuCI:first").text();
          let priceText = $("._30jeq3._16Jk6d:first").text();
          priceText = priceText.slice(1);
          let mrpText = $("._3I9_wc._2p6lqe:first").text();
          let description = $("._1mXcCf.RmoJUa p").eq(0).text();
          let rating = $("._1lRcqv ._3LWZlK").eq(0).text();
          let totalRating1 = $("._2_R_DZ span").eq(0).text();
          let totalRating2 = $("._2_R_DZ span span").eq(0).text();
          let categories = $("._3GIHBu").not(":eq(0)");
          // let image = $('.CXW8mj._3nMexc img').eq(0).attr('src')
          let image = null;
          let totalRatingText = totalRating1 || totalRating2;
          let totalRating = null;
          let price = null;
          let mrp = null;
          let categoriesTree = [];

          if (totalRatingText) {
            let splitRating = totalRatingText.split(" ");
            let ratingString = splitRating[0];
            ratingString = ratingString.replace(/\,/g, "");
            totalRating = Number(ratingString);
          }

          if (priceText) {
            let splitPrice = priceText.split(" ");
            let priceString = splitPrice[0];
            priceString = priceString.replace(/\,/g, "");
            price = Number(priceString);
          }

          if (mrpText) {
            let splitMrp = mrpText.split(" ");
            let mrpString = splitMrp[0];
            mrpString = mrpString.replace(/\,/g, "");
            mrp = Number(mrpString);
          }

          if (categories) {
            for (let i = 0; i < categories.length; i++) {
              let catName = $("._3GIHBu")
                .not(":eq(0)")
                .children("a")
                .eq(i)
                .text();
              let catLink = $("._3GIHBu")
                .not(":eq(0)")
                .children("a")
                .eq(i)
                .attr("href");

              if (catName) {
                categoriesTree.push({
                  name: catName,
                  link: catLink,
                });
              }
            }
          }

          await UniqueProduct.create({
            title,
            productId: selectedProduct["id"],
            projectId: selectedProduct["projectId"],
            image: image ? image : null,
            url: selectedProduct["url"],
            ASIN: selectedProduct["ASIN"],
            PUID: selectedProduct["ASIN"],
            price: price ? Number(price) : null,
            mrp: mrp ? Number(mrp) : null,
            rating: rating ? Number(rating) : null,
            description: description ? description : null,
            totalRatings: totalRating ? totalRating : null,
            categories: categoriesTree.length > 0 ? categoriesTree : null,
          });

          storedProducts.shift();

          let newProducts = storedProducts;

          if (newProducts && newProducts.length > 0) {
            scrapeOtherMarketPlaceProductDetails(newProducts, projectId);
          } else {
            let scrapedProducts = await UniqueProduct.findAll({
              where: {
                projectId,
              },
            });

            await Project.update(
              { status: "completed", productCount: scrapedProducts.length },
              {
                where: {
                  id: projectId,
                },
              }
            ).then(() => {
              global.socketIo.emit("keyword-update-status", { id: projectId });
            });

            return;
          }
        })
        .catch((err) => {
          console.log("*********listing fetch error*********");
          console.log(err);
        });
    }
  } catch (error) {
    console.log(error);
  }
};

const scrapeOtherMarketPlacesListing = async (
  existingProductsKeywords,
  projectId,
  htmlContent,
  page
) => {
  try {
    let currentProdKeyword = existingProductsKeywords[0];

    const $ = cheerio.load(htmlContent);
    let listSelector = `div[data-id]`;
    let selectedElems = $(listSelector).children("div");

    if (selectedElems.length > 0) {
      for (let i = 0; i < selectedElems.length; i++) {
        let currelm = $(listSelector).children("div").children("a").eq(i);

        if (i < currentProdKeyword["scrapingCount"]) {
          let domain = currentProdKeyword["marketplace"];
          domain = `https://${domain}`;

          let listingPosition = i;
          let prdId = $(listSelector).eq(i).attr("data-id");
          let prdPath = $(`a._2rpwqI`).eq(i).attr("href");
          let prodUrl = domain + prdPath;

          let scrapeIndex = i + 1;
          console.log(i);
          console.log($(`a._2rpwqI`).eq(i).attr("href"));

          let createdProduct = await Product.create({
            url: prodUrl,
            ASIN: prdId,
            PUID: prdId,
            projectId,
            domain: currentProdKeyword["marketplace"],
            listingPosition,
            insertionType: "byKeyword",
          });
        }
      }

      let storedProducts = await Product.findAll({
        where: {
          projectId,
          insertionType: "byKeyword",
          isScraped: false,
        },
      });

      await Project.update(
        { status: "in-progress" },
        {
          where: {
            id: projectId,
          },
        }
      ).then(() => {
        global.socketIo.emit("keyword-update-status", { id: projectId });
      });

      scrapeOtherMarketPlaceProductDetails(storedProducts, projectId);
    }
  } catch (error) {
    console.log("*******scrapeOtherMarketPlacesListing error*******");
    console.log(error);
  }
};

const scrapeListingPage = async (existingProductsKeywords, projectId) => {
  try {
    let currentProdKeyword = existingProductsKeywords[0];

    const marketPlace = await MarketPlace.findOne({
      where: {
        parentMarketplace: currentProdKeyword["marketplace"],
      },
    });

    let searchUrl = marketPlace.searchUrl;

    searchUrl = searchUrl + currentProdKeyword["keyword"];
    let encodedUrl = encodeURIComponent(searchUrl);

    let url = `https://api.scrapingant.com/v2/general?url=${encodedUrl}&x-api-key=5fee56a621ef4490b1b8cef9cff625b8`;

    console.log("*********listing fetch url**************");
    console.log(url);

    fetch(url)
      .then((response) => {
        console.log("*********listing fetch first response**********");
        return response.text();
      })
      .then(async function (result) {
        let amazonPattern = /amazon/i;
        if (!amazonPattern.test(currentProdKeyword["marketplace"])) {
          scrapeOtherMarketPlacesListing(
            existingProductsKeywords,
            projectId,
            result,
            1
          );
        } else {
          const dom = new JSDOM(result);

          let selectedElems = dom.window.document.querySelectorAll(
            "div[data-csa-c-pos]"
          );
          let productIdSelector = "data-csa-c-item-id";
          let positionSelector = "data-csa-c-pos";

          if (selectedElems.length > 0) {
            for (let i = 0; i < currentProdKeyword["scrapingCount"]; i++) {
              let elm = selectedElems[i];

              let asinAttribute = elm.getAttribute(productIdSelector);
              let positionAttribute = elm.getAttribute(positionSelector);

              if (asinAttribute) {
                let splittedAsinAttribute = asinAttribute.split(".");
                let asinValue =
                  splittedAsinAttribute[splittedAsinAttribute.length - 1];
                let listingPosition = null;

                if (positionAttribute) {
                  listingPosition = Number(positionAttribute);
                }

                await Product.create({
                  ASIN: asinValue,
                  PUID: asinValue,
                  projectId,
                  domain: currentProdKeyword["marketplace"],
                  listingPosition,
                  insertionType: "byKeyword",
                });
              }
            }
          }

          existingProductsKeywords.shift();

          let newProducts = existingProductsKeywords;
          if (newProducts.length > 0) {
            scrapeListingPage(newProducts, projectId);
          } else {
            let insertedProducts = await Product.findAll({
              where: {
                [Op.and]: [{ projectId }, { insertionType: "byKeyword" }],
              },
            });

            await Project.update(
              { status: "in-progress" },
              {
                where: {
                  id: projectId,
                },
              }
            ).then(() => {
              global.socketIo.emit("keyword-update-status", { id: projectId });
            });

            console.log(`********start product details scraping********`);
            console.log(insertedProducts.length);

            startProductDetailsScraping(insertedProducts);
          }
        }
      })
      .catch((err) => {
        console.log("*********listing fetch error*********");
        console.log(err);
      });
  } catch (error) {
    return res.status(400).json({
      status: false,
      message: error.message,
    });
  }
};

module.exports = {
  async scrapeList(req, res, next) {
    try {
      const { projectId, isVariant, fileStreamPath } = req.body;

      let existingProductsKeywords = await ProductKeyword.findAll({
        attributes: ["keyword", "marketplace", "scrapingCount"],
        where: {
          [Op.and]: [{ projectId }],
        },
      });

      if (existingProductsKeywords.length > 0) {
        scrapeListingPage(existingProductsKeywords, projectId);
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};
