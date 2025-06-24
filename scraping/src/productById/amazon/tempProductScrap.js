const fetch = require("node-fetch");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyword = require("../../models/productKeyword");
const Project = require("../../models/project");
const { generateRankDetails } = require("../../utils/commonFuntions");

//ANCHOR - update product details based on the asin api response
const updateProductDetails = async ({
  tempProductId,
  asinResponse,
  isLastIteration,
  projectId,
}) => {
  try {
    const { request_metadata, product, newer_model } = asinResponse;
    const { amazon_url } = request_metadata;
    const {
      asin,
      bestsellers_rank,
      brand,
      manufacturer,
      categories,
      main_image,
      keywords_list,
      buybox_winner,
      title,
      rating,
      ratings_total,
      description,
      isbn_13,
      variants,
      more_buying_choices,
      first_available,
      attributes,
    } = product;

    const { link } = main_image;
    const { price: winner_price, rrp } = buybox_winner;
    //NOTE - get all best seller rank details
    let rankdetails;
    if (bestsellers_rank && bestsellers_rank.length > 0) {
      rankdetails = generateRankDetails(bestsellers_rank);
    }

    //NOTE - create the object for update the existing temp table
    let productDetailsObject = {
      url: (amazon_url && amazon_url) || null,
      asin: asin || null,
      isbn: isbn_13 || null,
      bestSellersRank:
        bestsellers_rank && bestsellers_rank?.length > 0
          ? bestsellers_rank
          : null,
      brand: brand || null,
      manufacturer: manufacturer || null,
      categories: categories && categories.length > 0 ? categories : null,
      currency: newer_model?.price.currency || null,
      image: link || null,
      keywordName:
        keywords_list && keywords_list.length > 0 ? keywords_list : null,
      price: winner_price && winner_price ? winner_price?.value : null,
      mrp: rrp && rrp ? rrp?.value : null,
      title: title || null,
      rating: rating || null,
      totalRatings: ratings_total || null,
      otherAttributes: asinResponse,
      variants: variants && variants.length > 0 ? variants : null,
      description: description || null,
      bestSellerRankOne: rankdetails?.bestSellerRankOne || null,
      bestSellerRankCategoryOne: rankdetails?.bestSellerRankCategoryOne || null,
      bestSellerRankLinkOne: rankdetails?.bestSellerRankLinkOne || null,
      bestSellerRankTwo: rankdetails?.bestSellerRankTwo || null,
      bestSellerRankCategoryTwo: rankdetails?.bestSellerRankCategoryTwo || null,
      bestSellerRankLinkTwo: rankdetails?.bestSellerRankLinkTwo || null,
      bestSellerRankThree: rankdetails?.bestSellerRankThree || null,
      bestSellerRankCategoryThree:
        rankdetails?.bestSellerRankCategoryThree || null,
      bestSellerRankLinkThree: rankdetails?.bestSellerRankLinkThree || null,

      bestSellerRankFour: rankdetails?.bestSellerRankFour || null,
      bestSellerRankCategoryFour:
        rankdetails?.bestSellerRankCategoryFour || null,
      bestSellerRankLinkFour: rankdetails?.bestSellerRankLinkFour || null,
      otherSellerDetails: more_buying_choices && more_buying_choices,
      dateOflaunch:
        first_available && first_available?.utc ? first_available?.utc : null,
      attributes: attributes && attributes.length > 0 ? attributes : null,
      variantIds:
        variants && variants.length > 0
          ? variants.map((item) => item.asin)
          : null,
    };

    //NOTE - update Scratch Products details
    await ScratchProducts.update(productDetailsObject, {
      where: { id: tempProductId },
    }).then(async () => {
      if (isLastIteration === true) {
        await Project.update(
          { status: "completed" },
          { where: { id: projectId } }
        ).then(() => {
          // global.socketIo.emit("keyword-update-status", { id: projectId });
        });
      }
    });
  } catch (error) {
    console.log("updateProductDetails error", error.message);
  }
};

//ANCHOR - scrap product details from asin api
const scrapingFromAsinApin = async ({
  products,
  isLastIteration,
  projectId,
}) => {
  try {
    const { id, asin, domain } = products;
    const asinUrl = `https://api.asindataapi.com/request?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${asin}`;

    console.log("asinUrl", asinUrl);
    const response = await fetch(asinUrl);
    const result = await response.json();

    if (result.request_info.success === true) {
      const extractedProduct = { ...result, entityId: id, domain };
      await updateProductDetails({
        tempProductId: id,
        asinResponse: extractedProduct,
        isLastIteration,
        projectId,
      });
    } else {
      console.error("Error in scraping FromAsinApin:");
    }
  } catch (error) {
    console.error("Error in scrapingFromAsinApin:", error.message);
  }
};

//SECTION - scrap temp Products and save it in scratchProducts table
exports.scrapStagingProducts = async ({
  page,
  projectId,
  encodedUrl,
  scrapCount,
  marketplace,
  marketplaceId,
  keyword,
}) => {
  try {
    //NOTE - get how many total product requested for scraping
    const totalScrapingCount = await ProductKeyword.sum("scrapingCount", {
      where: { projectId },
    });

    //LINK - scraping ant link
    const url = `https://api.scrapingant.com/v2/general?url=${encodedUrl}&page=${page}&x-api-key=f9e67043e5934f6b86b3b365ebfccd48&proxy_country=US&browser=false`;
    console.log("url", url);

    const result = await fetch(url).then((response) => response.text());

    console.log("result", result);

    const dom = new JSDOM(result);

    let selectedElems = dom.window.document.querySelectorAll(
      "div[data-csa-c-pos]"
    );

    let productIdSelector = "data-csa-c-item-id";
    let positionSelector = "data-csa-c-pos";

    if (selectedElems.length > 0) {
      let totalProductCount = 0;
      for (let i = 0; i < scrapCount && i < selectedElems.length; i++) {
        let elm = selectedElems[i];

        if (elm) {
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
            //NOTE - create temp products
            const tempProduct = await ScratchProducts.create({
              keyword,
              asin: asinValue,
              projectId,
              domain: marketplace,
              listingPosition,
              insertionType: "byKeyword",
              marketplaceId,
              isScraped: true,
            });

            //NOTE - check product counts
            const productCount = await ScratchProducts.count({
              where: { projectId },
            });

            //NOTE: Check if it's the last iteration
            if (productCount === totalScrapingCount) {
              await scrapingFromAsinApin({
                products: tempProduct,
                isLastIteration: true,
                projectId,
              });
            } else {
              await scrapingFromAsinApin({
                products: tempProduct,
                isLastIteration: false,
                projectId,
              });
            }
          }
        }
      }
      //NOTE - check how many puducts scrap successfully
      if (scrapCount > selectedElems.length) {
        totalProductCount = scrapCount - selectedElems.length;

        console.log("how many puducts scrap successfully", totalProductCount);
      }

      // If the retrieved product count is less than expected, fetch more products
      if (totalProductCount > 0) {
        console.log("if (count > 0)", totalProductCount);
        await exports.scrapStagingProducts({
          page: page + 1,
          projectId,
          encodedUrl,
          scrapCount: totalProductCount,
          marketplace,
          marketplaceId,
          keyword,
        });
      }
    } else {
      console.log("No products found on the page");
    }
  } catch (error) {
    console.log("error", error.message);
  }
};
