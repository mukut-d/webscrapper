const newRelic = require("newrelic");
const fs = require("fs");
const path = require("path");
const Marketplace = require("../../models/marketplace");
const Csku = require("../../models/csku");
const Tokens = require("../../models/tokens");
const Isku = require("../../models/isku");
const FileStorages = require("../../models/fileStorages");
const convertPriceByFormula = require("../../helper/convertPriceByFormula");
const fetchCurrencyAndPrice = require("../../helper/fetchCurrency");
const { handleEbayListing } = require("../../marketplaceapis/ebay/ebayBulk");
const addToQueueInBatches = require("../../helper/addToQueueInBatches");
const processFile = require("../../helper/convertFileToJson");
const { getConfigForClient } = require("../../helper/utilityFunctions");
const { handleAmazonListing } = require("../../marketplaceapis/amazon/amazonBulk");
const { Op } = require("sequelize");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail");
const { uploadFileToS3 } = require("../../helper/uploadFileToS3");
const createExcelFromJSON = require("../../helper/createExcelFromJSON");
const math = require("mathjs");
const cron = require("node-cron");
const csku = require("../../models/csku");
const UserRepository = require("../../models/user");
const mathjs = require("mathjs");
const moment = require("moment");
const axios = require("axios");
const { pushData } = require("../../controllers/api/v1/catalogue");
const { getSellerProfile } = require("../../marketplaceapis/ebay/index");
const Geosite = require("../../models/geosite");

cron.schedule('0 0 * * 0', () => {
    // Your code here
    mainFunction();
});

exports.mainFunction = async () => {
    try {

        const getAllCronUsers = await UserRepository.findAll({
            where: {
                shopify_cron: true
            },
            raw: true
        });

        if (getAllCronUsers.length > 0) {
            for (var i = 0; i < getAllCronUsers.length; i++) {
                const userData = getAllCronUsers[i];
                console.log(userData);
                const tokenData = await Tokens.findOne({
                    where: {
                        userId: userData.id,
                        marketPlaceId: 7
                    },
                    raw: true
                });

                cronFunction({ ...userData, ...tokenData });
            }
        }

    } catch (err) {
        console.log(err);
    }
}

async function cronFunction(userData) {
    try {

        // Fetch data from shopify
        let data = JSON.stringify({
            "userId": userData.userId,
            "marketplaceId": userData.marketPlaceId,
            "accountName": userData.accountName,
            "addQuantity": false,
            "date": moment().startOf("day").toISOString()
        });

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'http://localhost:5001/catalogue/sync-catalogue',
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        await axios.request(config)
            .then((response) => {
                console.log(JSON.stringify(response.data));
            });

        const todayDate = moment().add(5, "hours").add(30, "minutes");
        const startOfDay = moment(todayDate).startOf("day");
        const endOfDay = moment(todayDate).endOf("day");

        const cskuData = await csku.findAll({
            where: {
                createdAt: {
                    [Op.between]: [startOfDay, endOfDay]
                },
                userId: userData.userId,
                marketplaceId: userData.marketPlaceId,
                accountName: userData.accountName
            },
            attributes: ["channelId"],
            group: ["channelId"]
        });

        const failedProducts = [];

        if (cskuData.length > 0) {

            const configFile = JSON.parse(fs.readFileSync(path.join(__dirname, "cron-config.json"), "utf8"));
            const config = configFile.find(config => config[userData.userId])?.[userData.userId]?.[userData.accountName];

            if (config) {

                const geoSite = await Geosite.findOne({
                    where: {
                        globalId: config.ebaySite
                    },
                    raw: true
                });

                const sellerProfile = await getSellerProfile(userData.userId, userData.accountName, userData.marketPlaceId, geoSite);

                let start = moment();
                for (var i = 0; i < cskuData.length; i++) {
                    const channelId = cskuData[i];
                    const item = await sequelize.query(`select * from cskus where "channelId" = '${channelId}' and "userId" = '${userData.userId}' limit 1;`, { type: Sequelize.QueryTypes.SELECT });
                    console.log(item?.[0]?.channelId, i);

                    const end = moment();
                    if (end.diff(start, "hours") >= 2) {

                        const newToken = await ebayAuthToken.getAccessToken("PRODUCTION", "v^1.1#i^1#f^0#I^3#p^3#r^1#t^Ul4xMF83OjlCRjM3OUQ5RkE3M0E2RkM5MjVCNDQxOUVDNkUzMjBEXzBfMSNFXjI2MA==", scopes);

                        eBay.oAuth2.setCredentials(JSON.parse(newToken).access_token);

                        start = moment();
                    }

                    const ebayItem = await sequelize.query(`select * from cskus where copied_from_id = '${item[0]?.channelId}' or isku = '${item[0]?.isku}' or "title" = '${item[0]?.title.replace("'", "''")}' and "userId" = ${userData.userId} and "marketplaceId" = '7' limit 1;`, { type: Sequelize.QueryTypes.SELECT });

                    if (ebayItem.length == 0) {

                        console.log("Item Not Found");

                        const request = {
                            method: 'get',
                            maxBodyLength: Infinity,
                            url: `https://d854a7.myshopify.com/admin/api/2024-04/products/${item[0].channelId}.json`,
                            headers: {
                                'X-Shopify-Access-Token': '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'
                            }
                        }

                        await waiting(500);
                        let apiRes;
                        try {
                            apiRes = await axios.request(request);
                        } catch (err) {
                            console.log(err);
                            continue;
                        }

                        if (!apiRes.data.product.tags.toLowerCase().includes("luxclusif") && apiRes.data.product.status == "active" && apiRes.data.product.variants[0].inventory_quantity > 0) {

                            const category = await eBay.commerce.taxonomy.getCategorySuggestions(0, apiRes.data.product.title.replace(/[^a-zA-Z0-9 ]/g, ''));
                            const categoryId = category.categorySuggestions[0].category.categoryId;
                            const categoryName = category.categorySuggestions[0].category.categoryName;

                            const variantions = {};
                            apiRes?.data?.product?.options?.map(option => {
                                variantions[option.name] = option.values;
                            });

                            aspectData = await eBay.commerce.taxonomy.getItemAspectsForCategory(0, categoryId);

                            const requiredAspects = aspectData.aspects.filter(asp => asp.aspectConstraint.aspectRequired);
                            const completion = await openai.chat.completions.create({
                                messages: [{
                                    "role": "system", "content": `${apiRes.data.product.title} ${apiRes.data.product.body_html} ${categoryName} ${JSON.stringify(variantions)} ${JSON.stringify(variantions)}
                                            Based on the text above extract ${requiredAspects.map(asp => asp.localizedAspectName).join(", ")} return 'NA' if not found and return in object form.
                                            Note: Purity and Metal Purity are same.
                                            `}],
                                model: "gpt-3.5-turbo",
                            });

                            let aspects = {};

                            completion.choices[0].message.content?.replace("{", "").replace("}", "").split("\n")?.map(item => {
                                const [key, value] = item.split(":");
                                console.log(key, value);
                                if (key.includes("Brand")) {
                                    aspects["Brand"] = apiRes?.data?.product?.vendor;
                                } else {
                                    if ((key != "" && key && !value?.includes("NA") && (!key.includes("N/A") && !key.includes("NA")))) {
                                        aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [value?.replaceAll("*", "").replaceAll("-", "").replace("US", "").replace("(", "").replace(")", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()];
                                    } else if (value?.includes("NA")) {
                                        if (key.trim().includes('Ring Size')) {
                                            aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = ["Multiple Sizes Available"];
                                        } if (key.trim().includes('Type')) {
                                            console.log("In Type");
                                            aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [categoryName];
                                        }
                                    }
                                }
                            });

                            console.log(aspects);

                            // Create a DOM from the HTML string
                            const dom = new JSDOM(apiRes?.data?.product?.body_html);
                            const document = dom.window.document;

                            // Divide the HTML into two parts
                            const tables = Array.from(document.querySelectorAll('table'));

                            const $ = cheerio.load(apiRes?.data?.product?.body_html);
                            $('meta').remove();
                            $('table').each((i, table) => {
                                // Remove the previous heading if it's a <p> element
                                const prevElement = $(table).prev();
                                if (prevElement.is('p')) {
                                    prevElement.remove();
                                }
                                // Remove the table
                                $(table).remove();
                            });

                            let nonTableHTML = $.html();

                            const tableData = tables.map(table => {
                                const rows = Array.from(table.querySelectorAll('tr'));
                                return rows.reduce((acc, row) => {
                                    const cells = Array.from(row.querySelectorAll('td'));
                                    if (cells.length === 2) {
                                        acc[cells[0].textContent.trim()] = cells[1].textContent.trim();
                                    }
                                    return acc;
                                }, {});
                            });

                            // Define the data to be passed to the EJS template
                            const ejsData = {
                                title: apiRes?.data?.product.title,
                                desc: nonTableHTML,
                                images: apiRes?.data?.product?.images?.map((image) => image.src).slice(0, 5),
                            };

                            // const categoryId = await eBay.commerce.taxonomy.getCategorySuggestions(100, item.Title.replace(/[^a-zA-Z0-9 ]/g, ''))
                            const listingDesc = await ejs.renderFile("jamaSlider.ejs", ejsData);

                            const tableFinal = {};

                            tableData?.map((data) => {
                                Object.entries(data).map(([key, value]) => {
                                    if (!tableFinal[key] && (key != '' && value != '')) {
                                        tableFinal[key] = value;
                                    }
                                });
                            })

                            const aspectsFinal = { ...aspects, ...tableFinal }
                            console.log(aspectsFinal);
                            if (apiRes?.data.product?.variants.length > 1) {


                                const variationData = { VariationSpecificsSet: { NameValueList: [] }, Variation: [] };
                                apiRes?.data?.product?.options?.map((option) => {
                                    variationData.VariationSpecificsSet?.NameValueList.push({
                                        Name: option?.name.toLowerCase() == "size" ? "Ring Size" : option?.name,
                                        Value: option?.values
                                    })
                                });

                                apiRes?.data?.product?.variants?.map((variant, index) => {
                                    const obj = {
                                        SKU: `${variant.id}_${new Date().getTime()}`,
                                        StartPrice: mathjs.evaluate(config.priceFormula, variant?.price),
                                        Quantity: variant.inventory_quantity == 0 ? "0" : "1",
                                        VariationSpecifics: {
                                            NameValueList: [
                                            ]
                                        }
                                    }
                                    apiRes?.data?.product?.options?.map((option, index) => {
                                        obj.VariationSpecifics.NameValueList.push({
                                            Name: option.name.toLowerCase() == "size" ? "Ring Size" : option.name,
                                            Value: variant[`option${index + 1}`]
                                        })
                                    })
                                    variationData?.Variation.push(obj);
                                });

                                const variationNames = variationData?.VariationSpecificsSet?.NameValueList.map(data => data.Name.toLowerCase());
                                console.log(variationNames);
                                const ebayBody = {
                                    Item: {
                                        Country: config.Country,
                                        Currency: config.Currency,
                                        Description: listingDesc,
                                        BestOfferDetails: {
                                            BestOfferEnabled: false
                                        },
                                        ListingType: "FixedPriceItem",
                                        ListingDetails: {
                                            BindingAuction: false,
                                            HasReservePrice: false
                                        },
                                        ListingDuration: "GTC",
                                        Location: config.Location,
                                        PrimaryCategory: {
                                            "CategoryID": categoryId == '90977' ? "179753" : categoryId,
                                            "CategoryName": categoryName
                                        },
                                        PrivateListing: true,
                                        Site: config.Site,
                                        Title: apiRes.data.product.title,
                                        PictureDetails: {
                                            GalleryType: "Gallery",
                                            PictureURL: ejsData.images
                                        },
                                        SKU: apiRes?.data?.product?.variants[0]?.sku,
                                        Variations: variationData,
                                        ItemSpecifics: {
                                            NameValueList: Object.entries(aspectsFinal)?.map(([key, value]) => {
                                                if (key == "Item ID") { return };
                                                if (!variationNames.includes(key.toLowerCase())) {
                                                    return {
                                                        Name: key,
                                                        Value: value
                                                    }
                                                };
                                            }).filter(Boolean)
                                        },
                                        ConditionID: config.ConditionId,
                                        SellerProfiles: sellerProfile,
                                    },
                                };

                                await eBay.trading.AddItem(ebayBody).then(async (data) => {
                                    const message = `Data for ${item[0].channelId} with Item ID ${data.ItemID} has been successfully listed on eBay.`;

                                    const ebayRes = await eBay.trading.GetItem({
                                        ItemID: data.ItemID,
                                        DetailLevel: "ReturnAll",
                                        IncludeItemCompatibilityList: true,
                                        IncludeItemSpecifics: true
                                    });

                                    const pushDataBody = {
                                        ItemArray: {
                                            Item: [
                                                ebayRes.Item
                                            ]
                                        }
                                    };

                                    await pushData(pushDataBody);

                                    failedProducts.push({
                                        ItemId: item[0].channelId,
                                        Status: "success",
                                        Error: "",
                                        Message: message
                                    });

                                }).catch(err => {
                                    failedProducts.push({
                                        ItemId: item[0].channelId,
                                        Status: "Failed",
                                        Error: JSON.stringify(err),
                                        Message: `Data for ${item[0].channelId} has not been listed on eBay due to ${err.message}`
                                    });
                                });
                            } else if (apiRes?.data?.product?.variants?.length == 1) {

                                const ebayBody = {
                                    Item: {
                                        Country: config.Country,
                                        Currency: config.Currency,
                                        Description: listingDesc,
                                        BestOfferDetails: {
                                            BestOfferEnabled: false
                                        },
                                        ListingType: "FixedPriceItem",
                                        ListingDetails: {
                                            BindingAuction: false,
                                            HasReservePrice: false
                                        },
                                        ListingDuration: "GTC",
                                        Location: config.Location,
                                        PrimaryCategory: {
                                            "CategoryID": categoryId == '90977' ? "179753" : categoryId,
                                            "CategoryName": categoryName
                                        },
                                        PrivateListing: true,
                                        Quantity: apiRes?.data?.product?.variants[0]?.inventory_quantity == 0 ? "0" : "1",
                                        Site: config.Site,
                                        StartPrice: mathjs.evaluate(config.priceFormula, apiRes?.data?.product?.variants[0]?.price),
                                        Title: item[0].title,
                                        PictureDetails: {
                                            GalleryType: "Gallery",
                                            PictureURL: ejsData.images
                                        },
                                        SKU: apiRes?.data?.product?.variants?.sku,
                                        ItemSpecifics: {
                                            NameValueList: Object.entries(aspectsFinal)?.map(([key, value]) => {
                                                if (key == "Item ID") { return };
                                                return {
                                                    Name: key,
                                                    Value: value
                                                }
                                            }).filter(Boolean)
                                        },
                                        ConditionID: config.ConditionId,
                                        SellerProfiles: sellerProfile,
                                    },
                                };

                                await eBay.trading.AddItem(ebayBody).then(async (data) => {

                                    const ebayRes = await eBay.trading.GetItem({
                                        ItemID: data.ItemID,
                                        DetailLevel: "ReturnAll",
                                        IncludeItemCompatibilityList: true,
                                        IncludeItemSpecifics: true
                                    });

                                    const pushDataBody = {
                                        ItemArray: {
                                            Item: [
                                                ebayRes.Item
                                            ]
                                        }
                                    };

                                    await pushData(pushDataBody);

                                    failedProducts.push({
                                        ItemId: item[0].channelId,
                                        Status: "success",
                                        Error: "",
                                        Message: message
                                    });

                                }).catch(err => {
                                    const message = `Data for ${item[0].channelId} has not been listed on eBay due to ${err.message}`;
                                    failedProducts.push({
                                        ItemId: item[0].channelId,
                                        Status: "Failed",
                                        Error: JSON.stringify(err),
                                        Message: message
                                    });
                                });

                            }
                        }

                    }
                    else if (ebayItem.length > 0) {

                        console.log("Item Found");

                        const request = {
                            method: 'get',
                            maxBodyLength: Infinity,
                            url: `https://d854a7.myshopify.com/admin/api/2024-04/products/${item[0].channelId}.json`,
                            headers: {
                                'X-Shopify-Access-Token': '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'
                            }
                        }

                        await waiting(500);
                        let apiRes;
                        try {
                            apiRes = await axios.request(request);
                        } catch (err) {
                            console.log(err);
                            continue;
                        }

                        console.log(apiRes.data);

                        if (apiRes.data.product.variants.length > 1) {

                            let variantNotFound = false;
                            for (var x = 0; x < apiRes.data.product.variants.length; x++) {
                                const Variant = apiRes.data.product.variants[x];

                                const variantExist = await sequelize.query(`select * from cskus where "channelId" = '${item[0].channelId}' and "userId" = '55eaebf8-ff92-47a4-a076-0caf53f81723' and "variantId" = '${Variant.id}' limit 1;`, { type: Sequelize.QueryTypes.SELECT });

                                if (variantExist.length == 0) {
                                    variantNotFound = true;
                                    break;
                                }

                            }

                            if (variantNotFound) {
                                console.log("Variant Not Found");
                                const ebayItem = await sequelize.query(`select * from cskus where "title" = '${item[0].title}' and "userId" = '55eaebf8-ff92-47a4-a076-0caf53f81723' and "marketplaceId" = '7' limit 1;`, { type: Sequelize.QueryTypes.SELECT });
                                console.log(ebayItem[0].channelId);
                                if (ebayItem.length > 0) {

                                    let ebayRes

                                    try {

                                        ebayRes = await eBay.trading.GetItem({
                                            ItemID: ebayItem[0].channelId,
                                            DetailLevel: "ReturnAll",
                                            IncludeItemCompatibilityList: true,
                                            IncludeItemSpecifics: true
                                        });
                                    } catch (err) {
                                        console.log(err.message);
                                        logger.write(`Data errored for ${ebayItem[0].channelId} because ${err.message}\n`);
                                        continue;
                                    }


                                    const variationData = { VariationSpecificsSet: { NameValueList: [] }, Variation: [] };
                                    apiRes?.data?.product?.options?.map((option) => {
                                        variationData.VariationSpecificsSet?.NameValueList.push({
                                            Name: option?.name.toLowerCase() == "size" ? "Ring Size" : option?.name,
                                            Value: option?.values
                                        })
                                    });

                                    apiRes?.data?.product?.variants?.map((variant, index) => {
                                        const obj = {
                                            SKU: `${variant.id}_${new Date().getTime()}`,
                                            StartPrice: mathjs.evaluate(config.priceFormula, variant?.price),
                                            Quantity: variant.inventory_quantity == 0 ? "0" : "1",
                                            VariationSpecifics: {
                                                NameValueList: [
                                                ]
                                            }
                                        }
                                        apiRes?.data?.product?.options?.map((option, index) => {
                                            obj.VariationSpecifics.NameValueList.push({
                                                Name: option.name.toLowerCase() == "size" ? "Ring Size" : option.name,
                                                Value: variant[`option${index + 1}`]
                                            })
                                        })
                                        variationData?.Variation.push(obj);
                                    });

                                    const variationNames = variationData?.VariationSpecificsSet?.NameValueList.map(data => data.Name.toLowerCase());

                                    const ebayBody = {
                                        Item: {
                                            Country: config.Country,
                                            Currency: config.Currency,
                                            Description: ebayRes.Item.Description,
                                            BestOfferDetails: {
                                                BestOfferEnabled: false
                                            },
                                            ListingType: "FixedPriceItem",
                                            ListingDetails: {
                                                BindingAuction: false,
                                                HasReservePrice: false
                                            },
                                            ListingDuration: "GTC",
                                            Location: config.Location,
                                            PrimaryCategory: {
                                                "CategoryID": ebayRes.Item.PrimaryCategory.CategoryID,
                                                "CategoryName": ebayRes.Item.PrimaryCategory.CategoryName
                                            },
                                            PrivateListing: true,
                                            Site: config.Site,
                                            Title: item[0].title + " ABC",
                                            PictureDetails: {
                                                GalleryType: "Gallery",
                                                PictureURL: ebayRes.Item.PictureDetails.PictureURL
                                            },
                                            SKU: apiRes?.data?.product?.variants[0]?.sku,
                                            Variations: variationData,
                                            ItemSpecifics: {
                                                NameValueList: ebayRes.Item.ItemSpecifics.NameValueList.filter(data => !variationNames.includes(data.Name.toLowerCase()))
                                            },
                                            ConditionID: config.ConditionId,
                                            SellerProfiles: sellerProfile,
                                        },
                                    };

                                    await eBay.trading.AddItem(ebayBody).then(async (data) => {
                                        const message = `Data for ${ebayItem[0].channelId} with Item ID ${data.ItemID} has been successfully listed on eBay.`;
                                        logger.write(`${message}\n`);
                                        console.log(data);

                                        await eBay.trading.EndItem({
                                            ItemID: ebayItem[0].channelId,
                                            EndingReason: "NotAvailable"
                                        });

                                        const ebayRes = await eBay.trading.GetItem({
                                            ItemID: data.ItemID,
                                            DetailLevel: "ReturnAll",
                                            IncludeItemCompatibilityList: true,
                                            IncludeItemSpecifics: true
                                        });

                                        const pushDataBody = {
                                            ItemArray: {
                                                Item: [
                                                    ebayRes.Item
                                                ]
                                            }
                                        };

                                        await pushData(pushDataBody);

                                        failedProducts.push({
                                            ItemId: item[0].channelId,
                                            Status: "success",
                                            Error: "",
                                            Message: message
                                        });

                                    }).catch(err => {
                                        const message = `Data for ${item[0].channelId} has not been listed on eBay due to ${err.message}`;
                                        failedProducts.push({
                                            ItemId: item[0].channelId,
                                            Status: "Failed",
                                            Error: JSON.stringify(err),
                                            Message: message
                                        });
                                    });

                                }

                            } else {
                                console.log("No New Variant Found");
                            }

                        }

                    }
                }
            }


        }

        if (failedProducts.length > 0) {
            const currentDate = moment().format("DD-MM-YYYY");
            const mailOptions = {
                from: process.env.FROM_EMAIL,
                to: fileOptions.recipients, // Multiple recipients passed in fileOptions
                subject: `Failed Auto Create Report - ${currentDate}`,
                text: `Hello, please find the attached failed update report.`,
                attachments: [
                    {
                        filename: `Failed_Sellerpundit_Auto_Create_Report_${currentDate}.xlsx`,
                        path: s3Response.Location // S3 file location
                    }
                ]
            };

            await sendUpdateReportEmail(mailOptions);
        }

    } catch (err) {
        console.log(err);
    }
}