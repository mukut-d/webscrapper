const axios = require('axios');
const { getAccessToken } = require('./tokens');
const cskus = require('../../models/csku');
const Tokens = require('../../models/tokens');
const uuidv4 = require('uuid').v4;
const moment = require('moment');
const createExcelFromJSON = require('../../helper/createExcelFromJSON');
const sendUpdateReportEmail = require('../../helper/sendUpdateReportEmail');
const { uploadFileToS3 } = require('../../helper/uploadFileToS3');

async function updateCSKU(cskuId, updates) {
    await cskus.update(updates, { where: { id: cskuId } });
}

async function waiting(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, ms);
    })
}

exports.handleAmazonBulkUpdate = async (
    values
) => {

    try {
        console.log(values);
        let success = 0
        const failedProducts = [];

        let currentDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();

        for (let i = 0; i < values.length; i++) {
            const cskuUpdate = values[i];

            const { isku, price, quantity, accountName, userId } = cskuUpdate.data;

            const token = await Tokens.findOne({
                where: {
                    userId: userId,
                    accountName: accountName
                },
                raw: true
            });

            console.log(token);

            if (!token) {
                await updateCSKU(cskuUpdate?.data.id, {
                    quantiyUpdationStatus: "FAILED",
                    quantityUpdateErrors: [{ message: "Token not found" }],
                    quantityUpdateDate: currentDate,
                });
            }

            const accessToken = await getAccessToken(token.client_id, token.client_secret, token.refreshToken);

            try {

                let config = {
                    method: 'put',
                    maxBodyLength: Infinity,
                    url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/inventory/2021-01-06/locations/${token.location_id}/skus/${isku}?quantity=${quantity}`,
                    headers: {
                        'x-amz-access-token': accessToken,
                        'Content-Type': 'application/json',
                        'If-Unmodified-Since': moment().utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT'
                    }
                };

                console.log("In quantity update");

                await axios.request(config)
                    .then((response) => {
                        console.log(JSON.stringify(response.data));
                        failedProducts.push({
                            productId: cskuUpdate?.data.id,
                            errors: [],
                            status: "SUCCESS"
                        });

                        success++;

                        updateCSKU(cskuUpdate?.data.id, {
                            quantiyUpdationStatus: "SUCCESS",
                            quantityUpdateErrors: [],
                            quantityUpdateDate: currentDate,
                        });
                    });


            } catch (err) {

                try {

                    let data = JSON.stringify({
                        "inventoryItems": [
                            {
                                "sellerSku": isku,
                                "marketplaceId": "A2VIGQ35RCS4UG",
                                "quantity": quantity
                            }
                        ]
                    });

                    await waiting(1000);

                    let config = {
                        method: 'post',
                        maxBodyLength: Infinity,
                        url: 'https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/inventory',
                        headers: {
                            'x-amzn-idempotency-token': uuidv4(),
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'x-amz-access-token': accessToken
                        },
                        data: data
                    };

                    await axios.request(config)
                        .then((res) => {
                            console.log(JSON.stringify(res.data));
                            failedProducts.push({
                                productId: cskuUpdate?.data.id,
                                errors: [],
                                status: "SUCCESS"
                            });

                            success++;

                            updateCSKU(cskuUpdate?.data.id, {
                                quantiyUpdationStatus: "SUCCESS",
                                quantityUpdateErrors: [],
                                quantityUpdateDate: currentDate,
                            });
                        });

                } catch (err) {
                    console.log(err);
                    failedProducts.push({
                        productId: cskuUpdate?.data.id,
                        errors: JSON.stringify(err),
                        status: "FAILED",
                        priceUpdateStatus: "",
                        priceUpdateErrors: "",
                    });
                }

            }

            try {

                let data = JSON.stringify({
                    "productType": "PRODUCT",
                    "patches": [
                        {
                            "op": "replace",
                            "path": "/attributes/purchasable_offer",
                            "value": [{
                                "marketplace_id": "A2VIGQ35RCS4UG",
                                "currency": "AED",
                                "our_price": [{ "schedule": [{ "value_with_tax": parseFloat(price).toFixed(2) }] }]
                            }]
                        }
                    ]
                });

                await waiting(1000);

                let config = {
                    method: 'patch',
                    maxBodyLength: Infinity,
                    url: `https://sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/${token.sellerId}/${cskuUpdate.data.isku}?marketplaceIds=${token.amzMarketplaceId}&includedData=issues&issueLocale=en_AE`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'x-amz-access-token': accessToken
                    },
                    data: data
                };

                console.log("In price update");

                // await axios.request(config)
                //     .then((response) => {

                //         if (response.data.status == "INVALID") {

                //             const productFind = failedProducts.find((product) => product.productId === cskuUpdate?.data.id);

                //             if (productFind) {

                //                 failedProducts.map((product) => {
                //                     if (product.productId === cskuUpdate?.data.id) {
                //                         product.priceUpdateStatus = 'FAILED';
                //                         product.priceUpdateErrors.concat(JSON.stringify(response.data));
                //                     }
                //                 });
                //             } else {
                //                 failedProducts.push({
                //                     productId: cskuUpdate?.data.id,
                //                     errors: "",
                //                     status: "SUCCESS",
                //                     priceUpdateStatus: "FAILED",
                //                     priceUpdateErrors: JSON.stringify(response.data),
                //                 });
                //             }
                //         } else {

                //             const productFind = failedProducts.find((product) => product.productId === cskuUpdate?.data.id);

                //             if (productFind) {

                //                 failedProducts.map((product) => {
                //                     if (product.productId === cskuUpdate?.data.id) {
                //                         product.priceUpdateStatus = 'SUCCESS';
                //                         product.priceUpdateErrors = "";
                //                     }
                //                 });
                //             } else {
                //                 failedProducts.push({
                //                     productId: cskuUpdate?.data.id,
                //                     errors: [],
                //                     status: "SUCCESS",
                //                     priceUpdateStatus: "SUCCESS",
                //                     priceUpdateErrors: "",
                //                 });
                //             }

                //             // updateCSKU(cskuUpdate?.data.id, {
                //             //     quantiyUpdationStatus: "SUCCESS",
                //             //     quantityUpdateErrors: [],
                //             //     quantityUpdateDate: currentDate,
                //             // });
                //         }

                //     });


            } catch (err) {
                console.error(err);
                const productFind = failedProducts.find((product) => product.productId === cskuUpdate?.data.id);
                if (productFind) {

                    failedProducts.map((product) => {
                        if (product.productId === cskuUpdate?.data.id) {
                            product.errors.concat(JSON.stringify(err));
                        }
                    });
                } else {
                    failedProducts.push({
                        productId: cskuUpdate?.data.id,
                        errors: JSON.stringify(err)
                    });
                }
            }
        }

        console.log("Success: ", success);
        if (failedProducts.length > 0) {

            const currentDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();

            for (const data of failedProducts) {
                //NOTE - get products based on sku
                await updateCSKU(data?.productId, {
                    quantiyUpdationStatus: "FAILED",
                    quantityUpdateErrors: [data?.errors],
                    quantityUpdateDate: currentDate,
                });
            }
            // Step 1: Generate Excel File from failedProducts
            const excelBuffer = await createExcelFromJSON(failedProducts, 'Failed Sheet');

            // Step 2: Upload the Excel File to S3
            const s3Response = await uploadFileToS3({
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                buffer: excelBuffer,
                originalname: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
                bucketName: process.env.S3_BUCKET_NAME, // Assuming S3_BUCKET_NAME is set in your environment variables
                folderName: 'failed-report'  // Specify the folder name here
            });

            const fileOptions = {
                recipients: 'akhlaqansarievdtechnology@gmail.com'
            };

            // Step 3: Send Email with the S3 File Link
            const mailOptions = {
                from: process.env.FROM_EMAIL,
                to: fileOptions.recipients, // Multiple recipients passed in fileOptions
                subject: `Failed Quentity and price Update Report - ${currentDate}`,
                text: `Hello, please find the attached failed update report.`,
                attachments: [
                    {
                        filename: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
                        path: s3Response.Location // S3 file location
                    }
                ]
            };

            await sendUpdateReportEmail(mailOptions)
        }

    } catch (error) {
        console.error(error);
        throw error;
    }

};

exports.handleAmazonListing = async (cskuUpdate, token, variantQuantity, bulkProducts) => {

    try {

        if (variantQuantity >= 2) {
            console.log("In variant quantity greater than 2");

            const currentDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();

            const { isku, quantity } = cskuUpdate;

            let accessToken;
            try {
                accessToken = await getAccessToken(token.client_id, token.client_secret, token.refreshToken);
            } catch (err) {
                await updateCSKU(cskuUpdate?.data.id, {
                    quantiyUpdationStatus: "FAILED",
                    quantityUpdateErrors: [err],
                    quantityUpdateDate: currentDate,
                });
                return;
            }

            try {

                let config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/inventory/2021-01-06/locations/${token.location_id}/skus/${isku}`,
                    headers: {
                        'x-amz-access-token': accessToken
                    }
                };

                const response = await axios.request(config)

                console.log(response.data);

                if (response?.data?.marketplaceChannelInventories?.length == 0) {

                    try {

                        let data = JSON.stringify({
                            "inventoryItems": [
                                {
                                    "sellerSku": isku,
                                    "marketplaceId": "A2VIGQ35RCS4UG",
                                    "quantity": quantity
                                }
                            ]
                        });

                        let config = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: 'https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/inventory',
                            headers: {
                                'x-amzn-idempotency-token': uuidv4(),
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'x-amz-access-token': accessToken
                            },
                            data: data
                        };

                        console.log("In inventory post");

                        bulkProducts.push({
                            data: cskuUpdate,
                            type: "sellerflex"
                        });

                        await axios.request(config)
                            .then((res) => {
                                console.log(JSON.stringify(res.data));
                            });

                    } catch (err) {
                        console.log(err);
                        await updateCSKU(cskuUpdate?.id, {
                            quantiyUpdationStatus: "FAILED",
                            quantityUpdateErrors: [err],
                            quantityUpdateDate: currentDate,
                        });
                    }

                } else if (response?.data?.marketplaceChannelInventories?.length > 0) {
                    console.log("In bulk update array push part");
                    bulkProducts.push({
                        data: cskuUpdate,
                        type: "sellerflex"
                    });
                } else {
                    await updateCSKU(cskuUpdate?.id, {
                        quantiyUpdationStatus: "FAILED",
                        quantityUpdateErrors: [response?.data],
                        quantityUpdateDate: currentDate,
                    });
                }

            } catch (err) {

                try {

                    let data = JSON.stringify({
                        "inventoryItems": [
                            {
                                "sellerSku": isku,
                                "marketplaceId": "A2VIGQ35RCS4UG",
                                "quantity": quantity
                            }
                        ]
                    });

                    let config = {
                        method: 'post',
                        maxBodyLength: Infinity,
                        url: 'https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/inventory',
                        headers: {
                            'x-amzn-idempotency-token': uuidv4(),
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'x-amz-access-token': accessToken
                        },
                        data: data
                    };

                    console.log("In convert to FBA inventory");

                    await axios.request(config)
                        .then((response) => {
                            console.log(JSON.stringify(response.data));
                        });

                    bulkProducts.push({
                        data: cskuUpdate,
                        type: "sellerflex"
                    });

                    return;

                } catch (err) {
                    await updateCSKU(cskuUpdate?.id, {
                        quantiyUpdationStatus: "FAILED",
                        quantityUpdateErrors: [err],
                        quantityUpdateDate: currentDate,
                    });
                }

            }
        } else {
            try {

                const currentDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();

                const { isku, quantity } = cskuUpdate;

                let accessToken;
                try {
                    accessToken = await getAccessToken(token.client_id, token.client_secret, token.refreshToken);
                } catch (err) {
                    await updateCSKU(cskuUpdate?.id, {
                        quantiyUpdationStatus: "FAILED",
                        quantityUpdateErrors: [err],
                        quantityUpdateDate: currentDate,
                    });
                    return;
                }

                let config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/inventory/2021-01-06/locations/${token.location_id}/skus/${isku}`,
                    headers: {
                        'x-amz-access-token': accessToken
                    }
                };

                const response = await axios.request(config)

                console.log(response.data);

                if (response?.data?.marketplaceChannelInventories?.length == 0) {

                    try {

                        let data = JSON.stringify({
                            "inventoryItems": [
                                {
                                    "sellerSku": isku,
                                    "marketplaceId": "A2VIGQ35RCS4UG",
                                    "quantity": 0
                                }
                            ]
                        });

                        let config = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: 'https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/inventory',
                            headers: {
                                'x-amzn-idempotency-token': uuidv4(),
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'x-amz-access-token': accessToken
                            },
                            data: data
                        };

                        console.log("In inventory post");

                        bulkProducts.push({
                            data: cskuUpdate,
                            type: "sellerflex"
                        });

                        await axios.request(config)
                            .then((res) => {
                                console.log(JSON.stringify(res.data));
                            });

                        return;

                    } catch (err) {
                        await updateCSKU(cskuUpdate?.id, {
                            quantiyUpdationStatus: "FAILED",
                            quantityUpdateErrors: [err],
                            quantityUpdateDate: currentDate,
                        });
                    }

                } else if (response?.data?.marketplaceChannelInventories?.length > 0) {
                    console.log("In bulk update array push part");
                    bulkProducts.push({
                        data: cskuUpdate,
                        type: "sellerflex"
                    });
                } else {
                    await updateCSKU(cskuUpdate?.id, {
                        quantiyUpdationStatus: "FAILED",
                        quantityUpdateErrors: [response?.data],
                        quantityUpdateDate: currentDate,
                    });
                }

            } catch (err) {

                try {

                    let data = JSON.stringify({
                        "inventoryItems": [
                            {
                                "sellerSku": isku,
                                "marketplaceId": "A2VIGQ35RCS4UG",
                                "quantity": quantity
                            }
                        ]
                    });

                    let config = {
                        method: 'post',
                        maxBodyLength: Infinity,
                        url: 'https://sellingpartnerapi-eu.amazon.com/fba/inventory/v1/items/inventory',
                        headers: {
                            'x-amzn-idempotency-token': uuidv4(),
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'x-amz-access-token': accessToken
                        },
                        data: data
                    };

                    console.log("In convert to FBA inventory");

                    await axios.request(config)
                        .then((response) => {
                            console.log(JSON.stringify(response.data));
                        });

                    bulkProducts.push({
                        data: cskuUpdate,
                        type: "sellerflex"
                    });

                    return;

                } catch (err) {
                    let currentDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
                    await updateCSKU(cskuUpdate?.id, {
                        quantiyUpdationStatus: "FAILED",
                        quantityUpdateErrors: [err],
                        quantityUpdateDate: currentDate,
                    });
                }

            }
        }


    } catch (err) {
        console.error(err);
        await updateCSKU(cskuUpdate?.id, {
            quantiyUpdationStatus: "FAILED",
            quantityUpdateErrors: [err],
            quantityUpdateDate: currentDate,
        });
    }

};