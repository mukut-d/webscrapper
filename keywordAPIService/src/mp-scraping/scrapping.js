const ScrapingAntClient = require('@scrapingant/scrapingant-client');
const config = require('../config');
const { getProductUrl } = require('../helper/helper');
const { convertHtlmToJson } = require('../helper/marketplace-selectors');
const { createAccountTransaction } = require('../transactions/token-transactions');
const { v4: uuid } = require('uuid');
const { sequelize } = require('../database/config');
const { default: axios } = require('axios');
const qs = require('qs');
const { extractDataFromHtml } = require('./scraping-helper');
const ScrapingHistory = require('../models/scrapingHistory');
const { getAllowedMarketplaces } = require('./scraping-settings');

const scrapeProduct = async (url, countryCode, marketplace) => {
    const scrapingantClient = new ScrapingAntClient({
        apiKey: config.scraping_ant_apikey,
    });

    const response = await scrapingantClient.scrape(url, {
        browser: false,
        proxy_country: countryCode || config.default_proxy_country,
        timeout: 10000,
    });

    if (!response?.content) {
        throw new Error(`Scraping failed with status: ${response.status}, message: ${response.message}`);
    }

    const jsonResponse = await convertHtlmToJson(response.content, marketplace);
    if (!jsonResponse) {
        throw new Error('Failed to parse response content');
    }
    return jsonResponse;
};

const searchViaScrapeOps = async (url, marketplace) => {
    const proxyParams = {
        url,
        api_key: config.scrape_ops_api_key,
    };

    const proxyUrl = 'https://proxy.scrapeops.io/v1/?' + qs.stringify(proxyParams);
    const requestOptions = {
        url: proxyUrl,
        method: 'GET',
        timeout: 30000,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    const result = await axios(requestOptions);

    if (result.status !== 200) {
        throw new Error(`Scraping failed with status: ${result.status}, message: ${result.statusText}`);
    }

    // Format the data for extraction
    const htmlData = {
        html: result.data,
        id: uuid(),
        marketplaceId: marketplace,
        scrap_count: 0,
        isScraped: false,
        asin: '', // Add if available
        url: url,
        domain: new URL(url).hostname
    };

    return await extractDataFromHtml(htmlData, marketplace);
};

const searchProduct = async (req, res) => {
    try {
        let started_at = new Date();
        const params = req.body || {};

        const url = getProductUrl(req.body || {});

        const countryCode = params.countryCode || config.default_proxy_country;
        const marketplace = params.marketplace;

        if (!marketplace) {
            return res.status(400).json({ error: 'Invalid Marketplace' });
        }

        if (!url) {
            return res.status(400).json({ error: 'Invalid Search Query' });
        }

        const result = await searchViaScrapeOps(url, marketplace);

        if (!result) {
            return res.status(500).json({ error: 'Failed to scrape product' });
        }

        // Save scraping log
        await ScrapingHistory.create({
            user_id: req.user ? req.user.id : req.trialId,
            url: url.slice(0, 255),
            marketplace,
            started_at,
            keyword: params.query.slice(0, 255),
            status: 'success',
            finished_at: new Date(),
            details: result,
            token_used: config.token_per_scraping,
        });

        // log the usage of the API

        // init sequelize transaction for update

        if (req.user) {
            const transaction = await sequelize.transaction();
            // update the credits

            await createAccountTransaction(
                req.user.id,
                {
                    token_usage: config.token_per_scraping,
                    type: 'debit',
                    transactionId: uuid(),
                    status: 'completed',
                    description: 'Scraping product',
                },
                { transaction }
            );

            await transaction.commit();
        }

        return res.status(200).json({ data: result });
    } catch (error) {
        // Save scraping log for failure
        try {
            await ScrapingHistory.create({
                user_id: req.user ? req.user.id : req.trialId,
                url: url.slice(0, 255),
                marketplace,
                started_at,
                keyword: params.query.slice(0, 255),
                finished_at: new Date(),
                status: 'error',
                details: {
                    message: error.message,
                    reason: error.reason,
                    statusCode: error.statusCode,
                    status: error.status,
                },
            });
        } catch (logErr) {
            // Ignore logging errors
        }
        return res.status(error.status || 400).json({
            message: error.message || 'Internal Server Error'
        });
    }
};

const searchBulk = async (req, res) => {
    try {
        const { urls, countryCode } = req.body || {};

        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ error: 'Invalid Input' });
        }

        const results = await Promise.all(
            urls.map((url) => scrapeProduct(url, countryCode))
        );

        return res.status(200).json({ data: results });
    } catch (error) {
        console.error('Error in searchBulk:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

const getMarketplaces = async (req, res) => {
    try {
        const allowedMarketplaces = await getAllowedMarketplaces();
        return res.status(200).json({ data: allowedMarketplaces });
    } catch (error) {
        console.error('Error in getAllowedMarketplaces:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    searchProduct,
    searchBulk,
    getMarketplaces,
};
