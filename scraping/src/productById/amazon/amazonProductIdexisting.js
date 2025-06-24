const fetch = require("node-fetch");
const Product = require("../../models/product");
const Project = require("../../models/project");
const UniqueProduct = require("../../models/uniqueProduct");
const ProductKeyword = require("../../models/productKeyword");
const ProductInsertionType = require("../../utils/enum");

//ANCHOR - update product detaiuls in unique product table
const updateProductDetaila = async ({
  extractedProduct,
  projectId,
  isVariant,
  productDetails,
  updateProduct,
}) => {
  let projectIds;
  //NOTE - get project Ids
  if (updateProduct) {
    projectIds = [...productDetails.projectId, projectId];
  } else {
    projectIds = [projectId];
  }
  console.log("**********x**********", projectIds);
  //NOTE - create a object for unique product table
  let newDetails = {
    url: extractedProduct.request_metadata.amazon_url,
    productId: extractedProduct.entityId,
    projectId: projectIds,
    ASIN: extractedProduct.product.asin,
    BestSellersRank:
      extractedProduct.product.bestsellers_rank &&
      extractedProduct.product.bestsellers_rank.length > 0
        ? extractedProduct.product.bestsellers_rank
        : null,
    Brand: extractedProduct.product.brand,
    Manufacturer: extractedProduct.product.manufacturer,
    PUID: extractedProduct.product.asin,
    categories:
      extractedProduct.product.categories &&
      extractedProduct.product.categories.length > 0
        ? extractedProduct.product.categories
        : null,
    category: "",
    currency: extractedProduct.newer_model?.price?.currency,
    image: extractedProduct.product.main_image.link,
    keywordName:
      extractedProduct.product.keywords_list &&
      extractedProduct.product.keywords_list.length > 0
        ? extractedProduct.product.keywords_list
        : null,
    // marketplaceId: '',
    marketplaceName: extractedProduct.domain,
    price:
      extractedProduct.product.buybox_winner &&
      extractedProduct.product.buybox_winner.price
        ? extractedProduct.product.buybox_winner.price.value
        : null,
    mrp:
      extractedProduct.product.buybox_winner &&
      extractedProduct.product.buybox_winner.rrp
        ? extractedProduct.product.buybox_winner.rrp.value
        : null,
    title: extractedProduct.product.title,
    rating: extractedProduct.product.rating,
    totalRatings: extractedProduct.product.ratings_total,
    otherAttributes: extractedProduct,
    variants:
      isVariant &&
      extractedProduct.product.variants &&
      extractedProduct.product.variants.length > 0
        ? extractedProduct.product.variants
        : null,
    // seller: '',
    description: extractedProduct.product.description,
  };

  //NOTE - if updateProduct is true then update the table else create it
  try {
    if (updateProduct === true) {
      await UniqueProduct.update(newDetails, {
        where: { id: productDetails.id },
      });
    } else {
      await UniqueProduct.create(newDetails);
    }

    console.log("**********Scraping completed**********");
    await Project.update({ status: "completed" }, { where: { id: projectId } });

    global.socketIo.emit("project-status", { id: projectId });
  } catch (err) {
    console.log("**********Table insertion error**********");
    console.log("error in updateProductDetaila", err.message);
  }
};

//ANCHOR - get product details for asin api
const getProductDetails = async ({
  domain,
  keyword,
  projectId,
  productId,
  isVariant,
  productDetails,
  updateProduct,
}) => {
  let url = `${process.env.ASIN_API_URL}?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${keyword}`;
  console.log(" asin api url", url);

  fetch(url)
    .then((response) => {
      return response.json();
    })
    .then(async (result) => {
      if (result.request_info.success === true) {
        let newProduct;
        if (updateProduct === false) {
          //NOTE - create product
          newProduct = await Product.create({
            PUID: keyword,
            projectId: [projectId],
            domain,
            listingPosition: null,
            insertionType: ProductInsertionType.BY_ID,
          });

          if (newProduct) {
            ProductKeyword.create({
              projectId,
              productId: newProduct.id,
              puid: keyword,
              marketplace: domain,
              scrapingCount: 1,
            });
          }
        }
        let extractedProduct = result;
        extractedProduct.entityId =
          productId !== null ? productId : newProduct.id;
        extractedProduct.domain = domain;
        //NOTE - update the products in unique product table
        await updateProductDetaila({
          extractedProduct,
          projectId,
          isVariant,
          productDetails,
          updateProduct,
        });
      } else {
        console.log("******response request_info false******");
      }
    })
    .catch((err) => {
      console.log("err");
      console.log("error while fetching products from asin api", err.message);
    });
};

//SECTION - amazon Product By Id
exports.amazonProductById = async ({
  productExist,
  hasRecentAge,
  keyword,
  projectId,
  isVariant,
  domain,
}) => {
  try {
    if (productExist === true) {
      //NOTE - get product details
      const product = await Product.findOne({
        where: { PUID: keyword },
      });

      //NOTE - update all projectIds
      const projectIds = [...product.projectId, projectId];

      //NOTE - update product table with projectId
      Product.update({ projectId: projectIds }, { where: { id: product.id } });

      //NOTE - get product details form unique product table
      let productDetails;
      if (productExist) {
        //NOTE - check product details in unique product table
        productDetails = await UniqueProduct.findOne({
          where: { productId: product.id },
        });
      }
      //NOTE: Product is more than 3 days old(productExist = true, hasRecentAge=false )
      if (productExist === true && hasRecentAge === false) {
        await getProductDetails({
          domain,
          keyword,
          projectId,
          productId: product.id,
          isVariant,
          productDetails,
          updateProduct: true,
        });

        //NOTE: Product is not more than 3 days old(productExist = true, hasRecentAge=true )
      } else if (productExist === true && hasRecentAge === true) {
        //NOTE - update Unique Product table with projectId
        UniqueProduct.update(
          { projectId: projectIds },
          { where: { id: productDetails.id } }
        );

        Project.update(
          { status: "completed" },
          { where: { id: projectId } }
        ).then(() => {
          global.socketIo.emit("project-status", { id: projectId });
        });
      }
      //NOTE: Product not found, create new product
    } else if (productExist === false && hasRecentAge === false) {
      await getProductDetails({
        domain,
        keyword,
        projectId,
        productId: null,
        isVariant,
        productDetails: null,
        updateProduct: false,
      });
    }
  } catch (error) {
    console.log("error", error.message);
    // throw new Error("An error occurred while fteching products for amazon.");
  }
};
