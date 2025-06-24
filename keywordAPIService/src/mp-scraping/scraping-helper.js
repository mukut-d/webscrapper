// const newrelic = require('newrelic');
const moment = require('moment');
const cheerio = require('cheerio');
const { DOMParser: dom } = require('xmldom');
const xpath = require('xpath');
const { getMarketplaceXpath } = require('./scraping-settings');

async function extractDataFromHtml(htmlData, marketplace) {
    if (!htmlData) {
        throw new Error('Scraping failed: No HTML data provided');
    }

    try {

        const html = htmlData.html;

        const data = {
            id: htmlData.id,
            isScraped: htmlData.isScraped || true,
            marketplaceId: marketplace,
            domain: htmlData.domain,
        };

        if (!html || html === '') {
            data.isScraped = false;
            data.scrap_count = htmlData.scrap_count + 1 === 4 ? 0 : htmlData.scrap_count + 1;
            data.marketplaceId = marketplace;
            data.asin = htmlData.asin;
            data.url = htmlData.url;
            data.domain = htmlData.domain;
            data.pushed_in_queue = false;
            data.is_failed = data.scrap_count === 0 ? true : false;
            data.reason = 'HTML Not Found';
            data.title = 'Not Found';
            data.mrp = 'Not Found';
            data.price = 'Not Found';
            data.brand = 'Not Found';
            data.seller = 'Not Found';
            data.is_failed = false;
            return data;
        }

        const processedData = await processProductData(data, marketplace, htmlData);
        return processedData;
    } catch (error) {
        // newrelic.recordCustomEvent('ScrapingAPIError', {
        //     error: error.message,
        //     timestamp: new Date().toISOString(),
        //     batchSize: htmlData?.length
        // });
        throw error;
    }
}

// Helper function to format date
const formatDate = (addDays = 0) => {
    return moment()
        .add(5, 'hours')
        .add(30, 'minutes')
        .add(addDays, 'days')
        .format('YYYY-MM-DD');
};

// Helper function to process single product data
const processProductData = async (data, marketplace, htmlData) => {
    try {
        const html = htmlData.html;
        const $ = cheerio.load(html);
        const doc = new dom({ errorHandler: function () { } }).parseFromString($.xml());
        let oufOfStock = false;

        const marketplaceScrapingSettings = await getMarketplaceXpath(marketplace);

        if (!marketplaceScrapingSettings) {
            throw new Error(`No scraping settings found for marketplace: ${marketplace}`);
        }

        const marketplaceXpaths = marketplaceScrapingSettings.xpaths;

        Object.entries(marketplaceXpaths).forEach(([key, value]) => {
            for (let j = 0; j < value.length; j++) {
                const nodes = xpath.select(value[j], doc);
                if (nodes.length > 0) {
                    let values = nodes[0]?.textContent?.toString()?.trim() || 'Not Found';
                    data[key] = values;
                    break;
                } else {
                    data[key] = 'Not Found';
                }
            }
        });

        if (data.pages === 'Not Found') {
            data.pages = 0;
        }

        if (oufOfStock) {
            data.price = 'OOS';
            data.reason = 'Out Of Stock';
        }

        return data;
    } catch (error) {
        console.error('Error processing product:', error);
        return {
            ...data,
            isScraped: false,
            error: error.message
        };
    }
};

module.exports = {
    extractDataFromHtml
};
