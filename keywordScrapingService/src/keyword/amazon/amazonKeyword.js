const { Sequelize } = require("sequelize");
const fetch = require("node-fetch");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const Product = require("../../models/product");
const Project = require("../../models/project");
const ProductKeyword = require("../../models/productKeyword");
const {
  evaluationForProductAge,
} = require("../evaluateProductAge/evaluateProductAge");
const UniqueProduct = require("../../models/uniqueProduct");

//ANCHOR - update product details based on the asin api response
const updateProductDetails = async ({
  products,
  projectId,
  isLastIteration,
  productExist,
}) => {
  try {
    //NOTE - create the objcet  for product details
    let productDetailsObject = {
      url: products.request_metadata.amazon_url,
      productId: products.entityId,
      projectId: projectId,
      ASIN: products.product.asin,
      BestSellersRank:
        products.product.bestsellers_rank &&
        products.product.bestsellers_rank.length > 0
          ? products.product.bestsellers_rank
          : null,
      Brand: products.product.brand,
      Manufacturer: products.product.manufacturer,
      PUID: products.product.asin,
      categories:
        products.product.categories && products.product.categories.length > 0
          ? products.product.categories
          : null,
      category: "",
      currency: products.newer_model?.price?.currency,
      image: products.product.main_image.link,
      keywordName:
        products.product.keywords_list &&
        products.product.keywords_list.length > 0
          ? products.product.keywords_list
          : null,
      // marketplaceId: '',
      marketplaceName: products.domain,
      price:
        products.product.buybox_winner && products.product.buybox_winner.price
          ? products.product.buybox_winner.price.value
          : null,
      mrp:
        products.product.buybox_winner && products.product.buybox_winner.rrp
          ? products.product.buybox_winner.rrp.value
          : null,
      title: products.product.title,
      rating: products.product.rating,
      totalRatings: products.product.ratings_total,
      otherAttributes: products,
      //   variants: (isVariant && x.product.variants && x.product.variants.length > 0) ? x.product.variants : null,
      // seller: '',
      description: products.product.description,
    };

    //NOTE - create unique Product
    await UniqueProduct.create(productDetailsObject).then(async () => {
      await Product.update(
        { isScraped: true },
        { where: { id: productDetailsObject.productId } }
      );

      if (isLastIteration === true) {
        await Project.update(
          { status: "completed" },
          { where: { id: projectId } }
        ).then(() => {
          global.socketIo.emit("keyword-update-status", { id: projectId });
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
  productExist,
  isLastIteration,
  productAgeRecent,
}) => {
  try {
    const { id, PUID, projectId, domain } = products;
    const asinUrl = `https://api.asindataapi.com/request?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${PUID}`;

    const response = await fetch(asinUrl);
    const result = await response.json();

    if (result.request_info.success === true) {
      const extractedProduct = { ...result, entityId: id, domain };
      await updateProductDetails({
        products: extractedProduct,
        projectId,
        isLastIteration,
        productExist,
        productAgeRecent,
      });
    } else {
      console.error("Error in scraping FromAsinApin:");
    }
  } catch (error) {
    console.error("Error in scrapingFromAsinApin:", error.message);
  }
};

//SECTION - amazon By Keyowrd
exports.amazonByKeyowrd = async ({
  page,
  projectId,
  encodedUrl,
  scrapCount,
  marketplace,
}) => {
  try {
    //NOTE - get how many total product requested for scraping
    const totalScrapingCount = await ProductKeyword.sum("scrapingCount", {
      where: { projectId },
    });

    console.log("amazonByKeyowrd", marketplace);
    //LINK - scraping ant link
    const url = `https://api.scrapingant.com/v2/general?url=${encodedUrl}&page=${page}&x-api-key=5fee56a621ef4490b1b8cef9cff625b8&proxy_country=US&browser=false`;
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
      console.log("selectedElems", selectedElems.length);

      let totalProductCount = 0;
      let productExist = false;
      let productAgeRecent = false;
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

            // NOTE - check if product exists or not
            const checkProduct = await Product.findOne({
              where: { PUID: asinValue },
            });

            //NOTE: Initialize newProduct to avoid undefined in case no update is performed
            let newProduct;
            // NOTE - if product already exists, update it with projectId
            if (checkProduct) {
              const { hasRecentAge } = await evaluationForProductAge({
                product: checkProduct,
              });
              // NOTE - update all projectIds
              const projectIds = [...checkProduct.projectId, projectId];
              const [, [updatedProduct]] = await Product.update(
                { projectId: projectIds, listingPosition },
                { where: { id: checkProduct.id }, returning: true, limit: 1 }
              );

              //NOTE: Assign the updated product to newProduct
              newProduct = updatedProduct;
              productExist = true;
              productAgeRecent = hasRecentAge;
            } else {
              // NOTE - create a new product
              newProduct = await Product.create({
                ASIN: asinValue,
                PUID: asinValue,
                projectId: [projectId],
                domain: marketplace,
                listingPosition,
                insertionType: "byKeyword",
              });

              productExist = false;
              productAgeRecent = false;
            }

            //NOTE - check product counts
            const productCount = await Product.count({
              where: {
                project_id: {
                  [Sequelize.Op.contains]: Sequelize.literal(
                    `ARRAY[${projectId}]::integer[]`
                  ),
                },
              },
            });

            //NOTE - if the product have recent age then update the product details with project Id
            if (productAgeRecent === true) {
              //NOTE - get UniqueProduct details
              const productDetails = await UniqueProduct.findOne({
                where: { productId: newProduct.id },
              });

              //NOTE - project ids
              const ids = [...productDetails.projectId, projectId];

              UniqueProduct.update(
                { projectId: ids },
                { where: { id: productDetails.id } }
              );
            }

            //NOTE: Check if it's the last iteration
            if (productCount === totalScrapingCount) {
              if (!productAgeRecent)
                //NOTE -if it a last product
                await scrapingFromAsinApin({
                  products: newProduct,
                  productExist,
                  isLastIteration: true,
                  productAgeRecent,
                });
            } else {
              if (!productAgeRecent)
                await scrapingFromAsinApin({
                  products: newProduct,
                  productExist,
                  isLastIteration: false,
                  productAgeRecent,
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
        await exports.amazonByKeyowrd({
          page: page + 1,
          projectId,
          encodedUrl,
          scrapCount: totalProductCount,
          marketplace,
        });
      }
    } else {
      console.log("No products found on the page");
    }
  } catch (error) {
    console.log("error", error.message);
  }
};
