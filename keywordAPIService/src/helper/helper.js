const sanitizeString = (str, isUpper = false) => {
    if (!str) return str;

    // Remove any leading or trailing whitespace
    str = str.trim();
    // Replace multiple spaces with a single space
    str = str.replace(/\s+/g, ' ');
    // Convert to lowercase
    str = str.toLowerCase();

    if (isUpper) {
        // Convert to uppercase
        str = str.toUpperCase();
    }
    return str;
};

const isValidUrl = (str) => {
    try {
        new URL(str);
        return true;
    } catch (err) {
        return false;
    }
};

const allowedMarketplaces = [
    'amazon',
    'ebay',
    'walmart',
    'bestbuy',
    'target',
    'aliexpress',
    'flipkart',
    'snapdeal',
    'shopclues',
    'paytm',
    'myntra',
    'ajio',
    'tatacliq',
    'croma',
    'reliancedigital',
    'infibeam',
    'firstcry',
    'nykaa',
    'zivame',
];

const marketplaceToUrlMap = {
    // Global marketplaces
    amazon: (country, input) => `https://www.amazon.${country || 'com'}/s?k=${encodeURIComponent(input)}`,
    ebay: (country, input) => `https://www.ebay.${country || 'com'}/sch/i.html?_nkw=${encodeURIComponent(input)}`,
    walmart: (country, input) => `https://www.walmart.${country || 'com'}/search/?query=${encodeURIComponent(input)}`,
    bestbuy: (country, input) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(input)}`,
    target: (country, input) => `https://www.target.${country || 'com'}/s?searchTerm=${encodeURIComponent(input)}`,
    aliexpress: (country, input) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(input)}`,

    // Indian marketplaces
    flipkart: (country, input) => `https://www.flipkart.com/search?q=${encodeURIComponent(input)}`,
    snapdeal: (country, input) => `https://www.snapdeal.com/search?keyword=${encodeURIComponent(input)}`,
    shopclues: (country, input) => `https://www.shopclues.com/search?q=${encodeURIComponent(input)}`,
    paytm: (country, input) => `https://paytmmall.com/shop/search?q=${encodeURIComponent(input)}`,
    myntra: (country, input) => `https://www.myntra.com/${encodeURIComponent(input)}`,
    ajio: (country, input) => `https://www.ajio.com/search/?text=${encodeURIComponent(input)}`,
    tatacliq: (country, input) => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(input)}`,
    croma: (country, input) => `https://www.croma.com/search/?q=${encodeURIComponent(input)}`,
    reliancedigital: (country, input) => `https://www.reliancedigital.in/search?q=${encodeURIComponent(input)}`,
    infibeam: (country, input) => `https://www.infibeam.com/search?q=${encodeURIComponent(input)}`,
    firstcry: (country, input) => `https://www.firstcry.com/search?q=${encodeURIComponent(input)}`,
    nykaa: (country, input) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(input)}`,
    zivame: (country, input) => `https://www.zivame.com/search?q=${encodeURIComponent(input)}`,
};

const countryCodeMap = {
    'us': 'com',
    'uk': 'co.uk',
    'jp': 'co.jp',
    'au': 'com.au',
    'br': 'com.br',
    'mx': 'com.mx',
};

const countryNametoCodeMap = {
    'united states': 'us',
    'united kingdom': 'uk',
    'canada': 'ca',
    'germany': 'de',
    'france': 'fr',
    'italy': 'it',
    'spain': 'es',
    'japan': 'jp',
    'australia': 'au',
    'india': 'in',
    'united arab emirates': 'ae',
    'saudi arabia': 'sa',
    'singapore': 'sg',
    'malaysia': 'my',
    'philippines': 'ph',
    'brazil': 'br',
    'mexico': 'mx',
};
const getCountryCode = (country = 'in') => {
    const sanitizedCountry = sanitizeString(country).toLowerCase();

    return countryCodeMap[sanitizedCountry] || sanitizedCountry;
};


const getProductUrl = (params) => {
    const { query, marketplace, country } = params;

    if (!query || !marketplace) {
        throw new Error('Query and marketplace are required');
    }

    const isurl = isValidUrl(query);

    if (isurl) {
        return query;
    }

    const marketplaceSanitized = sanitizeString(marketplace);
    const countrySanitized = sanitizeString(country);
    const inputSanitized = sanitizeString(query);

    if (!allowedMarketplaces.includes(marketplaceSanitized)) {
        return null;
    }
    const countryCode = getCountryCode(countrySanitized);
    const urlGenerator = marketplaceToUrlMap[marketplaceSanitized];
    if (!urlGenerator) {
        return null;
    }
    const url = urlGenerator(countryCode, inputSanitized);
    if (!isValidUrl(url)) {
        return null;
    }
    return url;
};

const getAmountFromTokens = (tokens, currency) => {
    return 1;
};

module.exports = {
    sanitizeString,
    getProductUrl,
    getAmountFromTokens,
};
