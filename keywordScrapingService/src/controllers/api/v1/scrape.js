const MarketPlace = require("../../../models/marketplace");
const ProductKeyword = require("../../../models/productKeyword");
const Project = require("../../../models/project");
const constants = require("../../../utils/constants");
const {
  scrapStagingProducts,
} = require("../../../keyword/amazon/tempProductScrap");

// const Product = require("../../../models/product");
// const UniqueProduct = require("../../../models/uniqueProduct");
// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
// const fetch = require("node-fetch");
// const cheerio = require("cheerio");
// const { amazonByKeyowrd } = require("../../../keyword/amazon/amazonKeyword");

// const updateAllData = async (finalObjcet, projectId, isCompleted) => {
//   let productCount = 0;
//   if (finalObjcet) {
//     let obj = {
//       url: finalObjcet.request_metadata.amazon_url,
//       productId: finalObjcet.entityId,
//       projectId: projectId,
//       ASIN: finalObjcet.product.asin,
//       BestSellersRank:
//         finalObjcet.product.bestsellers_rank &&
//         finalObjcet.product.bestsellers_rank.length > 0
//           ? finalObjcet.product.bestsellers_rank
//           : null,
//       Brand: finalObjcet.product.brand,
//       Manufacturer: finalObjcet.product.manufacturer,
//       PUID: finalObjcet.product.asin,
//       categories:
//         finalObjcet.product.categories &&
//         finalObjcet.product.categories.length > 0
//           ? finalObjcet.product.categories
//           : null,
//       category: "",
//       currency: finalObjcet.newer_model?.price?.currency,
//       image: finalObjcet.product.main_image.link,
//       keywordName:
//         finalObjcet.product.keywords_list &&
//         finalObjcet.product.keywords_list.length > 0
//           ? finalObjcet.product.keywords_list
//           : null,
//       // marketplaceId: '',
//       marketplaceName: finalObjcet.domain,
//       price:
//         finalObjcet.product.buybox_winner &&
//         finalObjcet.product.buybox_winner.price
//           ? finalObjcet.product.buybox_winner.price.value
//           : null,
//       mrp:
//         finalObjcet.product.buybox_winner &&
//         finalObjcet.product.buybox_winner.rrp
//           ? finalObjcet.product.buybox_winner.rrp.value
//           : null,
//       title: finalObjcet.product.title,
//       rating: finalObjcet.product.rating,
//       totalRatings: finalObjcet.product.ratings_total,
//       otherAttributes: finalObjcet,
//       //   variants: (isVariant && x.product.variants && x.product.variants.length > 0) ? x.product.variants : null,
//       // seller: '',
//       description: finalObjcet.product.description,
//     };

//     await UniqueProduct.create(obj)
//       .then(async () => {
//         await Product.update(
//           { isScraped: true },
//           { where: { id: obj.productId } }
//         );

//         console.log("isCompleted", isCompleted);
//         productCount++;

//         console.log("productCount", productCount);

//         if (isCompleted === true) {
//           console.log("isCompleted if true", isCompleted);

//           console.log("projectId", projectId);

//           const count = await UniqueProduct.count({
//             where: { projectId },
//           });

//           console.log("count if true", count);

//           await Project.update(
//             { status: "completed", productCount: count },
//             { where: { id: projectId } }
//           ).then(() => {
//             global.socketIo.emit("keyword-update-status", { id: projectId });
//           });

//           return true;
//         }
//       })
//       .catch((err) => {
//         console.log("**********Table insertion error**********", err);
//       });

//     return false;
//   }
// };

// const startProductDetailsScraping = (products, isCompleted) => {
//   console.log("startProductDetailsScraping");
//   var entityId = products.id;
//   let prodId = products.PUID;
//   let projectId = products.projectId;
//   let domain = products.domain;

//   let url = `https://api.asindataapi.com/request?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${prodId}`;
//   //   let url = `https://res.cloudinary.com/dflu2lwke/raw/upload/v1700743201/k84o1pssjf5ss1pbbywv.json`

//   fetch(url)
//     .then((response) => {
//       return response.json();
//     })
//     .then((result) => {
//       let finalData = [];

//       if (result.request_info.success === true) {
//         let extractedProduct = result;
//         extractedProduct.entityId = entityId;
//         extractedProduct.domain = domain;
//         finalData.push(extractedProduct);
//         updateAllData(extractedProduct, projectId, isCompleted);
//       }
//     })
//     .catch((err) => {
//       console.log("startProductDetailsScraping error", err);
//     });
// };

// const scrapeOtherMarketPlaceProductDetails = (storedProducts, projectId) => {
//   try {
//     let selectedProduct = storedProducts;
//     let encodedUrl = encodeURIComponent(selectedProduct["url"]);

//     let url = `https://api.scrapingant.com/v2/general?url=${encodedUrl}&x-api-key=5fee56a621ef4490b1b8cef9cff625b8`;

//     fetch(url)
//       .then((response) => {
//         return response.text();
//       })
//       .then(async function (result) {
//         const $ = cheerio.load(result);
//         let title = $(".B_NuCI:first").text();
//         let priceText = $("._30jeq3._16Jk6d:first").text();
//         priceText = priceText.slice(1);
//         let mrpText = $("._3I9_wc._2p6lqe:first").text();
//         let description = $("._1mXcCf.RmoJUa p").eq(0).text();
//         let rating = $("._1lRcqv ._3LWZlK").eq(0).text();
//         let totalRating1 = $("._2_R_DZ span").eq(0).text();
//         let totalRating2 = $("._2_R_DZ span span").eq(0).text();
//         let categories = $("._3GIHBu").not(":eq(0)");
//         // let image = $('.CXW8mj._3nMexc img').eq(0).attr('src')
//         let image = null;
//         let totalRatingText = totalRating1 || totalRating2;
//         let totalRating = null;
//         let price = null;
//         let mrp = null;
//         let categoriesTree = [];

//         if (totalRatingText) {
//           let splitRating = totalRatingText.split(" ");
//           let ratingString = splitRating[0];
//           ratingString = ratingString.replace(/\,/g, "");
//           totalRating = Number(ratingString);
//         }

//         if (priceText) {
//           let splitPrice = priceText.split(" ");
//           let priceString = splitPrice[0];
//           priceString = priceString.replace(/\,/g, "");
//           price = Number(priceString);
//         }

//         if (mrpText) {
//           let splitMrp = mrpText.split(" ");
//           let mrpString = splitMrp[0];
//           mrpString = mrpString.replace(/\,/g, "");
//           mrp = Number(mrpString);
//         }

//         if (categories) {
//           for (let i = 0; i < categories.length; i++) {
//             let catName = $("._3GIHBu")
//               .not(":eq(0)")
//               .children("a")
//               .eq(i)
//               .text();
//             let catLink = $("._3GIHBu")
//               .not(":eq(0)")
//               .children("a")
//               .eq(i)
//               .attr("href");

//             if (catName) {
//               categoriesTree.push({
//                 name: catName,
//                 link: catLink,
//               });
//             }
//           }
//         }

//         await UniqueProduct.create({
//           title,
//           productId: selectedProduct["id"],
//           projectId: selectedProduct["projectId"],
//           image: image ? image : null,
//           url: selectedProduct["url"],
//           ASIN: selectedProduct["ASIN"],
//           PUID: selectedProduct["ASIN"],
//           price: price ? Number(price) : null,
//           mrp: mrp ? Number(mrp) : null,
//           rating: rating ? Number(rating) : null,
//           description: description ? description : null,
//           totalRatings: totalRating ? totalRating : null,
//           categories: categoriesTree.length > 0 ? categoriesTree : null,
//         });

//         // if (isCompleted) {
//         //   console.log("isCompleted", isCompleted);
//         //   let scrapedProducts = await UniqueProduct.findAll({
//         //     where: { projectId },
//         //   });

//         //   await Project.update(
//         //     { status: "completed", productCount: scrapedProducts.length },
//         //     { where: { id: projectId } }
//         //   ).then(() => {
//         //     global.socketIo.emit("keyword-update-status", { id: projectId });
//         //   });

//         //   return;
//         // }
//       })
//       .catch((err) => {
//         console.log("*********listing fetch error*********");
//         console.log(err);
//       });
//   } catch (error) {
//     console.log(error);
//   }
// };

// //ANCHOR : scrape Market Places Listing if not amazon
// const scrapeOtherMarketPlacesListing = async (
//   existingProductsKeywords,
//   projectId,
//   htmlContent,
//   page
//   // isCompleted,
//   // index
// ) => {
//   try {
//     let currentProdKeyword = existingProductsKeywords;

//     const $ = cheerio.load(htmlContent);
//     let listSelector = `div[data-id]`;
//     let selectedElems = $(listSelector).children("div");

//     if (selectedElems.length > 0) {
//       let projectStatusUpdated = false;
//       for (let i = 0; i < selectedElems.length; i++) {
//         let currelm = $(listSelector).children("div").children("a").eq(i);

//         if (i < currentProdKeyword["scrapingCount"]) {
//           let domain = currentProdKeyword["marketplace"];
//           domain = `https://${domain}`;

//           let listingPosition = i;
//           let prdId = $(listSelector).eq(i).attr("data-id");
//           let prdPath = $(`a._2rpwqI`).eq(i).attr("href");
//           let prodUrl = domain + prdPath;

//           let scrapeIndex = i + 1;
//           // console.log(i);
//           // console.log($(`a._2rpwqI`).eq(i).attr("href"));

//           const storedProducts = await Product.create({
//             url: prodUrl,
//             ASIN: prdId,
//             PUID: prdId,
//             projectId,
//             domain: currentProdKeyword["marketplace"],
//             listingPosition,
//             insertionType: "byKeyword",
//           });

//           if (!projectStatusUpdated) {
//             await Project.update(
//               { status: "in-progress" },
//               { where: { id: projectId } }
//             ).then(() => {
//               global.socketIo.emit("keyword-update-status", { id: projectId });
//             });
//             projectStatusUpdated = true;
//           }

//           //NOTE: Check if it's the last iteration
//           const isLastIteration = i === currentProdKeyword["scrapingCount"] - 1;

//           scrapeOtherMarketPlaceProductDetails(
//             storedProducts,
//             projectId,
//             isLastIteration
//           );
//         }
//       }
//     }
//   } catch (error) {
//     // Throw the error to be caught by the calling function or middleware
//     throw error;
//   }
// };

const checkDomainForScraping = async ({ productsKeywords }) => {
  try {
    for (const domain of productsKeywords) {
      const { projectId, keyword, marketplace, scrapingCount } = domain;

      // NOTE - check MarketPlace details
      const marketPlace = await MarketPlace.findOne({
        where: { parentMarketplace: marketplace },
      });

      if (!marketPlace) {
        //NOTE: Handle the case where the marketPlace is not found
        console.error(constants.MARKETPLACE_NOT_REGISTERED);
      }
      //NOTE - create a encodedUrl
      const encodedUrl = encodeURIComponent(
        `${marketPlace.searchUrl}${keyword}`
      );

      //NOTE - scrap temp Products and save it in scratchProducts table
      if (marketplace.includes("amazon")) {
        await scrapStagingProducts({
          page: 1,
          projectId,
          encodedUrl,
          scrapCount: scrapingCount,
          marketplace,
          marketplaceId: marketPlace.id,
          keyword,
        });
      }
    }
  } catch (error) {
    console.log("error", error);
  }
};

// //SECTION - scraping For Amazon
// const scrapingForAmazon = async (
//   page,
//   searchUrl,
//   scrapingCount,
//   marketPlace,
//   projectId
// ) => {
//   try {
//     //NOTE - get actually scrapingCount
//     let existingProductsKeywords = await ProductKeyword.findOne({
//       where: { projectId: projectId, marketplace: marketPlace },
//       attributes: ["scrapingCount"],
//     });

//     let totalProductNeedToScrap = existingProductsKeywords.scrapingCount;

//     let url = `https://api.scrapingant.com/v2/general?url=${searchUrl}&page=${page}&x-api-key=5fee56a621ef4490b1b8cef9cff625b8`;

//     console.log("url", url);
//     const result = await fetch(url).then((response) => response.text());

//     const dom = new JSDOM(result);

//     let selectedElems = dom.window.document.querySelectorAll(
//       "div[data-csa-c-pos]"
//     );

//     let productIdSelector = "data-csa-c-item-id";
//     let positionSelector = "data-csa-c-pos";

//     if (selectedElems.length > 0) {
//       let count = 0;
//       let projectStatusUpdated = false;
//       for (let i = 0; i < scrapingCount && i < selectedElems.length; i++) {
//         let elm = selectedElems[i];

//         if (elm) {
//           let asinAttribute = elm.getAttribute(productIdSelector);
//           let positionAttribute = elm.getAttribute(positionSelector);

//           if (asinAttribute) {
//             let splittedAsinAttribute = asinAttribute.split(".");
//             let asinValue =
//               splittedAsinAttribute[splittedAsinAttribute.length - 1];
//             let listingPosition = null;

//             if (positionAttribute) {
//               listingPosition = Number(positionAttribute);
//             }

//             //NOTE - create product
//             const products = await Product.create({
//               ASIN: asinValue,
//               PUID: asinValue,
//               projectId,
//               domain: marketPlace,
//               listingPosition,
//               insertionType: "byKeyword",
//             });

//             //NOTE: Update the project status only once for the first product
//             if (!projectStatusUpdated) {
//               await Project.update(
//                 { status: "in-progress" },
//                 { where: { id: projectId } }
//               ).then(() => {
//                 global.socketIo.emit("keyword-update-status", {
//                   id: projectId,
//                 });
//               });
//               projectStatusUpdated = true;
//             }

//             const productCount = await Product.count({
//               where: { projectId: projectId },
//             });

//             //NOTE: Check if it's the last iteration
//             if (productCount === totalProductNeedToScrap) {
//               startProductDetailsScraping(products, true);
//               break;
//             } else {
//               startProductDetailsScraping(products, false);
//             }
//           }
//         }
//       }

//       if (scrapingCount > selectedElems.length) {
//         count = scrapingCount - selectedElems.length;
//       }

//       // If the retrieved product count is less than expected, fetch more products
//       if (count > 0) {
//         console.log("if (count > 0)");
//         await scrapingForAmazon(
//           page + 1,
//           searchUrl,
//           count,
//           marketPlace,
//           projectId
//         );
//       } else {
//         console.log("else (count > 0)");

//         return true;
//       }
//     } else {
//       console.log("No products found on the page");
//       return false;
//     }
//   } catch (error) {
//     console.log("error", error);
//   }
// };
//

module.exports = {
  async scrapeList(req, res, next) {
    try {
      const { projectId, isVariant, fileStreamPath } = req.body;

      //NOTE - check keyword details in product keyword table
      const productsKeywords = await ProductKeyword.findAll({
        attributes: ["projectId", "keyword", "marketplace", "scrapingCount"],
        where: { projectId },
        raw: true, //TODO: Optional: To get plain JSON objects instead of Sequelize instances
      });

      if (!productsKeywords) {
        return res.status(400).json({
          status: 400,
          message: constants.RECORD_NOT_FOUND,
        });
      }
      //NOTE - get how many total product requested for scraping
      const totalScrapingCount = await ProductKeyword.sum("scrapingCount", {
        where: { projectId },
      });
      //NOTE - update the project as in- progress
      Project.update(
        { status: "in-progress", productCount: totalScrapingCount },
        { where: { id: projectId } }
      ).then(() => {
        global.socketIo.emit("project-status", { id: projectId });
      });

      res.json({
        status: 200,
        message: constants.START_SCRAPING_PRODUCTS_SUCCESS,
      });

      //NOTE - if productsKeywords esist
      await checkDomainForScraping({ productsKeywords });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};
