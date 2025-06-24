const axios = require("axios");
const Bull = require('bull');

const fetchQueue = new Bull('fetchOrderQueue', {
    redis: {
        host: 'localhost',
        port: 6379,
        // add other Redis options if needed
    },
});

fetchQueue.process(async (job) => {

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://localhost:5001/order/get-orders-cron',
        headers: {
            'Content-Type': 'application/json'
        },
        data: job.data
    };

    await axios.request(config);
});

exports.helperOrder = async (userId, marketplaceId, accountName, startDate) => {
    try {
        const job = await fetchQueue.add({ userId, marketplaceId, accountName, startDate });
        console.log(`Job ${job?.id} added to queue`);
    } catch (error) {
        console.error(error);
    }
}