const fetch = require("node-fetch");
const { generateRankDetails } = require("../../utils/commonFuntions");
const ScratchProducts = require("../../models/scratchProducts");
const ProductKeyword = require("../../models/productKeyword");

//SECTION - amazon Product By Id
exports.fetchProductsFromASIN = async ({ products }) => {
  try {
    const { id, domain, asin, projectId } = products;
    let url = `${process.env.ASIN_API_URL}?api_key=${process.env.ASIN_API}&type=product&amazon_domain=${domain}&asin=${asin}`;
    console.log(" asin api url", url);

    const response = await fetch(url);
    const result = await response.json();

    if (result.request_info.success === true) {
      const {
        request_metadata,
        product,
        newer_model: { price: { currency } = {} } = {},
      } = result;

      const {
        asin,
        bestsellers_rank,
        brand,
        manufacturer,
        categories,
        main_image: { link } = {},
        keywords_list,
        buybox_winner: {
          price: { value: winner_price } = {},
          rrp: { value: rrp } = {},
        } = {},
        title,
        rating,
        ratings_total,
        description,
        isbn_13,
        variants,
        more_buying_choices,
        first_available: { utc: dateOflaunch } = {},
        attributes,
      } = product;

      //NOTE: Get best seller rank details
      const rankdetails =
        bestsellers_rank && bestsellers_rank.length > 0
          ? generateRankDetails(bestsellers_rank)
          : null;

      //NOTE: Create the object for updating the existing temp table
      const finalObject = {
        projectId,
        url: request_metadata?.amazon_url || null,
        asin: asin || null,
        isbn: isbn_13 || null,
        bestSellersRank: bestsellers_rank || null,
        brand: brand || null,
        manufacturer: manufacturer || null,
        categories: categories && categories.length > 0 ? categories : null,
        currency: currency || null,
        image: link || null,
        keywordName:
          keywords_list && keywords_list.length > 0 ? keywords_list : null,
        price: winner_price || null,
        mrp: rrp || null,
        title: title || null,
        rating: rating || null,
        totalRatings: ratings_total || null,
        otherAttributes: result,
        variants: variants && variants.length > 0 ? variants : null,
        description: description || null,
        ...rankdetails,
        otherSellerDetails: more_buying_choices && more_buying_choices,
        dateOflaunch: dateOflaunch || null,
        attributes: attributes && attributes.length > 0 ? attributes : null,
        variantIds:
          variants && variants.length > 0
            ? variants.map((item) => item.asin)
            : null,
        isScraped: true,
      };

      //NOTE - update Scratch Products details
      await ScratchProducts.update(finalObject, { where: { id: id } });

      //NOTE - update ProductKeyword table as product scraped successfully
      await ProductKeyword.update(
        { scrapSuccessCount: 1 },
        { where: { projectId, puid: asin } }
      );
    }
  } catch (error) {
    console.log("error", error.message);
  }
};
