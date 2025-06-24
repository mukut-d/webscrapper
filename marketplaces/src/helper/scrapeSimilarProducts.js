const axios = require('axios');
const { apiCallLog } = require('../helper/apiCallLog');

const ScrapeSimilarProducts = async (requestData) => {
    try {

        const request = {
            method: 'POST',
            url: `http://localhost:5050/api/scraping/scrape`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: requestData  
        };

        const response = await axios(request);
        if (response.status === 200 && response.data) {
            await apiCallLog(
                "scrapeSimilarProducts",
                "scrapeSimilarProducts",
                "scrapeSimilarProducts",
                { requestData },
                {},
                {},
                "success"
            );
            return response.data;
        } else {
            throw new Error('Failed to scrape similar products');
        }

    } catch (err) {
        console.error("Error in scrapeSimilarProducts:", err.response.data);
        await apiCallLog(
            "scrapeSimilarProducts",
            "scrapeSimilarProducts",
            "scrapeSimilarProducts",
            { requestData },
            {},
            { error: err.message },
            "error"
        );
        throw new Error('Failed to scrape similar products');
    }
}

module.exports = ScrapeSimilarProducts;