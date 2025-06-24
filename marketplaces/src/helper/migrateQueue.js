const Bull = require('bull');
const moment = require('moment');
const csku = require('../models/csku');
const Tokens = require('../models/tokens');
const ebay = require("ebay-api");
const apiCallLog = require("./apiCallLog")

const migrateQueue = new Bull('migrateQueue', {
    redis: {
        host: 'localhost',
        port: 6379,
        // add other Redis options if needed
    },
});

const count = {
    count: 0,
    date: moment()
};

migrateQueue.process(async (job) => {
    const functionName="migrateQueue.process"
    try {

        const todaysDate = moment();
        const accountName = job.data[0].accountName;
        const userId = job.data[0].userId;

        const token = await Tokens.findOne({ userId: userId, accountName: accountName });

        if (token) {

            const finalData = [];

            const eBay = new ebay({
                appId: process.env.APP_ID,
                certId: process.env.CERT_ID,
                sandbox: false,
                devId: process.env.DEV_ID,
                autoRefreshToken: true,
            });

            eBay.OAuth2.setCredentials(token.dataValues.token);

            while (count.count <= 1000 && count.date.startOf('day').diff(todaysDate, "hours") < 24) {

                const { id, listingId, sku, status } = job.data[i];

                if (status === "live") {

                    await eBay.trading.ReviseItem({
                        Item: {
                            ItemID: listingId,
                            SKU: sku
                        }
                    });
                    await apiCallLog("ReviseItem","/messages/fetch-messages",functionName,{Item: {
                        ItemID: listingId,
                        SKU: sku
                    }}, {},{}, 'success');

                    await eBay.sell.inventory.bulkMigrateListing({
                        requests: [
                            {
                                listingId: listingId
                            }
                        ]
                    });
                    await apiCallLog("bulkMigrateListing","/bulkMigrateListing",functionName,{
                        requests: [
                            {
                                listingId: listingId
                            }
                        ]
                    }, {},{}, 'success');

                    const data = await eBay.sell.inventory.getInventoryItem(csku.dataValues.isku);

                    const aspects = data.product.aspects

                    const offerData = await eBay.sell.inventory.getOffers({
                        sku: csku.dataValues.isku,
                    });

                    const offerId = offerData.offers[0].offerId;

                    let compatibility = []
                    try {
                        const itemCompatibility = await eBay.sell.inventory.getProductCompatibility(csku.dataValues.isku);
                        compatibility = itemCompatibility.compatibleProducts;
                    } catch (err) {
                        console.log(err);
                    }

                    finalData.push({
                        id: id,
                        itemSpecifics: aspects,
                        itemCompatibility: compatibility,
                        offerId: offerId,
                        is_migrated: true
                    });

                } else if (status === "completed") {
                    const data = await eBay.trading.GetItem({
                        ItemID: csku.dataValues.channelId,
                        IncludeItemCompatibilityList: true,
                        IncludeItemSpecifics: true,
                        DetailLevel: "ReturnAll",
                    });
                    await apiCallLog("GetItem","/getItem",functionName,{
                        ItemID: csku.dataValues.channelId,
                        IncludeItemCompatibilityList: true,
                        IncludeItemSpecifics: true,
                        DetailLevel: "ReturnAll",
                    }, data,{}, 'success');

                    let aspects = {};
                    data.Item?.ItemSpecifics?.NameValueList?.map(item => {
                        aspects[item.Name] = [item.value];
                    });

                    let compatibility = [];
                    const obj = { compatibilityProperties: [] };
                    data.Item?.ItemCompatibilityList?.Compatibility?.map(item => {
                        const obj1 = { productFamilyProperties: {} }
                        item.NameValueList?.map(list => {
                            obj1.productFamilyProperties[list.Name] = list.Value;
                        });
                        obj.compatibilityProperties.push(obj1);
                    });
                    compatibility.push(obj);

                    finalData.push({
                        id: id,
                        itemSpecifics: aspects,
                        itemCompatibility: compatibility,
                        is_migrated: false
                    });

                }

            }

            await csku.bulkCreate(finalData, { updateOnDuplicate: ["itemSpecifics", "itemCompatibility", "offerId", "is_migrated"] });
        }

    } catch (err) {
        await apiCallLog("MigrateQueue","NIL",functionName,{
            requests: [
                {
                    listingId: listingId
                }
            ]
        },{},err.meta, 'error');
        console.log(err);
    }
});