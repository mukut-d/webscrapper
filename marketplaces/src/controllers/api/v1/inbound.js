const Inbound = require("../../../models/inbound");
const ISKU = require("../../../models/isku");
const CSKU = require("../../../models/csku");
const Tokens = require("../../../models/tokens");
const Marketplace = require("../../../models/marketplace");
const ebay = require("ebay-api");
const { sequelize } = require("../../../database/config");
const { Op } = require("sequelize");
const {apiCallLog}=require("../../../helper/apiCallLog")
const moment = require('moment');

exports.CreateInbound = async (req, res) => {
    const functionName="CreateInbound"
    try {

        const { inboundData, userId } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                status: 400,
                message: "userId is required",
            });
        }

        const iskuData = [];
        const inboundDBData = [];
        await Promise.all(inboundData?.map(async (item) => {
            if (item.foundInDb) {

                await ISKU.update(
                    {
                        quantity: sequelize.literal(
                            `CAST("quantity" AS INTEGER) + ${item.goodQty}`)
                    },
                    { where: { isku: item.isku,userId:userId } }
                );

               await CSKU.update(
                    {
                        quantity: sequelize.literal(
                            `CAST("quantity" AS INTEGER) + ${item.goodQty}`)
                    },
                    { where: { isku: item.isku }, returning: true }
                )
                
                // .then(async (updatedData) => {
                //     await Promise.all(updatedData[1]?.map(async (update) => {
                //         const token = await Tokens.findOne({ where: { marketPlaceId: update.dataValues.marketplaceId, accountName: update.dataValues.accountName, userId }, include: { model: Marketplace } });

                //         // if (token?.dataValues?.marketPlaceId?.url?.includes("ebay")) {

                //         //     const eBay = new ebay({
                //         //         appId: process.env.APP_ID,
                //         //         certId: process.env.CERT_ID,
                //         //         sandbox: false,
                //         //         devId: process.env.DEV_ID,
                //         //         authToken: token.dataValues.token,
                //         //     });
                //         //     let startdate = moment().add(5, 'hours').add(30, 'minutes');  
                //         //     let tokenExpiresDate = moment(token.lastTokenRefreshDate);  
                //         //     let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');
                        
                //         //     if (hoursDifference > 2) {
                //         //         await refreshToken(eBay,token)
                //         //      }
                //         //     // try {
                //         //     //     await eBay.trading.GetTokenStatus({
                //         //     //         RequesterCredentials: {
                //         //     //             eBayAuthToken: token.dataValues.token,
                //         //     //         }
                //         //     //     })
                //         //     //     await apiCallLog("GetTokenStatus","/create/inbound",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
                //         //     // } catch (error) {
                //         //     //     await apiCallLog("GetTokenStatus","/create/inbound",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
                //         //         // await refreshToken(eBay, token);
                //         //     // }
                           
                //         //     try {
                //         //          await eBay.trading.ReviseItem({
                //         //         Item: {
                //         //             ItemID: update.channelId,
                //         //             Quantity: update.quantity
                //         //         },
                //         //     });
                //         //     await apiCallLog("ReviseItem","/create/inbound",functionName,{
                //         //         Item: {
                //         //           ItemID: update?.channelId,
                //         //           Quantity:update.quantity
                //         //         },
                //         //       },{}, {}, 'success');
                //         //     } catch (error) {
                //         //         await apiCallLog("ReviseItem","/create/inbound",functionName,{
                //         //             Item: {
                //         //                 ItemID: update?.channelId,
                //         //                 Quantity:update.quantity
                //         //             },
                //         //           },{}, error.meta, 'error');
                //         //     }
                           

                //         // }

                //     }));
                // }).catch((err) => {
                //     console.log("Error in CSKU update", err);
                // });

                const itemExist = await Inbound.findOne({ where: { isku: item.isku, userId: userId } });
                if (itemExist) {
                    await Inbound.update(
                        {
                            goodQty: sequelize.literal(`"goodQty" + ${item.goodQty}`),
                            badQty: sequelize.literal(`"badQty" + ${item.badQty}`),
                            totalQty: sequelize.literal(`"totalQty" + ${item.totalQty}`)
                        },
                        { where: { isku: item.isku, userId: userId } }
                    );
                }else {
                    inboundDBData.push({
                        isku: item.isku,
                        goodQty: item.goodQty,
                        badQty: item.badQty,
                        totalQty: item.totalQty,
                        userId: userId
                    });
                }

            } else if (!item.foundInDb) {

                iskuData.push({
                    isku: item.isku,
                    quantity: item.goodQty,
                    userId: userId,
                });

                inboundDBData.push({
                    isku: item.isku,
                    goodQty: item.goodQty,
                    badQty: item.badQty,
                    totalQty: item.totalQty,
                    userId: userId
                });

            }
        }));

        if (iskuData.length > 0) await ISKU.bulkCreate(iskuData);
        if (inboundDBData.length > 0) {
            await Inbound.bulkCreate(inboundDBData);
            return res.status(200).json({
                success: true,
                status: 200,
                message: "Inbound Data created successfully",
            });
        }else{
            return res.status(200).json({
                success: true,
                status: 200,
                message: "Inbound Data updated successfully",
            });
        }

    } catch (err) {
        console.log(err);
        return res.status(400).json({
            success: false,
            status: 400,
            message: err.message,
        });
    }
}

exports.GetAllInbounds = async (req, res) => {
    try {
        const { page, limit, search, userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                status: 400,
                message: "userId is required",
            });
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Always filter by userId
        const where = { userId:userId };
        if (search) {
            where.isku = { [Op.like]: `%${search}%` };
        }

        const data = await Inbound.findAll({
            where,
            offset: skip,
            limit: parseInt(limit),
        });

        const count = await Inbound.count({ where });

        return res.status(200).json({
            success: true,
            status: 200,
            data,
            count
        });

    } catch (err) {
        console.log(err);
        return res.status(400).json({
            success: false,
            status: 400,
            message: err.message,
        });
    }
}

exports.UpdateInbounds = async (req, res) => {
    try {

        const id = req.params.id;
        const { isku, goodQty, badQty, totalQty, userId } = req.body;



        const dataExist = await Inbound.findOne({
            where: { id: id }
        });
        if (!dataExist) return res.status(400).json({
            success: false,
            status: 400,
            message: "Invalid Inbound ID",
        });

        if (dataExist?.dataValues?.goodQty !== goodQty) {

            await ISKU.update(
                {
                    quantity: sequelize.literal(
                        `CAST("quantity" AS INTEGER) ${goodQty > dataExist?.dataValues?.goodQty ? '+' : '-'} ${Math.abs(goodQty)}`)
                },
                { where: { isku: isku } }
            );

            await CSKU.update(
                {
                    quantity: sequelize.literal(
                        `CAST("quantity" AS INTEGER) ${goodQty > dataExist?.dataValues?.goodQty ? '+' : '-'} ${Math.abs(goodQty)}`)
                },
                { where: { isku: isku }, returning: true }
            ).then(async (updatedData) => {
                await Promise.all(updatedData[1]?.map(async (update) => {
                    const token = await Tokens.findOne({ where: { marketPlaceId: update.dataValues.marketplaceId, accountName: update.dataValues.accountName, userId: userId }, include: { model: Marketplace } });

                    if (token?.dataValues?.marketPlaceId?.url?.includes("ebay")) {

                        const eBay = new ebay({
                            appId: process.env.APP_ID,
                            certId: process.env.CERT_ID,
                            sandbox: false,
                            devId: process.env.DEV_ID,
                            authToken: token.dataValues.token,
                        });
                        let startdate = moment().add(5, 'hours').add(30, 'minutes');  
                        let tokenExpiresDate = moment(token.lastTokenRefreshDate);  
                        let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');
                    
                        if (hoursDifference > 2) {
                            await refreshToken(eBay,token)
                         }
                        // try {
                        //     await eBay.trading.GetTokenStatus({
                        //     RequesterCredentials: {
                        //         eBayAuthToken: token.dataValues.token,
                        //     }
                        // })
                        // await apiCallLog("GetTokenStatus","/update/inbound/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');

                        // if (err) {
                        //     await refreshToken(eBay, token);
                        // }
                        // } catch (error) {
                        //     await apiCallLog("GetTokenStatus","/update/inbound/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, error.meta, 'error');
                        //     if (error) {
                        //         await refreshToken(eBay, token);
                        //     }
                        // }
                        
                        try {
                            await eBay.trading.ReviseItem({
                            Item: {
                                ItemID: update.channelId,
                                Quantity: update.quantity
                            },
                        });
                        await apiCallLog("ReviseItem","/update/inbound/:id",functionName,{
                            Item: {
                              ItemID: update?.channelId,
                              Quantity:update.quantity
                            },
                          },{}, {}, 'success');
                        } catch (error) {
                            await apiCallLog("ReviseItem","/update/inbound/:id",functionName,{
                                Item: {
                                    ItemID: update?.channelId,
                                    Quantity:update.quantity
                                },
                              },{}, error.meta, 'error');
                        }
                        

                    }

                }));
            });

        }

        await Inbound.update({
            isu: isku,
            goodQty: goodQty,
            badQty: badQty,
            totalQty: totalQty
        }, {
            where: {
                id: dataExist?.dataValues?.id
            }
        });



        return res.status(200).json({
            success: true,
            status: 200,
            message: "Data successfully updated"
        });

    } catch (err) {
        console.log(err);
        return res.status(400).json({
            success: false,
            status: 400,
            message: err.message,
        });
    }
}

async function refreshToken(eBay, token) {
    try {

        const newToken = await ebayAuthToken.getAccessToken("PRODUCTION", token.dataValues.refreshToken, scopes);

        if (JSON.parse(newToken).error) {
            token.status = "inactive";
            await token.save();

            const nodemailer = require('nodemailer');

            // Create a transporter
            let transporter = nodemailer.createTransport({
                host: process.env.SMTP_Hostname, // Replace with your SMTP host
                port: process.env.SMTP_Port,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_Username, // Replace with your SMTP username
                    pass: process.env.SMTP_Password // Replace with your SMTP password
                }
            });

            const userData = await User.findOne({ where: { id: token.dataValues.userId } });

            if (userData) {
                // Set up email data
                let mailOptions = {
                    from: process.env.FROM_EMAIL, // Replace with your email
                    to: 'aditya@mergekart.com', // Replace with the receiver's email
                    cc: userData.dataValues.email,
                    subject: 'Token Expired!',
                    text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`,
                };

                // Send the email
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        newRelic.recordCustomEvent(`Error while email sending:`, error);
                        console.log(error);
                    }
                    console.log('Message sent: %s', info.messageId);
                });
            }

            newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
            console.log(newToken.error);
            throw newToken.error;
        }

        const accessToken = JSON.parse(newToken)
        eBay.OAuth2.setCredentials(accessToken.access_token);
        token.token = accessToken.access_token;
        token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
        await token.save();

    } catch (error) {
        console.log(error);
        throw error;
    }
}