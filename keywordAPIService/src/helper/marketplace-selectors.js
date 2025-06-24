const cheerio = require('cheerio');

// Define selector mappings for different marketplaces
const marketplaceSelectors = {
    // Amazon selectors
    'amazon': {
        title: ['#productTitle', '.product-title-word-break', 'h1.a-size-large'],
        price: ['#priceblock_ourprice', '#priceblock_dealprice', '.a-price .a-offscreen', '.a-color-price'],
        image: ['#landingImage', '#imgBlkFront', '.image.featured-image img', '#main-image'],
        asin: {
            attribute: { selector: '[data-asin]', attr: 'data-asin' },
            regex: /ASIN:\s*([A-Z0-9]{10})/
        },
        gtin: ['[data-gtin]', '[data-gtin13]'],
        sizes: ['.twister-plus-size-list-items', '#variation_size_name .a-size-base'],
        colors: ['#variation_color_name .selection', '#color_name_0'],
        quantity: ['.quantity-selector', '#quantity'],
        inStock: ['.a-color-success', '#availability'],
        inStockText: ['In Stock', 'Only', 'left in stock'],
        tags: ['.zg_hrsr_item', '.a-badge-text']
    },

    // eBay selectors
    'ebay': {
        title: ['.x-item-title', 'h1.item-title', '.product-title'],
        price: ['.x-price-primary', '.prices__itemPrice', '.product-price'],
        image: ['#icImg', '.img-wrapper img', '.vi-image-gallery__image img', '.slick-current img'],
        asin: {
            regex: /Item number:\s*(\d+)/
        },
        gtin: ['[itemprop="gtin13"]', '[itemprop="gtin"]'],
        sizes: ['.x-size-options', '.Dropdown-menu--size'],
        colors: ['.x-color-options', '.Dropdown-menu--color'],
        quantity: ['.quantity-dropdown', '.qtyInput'],
        inStock: ['.vi-quantity-wrapper', '.d-quantity__availability'],
        inStockText: ['Available', 'in stock', 'Quantity'],
        tags: ['.item-tags', '.badge__text']
    },

    // Walmart selectors
    'walmart': {
        title: ['.prod-ProductTitle', '[data-testid="product-title"]', 'h1'],
        price: ['.price-characteristic', '[data-testid="price"]', '.price-group'],
        image: ['.prod-hero-image img', '[data-testid="hero-image"] img', '.prod-HeroImage-container img'],
        asin: {
            regex: /Item #:\s*(\d+)/
        },
        gtin: ['[itemprop="gtin13"]', '[itemprop="gtin8"]'],
        sizes: ['.prod-variants-swatch-list', '.variant-swatch-option'],
        colors: ['.color-variant-btn', '.variant-swatch-option'],
        quantity: ['.quantity-selector', '[data-testid="quantity-selector"]'],
        inStock: ['.prod-ProductOffer-availabilityMessageWrapper', '[data-testid="fulfillment-section"]'],
        inStockText: ['In Stock', 'Available', 'Ship to'],
        tags: ['.product-tag', '.product-badge']
    },

    // Best Buy selectors
    'bestbuy': {
        title: ['.heading-5', '.sku-title', 'h1'],
        price: ['.priceView-customer-price', '.pb-hero-price', '[data-testid="price-element"]'],
        image: ['.primary-image', '.product-image img', '.carousel-main-img img'],
        asin: {
            regex: /SKU:\s*(\d+)/
        },
        gtin: ['[data-gtin]', '[itemprop="gtin13"]'],
        sizes: ['.variation-list', '.dropdown-select'],
        colors: ['.variation-list', '.color-options'],
        quantity: ['.quantity-select', '.stepper-input'],
        inStock: ['.fulfillment-fulfillment-summary', '.availability'],
        inStockText: ['In Stock', 'Available', 'Pick up'],
        tags: ['.feature-list', '.tag-list']
    },

    // Target selectors
    'target': {
        title: ['.Heading__StyledHeading', '[data-test="product-title"]', 'h1'],
        price: ['.style__PriceFontSize', '[data-test="product-price"]'],
        image: ['[data-test="product-image"] img', '.slideDeckPictureProduct img', '.Image__ImageContainer img'],
        asin: {
            regex: /DPCI:\s*(\d+-\d+-\d+)/
        },
        gtin: ['[itemprop="gtin13"]', '[itemprop="gtin14"]'],
        sizes: ['.style__SizeListWrapper', '[data-test="sizeSelector"]'],
        colors: ['.style__ColorListWrapper', '[data-test="colorSelector"]'],
        quantity: ['.style__QuantityInput', '[data-test="quantityInput"]'],
        inStock: ['.h-text-orangeDark', '[data-test="availabilityMessage"]'],
        inStockText: ['In Stock', 'Available', 'Only'],
        tags: ['.BadgeStack', '.style__BadgeLabel']
    },

    // Flipkart selectors (for India)
    'flipkart': {
        title: ['.B_NuCI', '._35KyD6', 'h1'],
        price: ['._30jeq3', '._1vC4OE'],
        image: ['._396cs4', '._1Nyybr', '.CXW8mj img', '.q6DClP img'],
        asin: {
            regex: /Product ID:\s*([A-Z0-9]+)/
        },
        gtin: ['[itemprop="gtin13"]', '[itemprop="gtin"]'],
        sizes: ['._1TJldG', '._3Oikkn'],
        colors: ['._1TJldG', '._3Oikkn'],
        quantity: ['.quantity-selector', '._1GJRnH'],
        inStock: ['.UgLoKg', '._16FRp0'],
        inStockText: ['In Stock', 'Available', 'Hurry'],
        tags: ['.promotion-tags', '.product-label']
    },

    // AliExpress selectors
    'aliexpress': {
        title: ['.product-title', '.title-detail', 'h1[data-pl="product-title"]'],
        price: ['.product-price-value', '.uniform-banner-box-price'],
        image: ['.magnifier-image', '.poster-image img', '.detail-gallery-image img'],
        asin: {
            regex: /Product ID:\s*(\d+)/
        },
        gtin: ['[itemprop="gtin13"]', '[itemprop="gtin"]'],
        sizes: ['.sku-property-item', '.sku-title-value'],
        colors: ['.sku-property-item', '.sku-title-value'],
        quantity: ['.quantity-selector', '.next-input-group-addon'],
        inStock: ['.product-quantity-tip', '.product-shipping-info'],
        inStockText: ['In Stock', 'Available', 'Ships from'],
        tags: ['.product-tag', '.tag-wrap']
    },

    // Default fallback selectors for any marketplace
    'default': {
        title: ['title', 'h1', '.product-title', '[data-testid="product-title"]'],
        price: ['.price', '.product-price', '[data-testid="price"]'],
        image: ['.product-image', '.main-image', 'img[id*="product"]', 'img[id*="main"]', '.gallery img', '.product-photo img'],
        asin: {
            attribute: { selector: '[data-product-id]', attr: 'data-product-id' },
            regex: /Product\s*ID:\s*([A-Z0-9-]+)/i
        },
        gtin: ['[data-gtin]', '[itemprop="gtin13"]', '[itemprop="gtin"]'],
        sizes: ['.size-option', '.product-size', '[data-testid="size-option"]'],
        colors: ['.color-option', '.product-color', '[data-testid="color-option"]'],
        quantity: ['.quantity', '.stock-count', '[data-testid="quantity"]'],
        inStock: ['.in-stock', '.availability', '[data-testid="in-stock"]'],
        inStockText: ['In Stock', 'Available', 'in stock'],
        tags: ['.product-tag', '.tag', '[data-testid="product-tag"]']
    }
};

// Function to get value from HTML using multiple selectors
const getValueFromSelectors = ($, selectors) => {
    for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
            return element.first().text().trim();
        }
    }
    return '';
};

// Function specifically for getting image URLs
const getImageFromSelectors = ($, selectors) => {
    for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
            // Try to get src, data-src, or data-a-dynamic-image attributes
            const src = element.attr('src') ||
                element.attr('data-src') ||
                element.attr('data-a-dynamic-image') ||
                element.attr('data-zoom-image') ||
                element.attr('data-old-hires');

            if (src) {
                // Handle Amazon's data-a-dynamic-image which contains JSON string of image URLs
                if (src.startsWith('{') && src.endsWith('}')) {
                    try {
                        const imageJson = JSON.parse(src);
                        // Get the first image URL from the JSON object
                        return Object.keys(imageJson)[0];
                    } catch (e) {
                        // If parsing fails, return the raw src
                        return src;
                    }
                }
                return src;
            }
        }
    }
    return '';
};

// Function to check if text includes any of the given phrases
const textIncludes = (text, phrases) => {
    for (const phrase of phrases) {
        if (text.includes(phrase)) return true;
    }
    return false;
};

const convertHtlmToJson = (html, marketplace = 'default') => {
    // Load HTML with cheerio
    const $ = cheerio.load(html);

    // Get selectors for the specified marketplace or use default
    const selectors = marketplaceSelectors[marketplace.toLowerCase()] || marketplaceSelectors.default;

    // Helper function to clean text
    const cleanText = (text) => {
        if (!text) return '';
        return text.trim().replace(/\s+/g, ' ');
    };

    // Extract product title
    const title = cleanText(getValueFromSelectors($, selectors.title)) || 'N/A';

    // Extract price
    const costPrice = cleanText(getValueFromSelectors($, selectors.price)) || 'N/A';

    // Extract product image
    const imageUrl = getImageFromSelectors($, selectors.image) || 'N/A';

    // Extract ASIN or product ID
    let asin = 'N/A';

    // Try getting from attribute
    if (selectors.asin.attribute) {
        const asinElement = $(selectors.asin.attribute.selector);
        if (asinElement.length && asinElement.attr(selectors.asin.attribute.attr)) {
            asin = asinElement.attr(selectors.asin.attribute.attr);
        }
    }

    // If not found, try with regex
    if (asin === 'N/A' && selectors.asin.regex) {
        const pageText = $('body').text();
        const asinMatch = pageText.match(selectors.asin.regex);
        if (asinMatch) {
            asin = asinMatch[1];
        }
    }

    // Extract GTINs
    const gtins = [];
    selectors.gtin.forEach(selector => {
        $(selector).each((_, element) => {
            const gtin = $(element).attr('content') ||
                $(element).attr('data-gtin') ||
                cleanText($(element).text());
            if (gtin && !gtins.includes(gtin)) {
                gtins.push(gtin);
            }
        });
    });

    // Extract sizes
    const sizes = [];
    selectors.sizes.forEach(selector => {
        $(selector).each((_, element) => {
            const size = cleanText($(element).text());
            if (size && !sizes.includes(size)) {
                sizes.push(size);
            }
        });
    });

    // Extract colors
    const colors = [];
    selectors.colors.forEach(selector => {
        $(selector).each((_, element) => {
            const color = cleanText($(element).text());
            if (color && !colors.includes(color) && color !== 'I') {
                colors.push(color);
            }
        });
    });

    // Extract quantity
    let quantity = 'N/A';
    const quantityText = getValueFromSelectors($, selectors.quantity);
    if (quantityText) {
        quantity = cleanText(quantityText);
    } else {
        // Try to find quantity in text
        const pageText = $('body').text();
        const quantityMatch = pageText.match(/Only\s*(\d+)\s*left/i);
        if (quantityMatch) {
            quantity = quantityMatch[1];
        }
    }

    // Check if product is in stock
    let inStock = false;

    // Check specific in-stock elements
    selectors.inStock.forEach(selector => {
        const inStockElement = $(selector);
        if (inStockElement.length > 0) {
            const inStockText = cleanText(inStockElement.text());
            if (textIncludes(inStockText, selectors.inStockText)) {
                inStock = true;
            }
        }
    });

    // Fallback to body text check
    if (!inStock) {
        const bodyText = $('body').text();
        inStock = textIncludes(bodyText, selectors.inStockText);
    }

    // Extract product tags
    const tags = [];
    selectors.tags.forEach(selector => {
        $(selector).each((_, element) => {
            const tag = cleanText($(element).text());
            if (tag && !tags.includes(tag)) {
                tags.push(tag);
            }
        });
    });

    // Price metrics (placeholders - these would typically come from business logic)
    const grossProfit = 'N/A';
    const medianPrice = 'N/A';
    const averagePrice = 'N/A';

    // Price label extraction - this would be marketplace specific
    let priceLabel = 'N/A';
    let newPrice = 'N/A';
    let recommendedBy = 'N/A';

    // Extract matches and VAT (these would typically be from your backend)
    const matches = 'N/A';
    const vat = 'N/A';

    // Build the final JSON structure
    return {
        product: {
            title: title,
            image: imageUrl,
            pricing: {
                cost_price: costPrice,
                gross_profit: grossProfit,
                median_price: medianPrice,
                average_price: averagePrice,
                price_label: priceLabel,
                discount: {
                    new_price: newPrice,
                    recommended_by: recommendedBy
                }
            },
            metrics: {
                matches: matches,
                vat: vat
            },
            identifiers: {
                asin: asin,
                gtin: gtins.length > 0 ? gtins : ['N/A']
            },
            specifications: {
                size: sizes.length > 0 ? sizes : ['N/A'],
                colors: colors.filter(c => c !== 'I')
            },
            availability: {
                quantity: quantity,
                status: inStock ? 'In Stock' : 'Out of Stock'
            },
            tags: tags.length > 0 ? tags : []
        }
    };
};

module.exports = {
    convertHtlmToJson,
    marketplaceSelectors,
};