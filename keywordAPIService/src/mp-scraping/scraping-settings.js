const ScrapingSettings = require('../models/scraping-settings');
const { getRedisClient } = require('../helper/redis-client');

const getMarketplaceXpath = async (marketplace) => {
    const redisClient = await getRedisClient();
    const cacheKey = `xpath:${marketplace}`;
    const cachedValue = await redisClient.get(cacheKey);

    if (cachedValue) {
        return JSON.parse(cachedValue);
    }

    const settings = await ScrapingSettings.findOne({
        where: {
            type: 'xpath',
            name: marketplace,
            is_active: true,
        },
    });

    if (settings) {
        await redisClient.set(cacheKey, JSON.stringify(settings.value), 'EX', 3600); // Cache for 1 hour
        return settings.value;
    }
    return settings ? settings.value : null;
};

const setMarketplaceXpath = async (marketplace, value) => {
    const redisClient = await getRedisClient();

    const cacheKey = `xpath:${marketplace}`;

    const settings = await ScrapingSettings.findOne({
        where: {
            type: 'xpath',
            name: marketplace,
        },
    });

    if (settings) {
        await settings.update({ value });
    } else {
        await ScrapingSettings.create({
            type: 'xpath',
            name: marketplace,
            value,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
        });
    }
    await redisClient.set(cacheKey, JSON.stringify(value), 'EX', 3600); // Cache for 1 hour
    return value;
};

const getAllowedMarketplaces = async () => {
    const redisClient = await getRedisClient();
    const cacheKey = 'allowed_marketplaces';
    const cachedValue = await redisClient.get(cacheKey);

    if (cachedValue) {
        return JSON.parse(cachedValue);
    }

    const settings = await ScrapingSettings.findAll({
        where: {
            type: 'xpath',
            is_active: true,
        },
    });

    if (settings) {
        const allowedMarketplaces = settings.map((setting) => {
            return {
                id: setting.name,
                country: setting?.value?.countryCode,
                name: setting?.value?.name,
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
        await redisClient.set(cacheKey, JSON.stringify(allowedMarketplaces), 'EX', 3600); // Cache for 1 hour
        return allowedMarketplaces;
    }
    return [];
};

module.exports = {
    getMarketplaceXpath,
    setMarketplaceXpath,
    getAllowedMarketplaces,
};


