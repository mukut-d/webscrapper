const Project = require("../../../models/project")
const UniqueProduct = require("../../../models/uniqueProduct")
const order = require("../../../models/order")
const csku = require("../../../models/csku")
const isku = require("../../../models/isku")
const inbound = require("../../../models/inbound")
const Tokens = require("../../../models/tokens")
const Marketplace = require("../../../models/marketplace")
const Geosite = require("../../../models/geosite")
const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const { Op, Sequelize } = require('sequelize');
const moment = require('moment');
const getSymbolFromCurrency = require('currency-symbol-map')
const { apiCallLog } = require("../../../helper/apiCallLog")


const ebayAuthToken = new EbayAuthToken({
    clientId: process.env.APP_ID,
    clientSecret: process.env.CERT_ID,
});

const scopes = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.marketing",
    "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.finances",
    "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
    "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.reputation",
    "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
    "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
    "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.stores",
    "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
];

const getProductResearchCount = async (req, res) => {
    try {
        const { user_id } = req.query;

        await apiCallLog("dashboard", "dashboard", "getProductResearchCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");

        const projects = await Project.findAll({
            where: {
                user_id
            }
        })

        const projectIds = projects.map((project) =>
            project.dataValues.id
        )

        const productCount = await UniqueProduct.count({
            where: {
                projectId: {
                    [Op.overlap]: projectIds
                }
            }
        })

        await apiCallLog("dashboard", "dashboard", "getProductResearchCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");

        res.status(200).json({
            status: 'success',
            data: {
                productCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the product research count.'
        });
    }
}

const getOrderCount = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getOrderCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");

        const orderCount = await order.count({
            where: {
                userId: user_id
            }
        });
        await apiCallLog("dashboard", "dashboard", "getOrderCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");

        res.status(200).json({
            status: 'success',
            data: {
                orderCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the order count.'
        });
    }
}

const getInventoryCount = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getInventoryCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");

        const inventoryCount = await isku.count({
            where: {
                userId: user_id
            }
        });

        await apiCallLog("dashboard", "dashboard", "getInventoryCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");

        res.status(200).json({
            status: 'success',
            data: {
                inventoryCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the inventory count.'
        });
    }
}

const getCatalogueCount = async (req, res) => {
    try {
        const { user_id } = req.query;

        await apiCallLog("dashboard", "dashboard", "getCatalogueCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");

        const catalogueCount = await csku.count({
            where: {
                userId: user_id
            }
        });

        await apiCallLog("dashboard", "dashboard", "getCatalogueCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");

        res.status(200).json({
            status: 'success',
            data: {
                catalogueCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the catalogue count.'
        });
    }
}

const getInboundCount = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getInboundCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const userIskus = await isku.findAll({
            where: {
                userId: user_id
            },
            attributes: ['isku']
        });

        const iskuIds = userIskus.map(item => item.isku);

        const inboundCount = await inbound.count({
            where: {
                isku: {
                    [Op.in]: iskuIds
                }
            }
        });
        await apiCallLog("dashboard", "dashboard", "getInboundCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        res.status(200).json({
            status: 'success',
            data: {
                inboundCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the inbound count.'
        });
    }
}

const getBestSellerProducts = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getBestSellerProducts", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const userOrders = await order.findAll({
            where: {
                userId: user_id
            },
            attributes: ['items']
        });

        const itemIds = userOrders.flatMap(order =>
            order.items.map(item => item.itemId)
        );

        const countOccurrences = arr => {
            const count = {};
            for (let i = 0; i < arr.length; i++) {
                if (count[arr[i]]) {
                    count[arr[i]]++;
                } else {
                    count[arr[i]] = 1;
                }
            }
            return count;
        };
        const occurrences = countOccurrences(itemIds);

        const sortedOccurrences = Object.entries(occurrences).sort(([, a], [, b]) => b - a);
        const top5 = sortedOccurrences.slice(0, 5).map(([itemId, count]) => {
            const item = userOrders.find(order => order.items.some(item => item.itemId === itemId)).items.find(item => item.itemId === itemId);
            const currencySymbol = getSymbolFromCurrency(item.itemCost.currency);
            return {
                itemId,
                count,
                image: 'static_image_url', // replace with your static image URL
                icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbmAX2VA4hpQrNZ5xdVIS-rtHIssqCcta9E1_n8I-mdQ&s',
                price: currencySymbol + item.itemCost.value,
                currency: item.itemCost.currency
            };
        });
        await apiCallLog("dashboard", "dashboard", "getBestSellerProducts", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        res.status(200).json({
            status: 'success',
            data: top5
        });
    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching the best seller products.'
        });
    }
};

const getAccountOrderCount = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getAccountOrderCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        if (user_id) {
            const tokens = await Tokens.findAll({
                where: {
                    userId: user_id,
                },
            });

            const accountNames = tokens?.map(
                (token) => token?.dataValues?.accountName
            );

            if (accountNames.length > 0) {
                let counts = await Promise.all(accountNames.map(async (accountName) => {
                    const count = await order.count({
                        where: {
                            accountName: accountName,
                        },
                    });

                    return { name: accountName, count };
                }));

                // Sort the counts in descending order
                counts.sort((a, b) => b.count - a.count);

                let otherCount = 0;
                if (counts.length > 4) {
                    // Calculate the 'other' count
                    otherCount = counts.slice(4).reduce((total, item) => total + item.count, 0);
                    // Keep only the top 4 counts
                    counts = counts.slice(0, 4);
                }

                // Add the 'other' count
                counts.push({ name: 'other', count: otherCount });

                // Calculate the total count
                const total = counts.reduce((total, item) => total + item.count, 0);
                await apiCallLog("dashboard", "dashboard", "getAccountOrderCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
                return res.status(200).json({
                    success: true,
                    status: 200,
                    counts,
                    total,
                });
            } else {
                await apiCallLog("dashboard", "dashboard", "getAccountOrderCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: "No accounts found for this user",
                });
            }
        }
    } catch (err) {
        console.log('Error:', err);
        return res.status(500).json({
            success: false,
            status: 500,
            message: err.message,
        });
    }
};

const getOrderStatusCount = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getOrderStatusCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const statuses = ["unpaid", "paid", "packed", "partially_shipped", "shipped", "delivered", "canceled"];
        let counts = await Promise.all(statuses.map(async (status) => {
            const count = await order.count({
                where: { status: status, userId: user_id },
            });

            return { name: status, count };
        }));

        // Sort the counts in descending order
        counts.sort((a, b) => b.count - a.count);

        let otherCount = 0;
        if (counts.length > 4) {
            // Calculate the 'other' count
            otherCount = counts.slice(4).reduce((total, item) => total + item.count, 0);
            // Keep only the top 4 counts
            counts = counts.slice(0, 4);
        }

        // Add the 'other' count
        counts.push({ name: 'other', count: otherCount });

        // Calculate the total count
        const total = counts.reduce((total, item) => total + item.count, 0);
        await apiCallLog("dashboard", "dashboard", "getOrderStatusCount", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        return res.status(200).json({
            success: true,
            status: 200,
            counts,
            total,
        });
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            success: false,
            status: 400,
            message: error.message,
        });
    }
};

const getDailySales = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getDailySales", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const startDate = moment().subtract(9, 'days').startOf('day');
        const endDate = moment().endOf('day');

        const orders = await order.findAll({
            where: {
                userId: user_id,
                createdAt: {
                    [Op.between]: [startDate.toDate(), endDate.toDate()]
                }
            },
            attributes: [
                [Sequelize.fn('date_trunc', 'day', Sequelize.col('createdAt')), 'day'],
                [Sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['day'],
            order: [[Sequelize.col('day'), 'ASC']]
        });

        const counts = [];
        for (let m = moment(startDate); m.isBefore(endDate) || m.isSame(endDate); m.add(1, 'days')) {
            const orderForDay = orders.find(o => moment(o.getDataValue('day')).isSame(m, 'day'));
            counts.push({
                day: m.format('DD MMM'),
                count: orderForDay ? orderForDay.getDataValue('count') : 0
            });
        }
        await apiCallLog("dashboard", "dashboard", "getDailySales", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        return res.status(200).json({
            success: true,
            status: 200,
            counts
        });
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            success: false,
            status: 400,
            message: error.message,
        });
    }
};

const getPricePosition = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getPricePosition", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const priceBrackets = [
            { min: 1, max: 10 },
            { min: 10, max: 20 },
            { min: 20, max: 50 },
            { min: 50, max: 100 },
            { min: 100, max: 150 },
            { min: 150, max: 200 },
            { min: 200, max: 500 },
            { min: 500, max: 1000 },
            { min: 1000 }
        ];

        const currencies = await csku.findAll({
            where: { userId: user_id },
            attributes: ['currency'],
            group: ['currency']
        });

        const counts = await Promise.all(currencies.map(async (currency) => {
            const currencyValue = currency.getDataValue('currency');
            const priceBracketCounts = await Promise.all(priceBrackets.map(async (priceBracket) => {
                const whereClause = {
                    userId: user_id,
                    currency: currencyValue,
                    price: priceBracket.max
                        ? { [Op.and]: [Sequelize.where(Sequelize.cast(Sequelize.col('price'), 'float'), '>=', priceBracket.min), Sequelize.where(Sequelize.cast(Sequelize.col('price'), 'float'), '<', priceBracket.max)] }
                        : Sequelize.where(Sequelize.cast(Sequelize.col('price'), 'float'), '>=', priceBracket.min)
                };

                const count = await csku.count({ where: whereClause });

                return { priceBracket: priceBracket.max ? `${priceBracket.min}-${priceBracket.max}` : `${priceBracket.min}+`, count };
            }));

            return { currency: currencyValue, priceBracketCounts };
        }));
        await apiCallLog("dashboard", "dashboard", "getPricePosition", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        return res.status(200).json({
            success: true,
            status: 200,
            counts
        });
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            success: false,
            status: 400,
            message: error.message,
        });
    }
};

const getTopBrands = async (req, res) => {
    try {
        const { user_id } = req.query;
        await apiCallLog("dashboard", "dashboard", "getTopBrands", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "started");
        const logos = await Marketplace.findAll({
            where: {
                id: { [Op.in]: [6, 7] }
            },
            attributes: ['image']
        });
        await apiCallLog("dashboard", "dashboard", "getTopBrands", { user_id, time: moment().add(5, "hours").add(30, "minutes").toISOString() }, {}, {}, "ended");
        return res.status(200).json({
            success: true,
            status: 200,
            logos
        });
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            success: false,
            status: 400,
            message: error.message,
        });
    }
};

module.exports = { getProductResearchCount, getOrderCount, getInventoryCount, getCatalogueCount, getInboundCount, getBestSellerProducts, getAccountOrderCount, getOrderStatusCount, getDailySales, getPricePosition, getTopBrands }