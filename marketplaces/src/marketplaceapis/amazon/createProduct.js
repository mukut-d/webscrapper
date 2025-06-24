const axios = require('axios');
const Token = require('../../models/tokens');
const csku = require('../../models/csku');
const { getAccessToken } = require("./tokens");
const math = require("mathjs");

exports.createAmazonProduct = async (data, clientConfig) => {

    try {

        const { client, userId, marketplace, baseCurrency, targetCurrency, productDetails } = data;

        for (var i = 0; i < productDetails.length; i++) {

            const product = productDetails[i];

            let formula = clientConfig.currencyConversions.find(c => c.category === data.Category);

            if (!formula) {
                formula = clientConfig.currencyConversions.find(c => c.category === "default");
            }

            const updatedPrice = math.evaluate(formula.formula, { price: data.variantPrice });

            await csku.create({
                userId: userId,
                marketplaceId: marketplace,
                channelId: "To Be Listed",
                isku: product.variationId,
                price: updatedPrice,
                quantity: product.variantQuantity,
                currency: targetCurrency,
                status: "active",
                clientName: client,
                accountName: accountName,
                category: product.Category,
                clientConfig: clientConfig,
                partnerSku: product.partnerSku,
                status: "draft"
            });

            if (!product.asin) {
                await csku.update({
                    status: "failed",
                    error: [{ message: "ASIN not found" }],
                });
                continue;
            }


            const token = await Token.findOne({
                where: {
                    accountName: data.accountName,
                    userId: data.userId
                },
                raw: true
            });

            const accessToken = await getAccessToken(token.client_id, client_secret, refreshToken);

            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/${data.asin}?marketplaceIds=${token.marketplaceId}&includedData=summaries,attributes,salesRanks,productTypes,images,identifiers,dimensions,classifications,relationships&locale=en_US`,
                headers: {
                    'Accept': 'application/json',
                    'X-Amz-Access-Token': accessToken
                }
            };

            const amzRespone = axios.request(config);


            const fulfillment_availability = [
                {
                    "fulfillment_channel_code": "DEFAULT",
                    "quantity": data.variationQuantity,
                }
            ];

            const purchasable_offer = [
                {
                    "marketplace_id": token.marketplaceId,
                    "currency": "AED",
                    "our_price": [{ "schedule": [{ "value_with_tax": updatedPrice }] }]
                }
            ];

            const query = {
                marketplaceId: token.amzMarketplaceId,
            }

            for (var x = 0; x < amzRespone.images[0].images.slice(0, 5).length; x++) {

                const image = amzRespone.images[0].images[x];

                if (x == 0) {

                    imageLocator.main_product_image_locator = [
                        {
                            media_location: image.link,
                            marketplace_id: query.marketplaceId
                        }
                    ];

                } else {
                    imageLocator[`other_product_image_locator_${x}`] = [
                        {
                            media_location: image.link,
                            marketplace_id: query.marketplaceId
                        }
                    ];
                }

            }

            amzRespone.data.attributes.fulfillment_availability = fulfillment_availability;
            amzRespone.data.attributes.purchasable_offer = purchasable_offer;
            amzRespone.data.attributes.main_product_image_locator = imageLocator.main_product_image_locator;

            const itemData = {
                "productType": amzRespone.data.productTypes[0].productType,
                "requirements": "LISTING",
                "attributes": amzRespone.data.attributes,
            };

            const listItemResponse = await callSPAPI(
                'PUT',
                `/listings/2020-09-01/items/${token.sellerId}/${product.variationId}`,
                query,
                itemData,
                accessToken
            );

            if (listItemResponse.status != "ACCEPTED") {
                await csku.update({
                    status: "failed",
                    error: listItemResponse.issues,
                });
            } else {
                await csku.update({
                    status: "active",
                });
            }
        }


    } catch (err) {
        console.error(err);
        throw err;
    }

};

async function callSPAPI(method, path, query, body, accessToken) {

    const url = `${SP_API_BASE_URL}${path}${query ? `?${qs.stringify(query)}` : ''}`;
    const opts = {
        host: 'sellingpartnerapi-eu.amazon.com',
        path: `${path}${query ? `?${qs.stringify(query)}` : ''}`,
        service: 'execute-api',
        method,
        headers: {
            'x-amz-access-token': accessToken
        },
        body: JSON.stringify(body),
    };


    const response = await axios({
        url,
        method,
        headers: opts.headers,
        data: body,
    });

    return response.data;
}