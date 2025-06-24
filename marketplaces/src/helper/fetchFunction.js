const axios = require("axios");
const Bull = require('bull');

const fetchQueue = new Bull('fetchQueue', {
    redis: {
        host: 'localhost',
        port: 6379,
        // add other Redis options if needed
    },
});

// fetchQueue.process(async (job) => {
//     const { userId, marketPlaceId, accountName, addQuantity } = job.data;
//     const date = new Date();
//     // date.setHours(date.getHours() + 5);
//     // date.setMinutes(date.getMinutes() + 30);
//     let request = JSON.stringify({
//         "userId": userId,
//         "marketplaceId": marketPlaceId,
//         "accountName": accountName,
//         "addQuantity": addQuantity,
//         "date": date,
//     });

//     let profileConfig = {
//         method: 'post',
//         maxBodyLength: Infinity,
//         url: 'http://localhost:5001/master/get-user-profiles',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         data: request
//     };

//     await axios.request(profileConfig)
//         .then((response) => {
//             console.log(JSON.stringify(response.data));
//         })
//         .catch((error) => {
//             console.log(error);
//         });

//     let config = {
//         method: 'post',
//         maxBodyLength: Infinity,
//         url: 'http://localhost:5001/catalogue/get-catalogue',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         data: request
//     };

//     await axios.request(config)
//         .then((response) => {
//             console.log(JSON.stringify(response.data));
//         }).catch((error) => {
//             console.log(error);
//         });

//     let request1 = JSON.stringify({
//         "userId": userId,
//         "marketplaceId": marketPlaceId,
//         "startDate": date,
//         "accountName": accountName,
//     });

//     let config1 = {
//         method: 'post',
//         maxBodyLength: Infinity,
//         url: 'http://localhost:5001/order/get-orders',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         data: request1
//     };

//     await axios.request(config1)
//         .then((response) => {
//             console.log(JSON.stringify(response.data));
//         })
//         .catch((error) => {
//             console.log(error);
//         });

//     let config2 = {
//         method: 'post',
//         maxBodyLength: Infinity,
//         url: 'http://localhost:5001/order/fetch-returns',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         data: request1
//     };

//     await axios.request(config2).then(res => {
//         console.log(JSON.stringify(res.data));
//     }).catch(err => {
//         console.log(err);
//     });

//     const config3 = {
//         method: 'post',
//         maxBodyLength: Infinity,
//         url: 'http://localhost:5001/order/get-cancels',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         data: data
//     };

//     await axios.request(config3)
//         .then((response) => {
//             console.log(JSON.stringify(response.data));
//         })
//         .catch((error) => {
//             console.log(error);
//         });

//     return true;
// });

exports.helperFunction = async (userId, marketPlaceId, accountName, addQuantity) => {
    try {
        const job = await fetchQueue.add({ userId, marketPlaceId, accountName, addQuantity });
        console.log(`Job ${job?.id} added to queue`);
    } catch (error) {
        console.error(error);
    }
}

exports.helperFunctionApi = async (req, res) => {
    try {

        const { userId, marketPlaceId, accountName, addQuantity } = req.query;

        this.helperFunction(userId, marketPlaceId, accountName, addQuantity);

        return res.status(200).json({
            success: false,
            message: "Fetch started",
        });

    } catch (err) {
        console.log(err);
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
}