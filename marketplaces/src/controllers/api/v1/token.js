const Token = require('../../../models/tokens')
const ebay = require('ebay-api')
const User = require('../../../models/user')
const Marketplace = require('../../../models/marketplace')
const crypto = require('crypto')
const axios = require('axios')
const qs = require('qs')
const moment = require('moment')
const { helperFunction } = require('../../../helper/fetchFunction')
const { Sequelize } = require('sequelize')
const Geosite = require('../../../models/geosite')
const { v4: uuidv4 } = require('uuid')
const csku = require('../../../models/csku')
const { sequelize } = require('../../../database/config')
const eBay = new ebay({
  appId: process.env.APP_ID,
  certId: process.env.CERT_ID,
  sandbox: false,
  devId: process.env.DEV_ID,
  ruName: process.env.RU_NAME
})

const shopify = {
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SHOPIFY_SCOPES,
  REDIRECT_URI: process.env.SHOPIFY_REDIRECT_URI
}

eBay.oAuth2.setScope([
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.reputation',
  'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.stores',
  'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
])

exports.GenerateOAuthUrl = async (req, res) => {
  try {
    const marketplaceId = req.params.id

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId
      }
    })

    if (!marketPlace) {
      return res.status(500).json({
        success: false,
        message: 'Market place not found.'
      })
    }
    console.log(marketPlace)
    let url
    if (marketPlace.parentMarketplace?.includes('ebay')) {
      url = eBay.oAuth2.generateAuthUrl(process.env.RU_NAME)
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: url
    })
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.GenerateOAuthEtsyUrl = async (req,res)=>{
  try {
    const marketplaceId = req.params.id;
    const key = req.params.key;
    let client_id;
    let client_secret;
    let accountName;
    let userId;
    if (key) {
      const data = key.toString('utf8');
      [client_id, client_secret,accountName,userId] = data.split(':');    
    }
    const marketPlace = await Marketplace.findOne({
      where:{
        id:marketplaceId
      }
    })
    if (!marketPlace) {
      return res.status(500).json({
        success: false,
        message: 'Market place not found.'
      })
    }
    if(client_id != process.env.ETSY_API_KEY_FIRST && client_id != process.env.ETSY_API_KEY_SECOND){
      return res
      .status(400)
      .json({ error: "Client Id is not correct" });
    }
    if(client_secret!==process.env.ETSY_API_SECRET_FIRST && client_secret!== process.env.ETSY_API_SECRET_SECOND){
      return res
      .status(400)
      .json({ error: "Client secret is not correct" })
    }
    const token = await Token.findOne({
      where:{
        userId:userId,
        accountName:accountName,
        marketPlaceId:marketplaceId
      }
    })
    if(token){
      const updatedToken = await Token.update(
        {
          client_id: client_id,
          client_secret: client_secret,
        },
        {
          where: {
            userId: userId,
            accountName: accountName,
            marketPlaceId: marketplaceId,
          },
        }
      );
      if(updatedToken){
        console.log("Client Id updated successfully");
      }   
    }
    else{
    const data = await Token.create({
      userId: userId,
      marketPlaceId : marketplaceId,
      token: "Buffer Token",
      expiresIn: null,
      refreshToken:null,
      refreshTokenExpiresIn:null,
      accountName:accountName,
      client_id : client_id && client_id != 'undefined' ? client_id : null,
      client_secret : client_secret && client_secret != 'undefined' ? client_secret : null
    })
    if(data){
      console.log("client id created successfully!")
    }
  }
    const base64URLEncode = (str) =>
      str
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    
    const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();
    const codeVerifier = process.env.ETSY_CODE_VERIFIER;
    
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    const state = Math.random().toString(36).substring(7);
    const queryParams = qs.stringify({
      response_type: 'code',
      client_id: client_id,
      // redirect_uri: "http://localhost:3000/profile",
      redirect_uri:process.env.ETSY_REDIRECT_URI,
      scope: 'address_r address_w billing_r cart_r cart_w email_r favorites_r favorites_w feedback_r listings_d listings_r listings_w profile_r profile_w recommend_r recommend_w shops_r shops_w transactions_r transactions_w',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
  });

  const authUrl = `https://www.etsy.com/oauth/connect?${queryParams}`;
  res.status(200).json({
    success: true,
    status: 200,
    data: authUrl
  })
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

//here
exports.GenerateAmazonOAuthUrl = async (req, res) => {
  try {
    const marketplaceId = req.params.id

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId
      }
    })

    console.log('marketPlace', marketPlace)

    if (!marketPlace) {
      return res.status(500).json({
        success: false,
        message: 'Market place not found.'
      })
    }

    let url
    if (marketPlace.parentMarketplace?.includes('amazon')) {
      const state = crypto.randomBytes(16).toString('hex')
      // Redirect the user to the Amazon SP API authorization endpoint
      url = `https://sellercentral.amazon.com/apps/authorize?application_id=${
        process.env.AM_CLIENT_ID
      }&version=beta&state=${state}&scope=${
        process.env.AM_SCOPE
      }&redirect_uri=${encodeURIComponent(process.env.AM_REDIRECT_URI)}`
    }

    res.status(200).json({
      success: true,
      status: 200,
      data: url
    })
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.GenerateOAuthShopifyUrl = async (req, res) => {
  const shop = req.params.shop
  if (shop) {
    const installUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${shopify.API_KEY}&scope=${shopify.SCOPES}&redirect_uri=${shopify.REDIRECT_URI}`

    return res.status(200).json({
      success: true,
      status: 200,
      url: installUrl
    })
  } else {
    return res
      .status(400)
      .send(
        'Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request'
      )
  }
}

// exports.AddToken = async (req, res) =>
// {
//   try {
//     const {
//       userId,
//       marketPlaceId,
//       token,
//       expiresIn,
//       accountName,
//       addQuantity, consumerKey, Secret

//     } = req.body;
//     console.log("asdfg", req.body);

//     const marketPlace = await Marketplace.findOne({
//       where: { id: marketPlaceId },
//     });

//     if (!marketPlace) {
//       return res.status(500).json({
//         success: false,
//         message: "Market place not found.",
//       });
//     }

//     let access_token = token;
//     let refreshToken = "";
//     let refreshTokenExpiresIn;

//     if (marketPlace.url.includes("ebay")) {
//       const data = qs.stringify({
//         grant_type: "authorization_code",
//         code: token,
//         redirect_uri: process.env.RU_NAME,
//       });
//       const auth = Buffer.from(
//         `${ process.env.APP_ID }:${ process.env.CERT_ID }`
//       ).toString("base64");
//       const config = {
//         method: "post",
//         maxBodyLength: Infinity,
//         url: "https://api.ebay.com/identity/v1/oauth2/token",
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//           Authorization: `Basic ${ auth }`,
//         },
//         data: data,
//       };
//       const getToken = await axios.request(config);

//       access_token = getToken.data.access_token;
//       refreshToken = getToken.data.refresh_token;
//       refreshTokenExpiresIn = getToken.data.refresh_token_expires_in;

//     } else if (marketPlace.url.includes("shopify")) {
//       console.log("response:::>>")
//       // const response = await axios.post(
//       //   `https://${accountName}.myshopify.com/admin/oauth/access_token`,
//       //   {
//       //     client_id: shopify.API_KEY,
//       //     client_secret: shopify.API_SECRET,
//       //     code: token,
//       //   }
//       // );
//       access_token = token;
//     } else if (marketPlace.url.includes("woocommerce")) {
//       access_token = Buffer.from(`${ consumerKey }:${ Secret }`).toString('base64');
//     } else if (marketPlace.url.includes("walmart")) {

//       const base64Credentials = Buffer.from(`${ consumerKey }:${ Secret }`).toString('base64');
//       const authHeader = `Basic ${ base64Credentials }`;
//       const correlationId = uuidv4();

//       const tokenHeaders = {
//         'Authorization': `Basic ${ base64Credentials }`,
//         'WM_SVC.NAME': `${accountName}`,
//         'WM_QOS.CORRELATION_ID': correlationId,
//         'Accept': 'application/json',
//         'Content-Type': 'application/x-www-form-urlencoded'
//       };

//       const tokenRequestBody = qs.stringify({
//         grant_type: 'client_credentials'
//       });
//       const tokenUrl = 'https://marketplace.walmartapis.com/v3/token';
//       console.log("sdfghj")

//       try {
//         const tokenResponse = await axios.post(tokenUrl, tokenRequestBody, { headers: tokenHeaders });
//         access_token = tokenResponse.data.access_token;
//         console.log("Access Token:", access_token);
//       } catch (err) {
//         console.log("error", err)
//       }

//     }

//     const existingToken = await Token.findOne({
//       where: {
//         userId: userId,
//         marketPlaceId: marketPlaceId,
//         accountName: accountName,
//       },
//     });

//     if (existingToken) {
//       existingToken.token = access_token;
//       existingToken.refreshToken = refreshToken;
//       existingToken.refreshTokenExpiresIn = refreshTokenExpiresIn;
//       existingToken.expiresIn = expiresIn;
//       existingToken.client_id = consumerKey;
//       existingToken.client_secret = Secret;
//       existingToken.status = 'active'
//       await existingToken.save();

//       return res.status(200).json({
//         success: true,
//         status: 200,
//         data: existingToken, 
//       });
//     }

//     const data = await Token.create({
//       userId: userId.trim(),
//       marketPlaceId,
//       token: access_token,
//       expiresIn,
//       refreshToken,
//       refreshTokenExpiresIn,
//       accountName,
//       client_secret: Secret,
//       client_id: consumerKey
//     });

//     if (data) {
//       helperFunction(userId, marketPlaceId, accountName, addQuantity);
//     }

//     return res.status(200).json({
//       success: true,
//       status: 200,
//       data: data,
//     });
//   } catch (err) {
//     console.log(err.response);
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.response,
//     });
//   }
// };


exports.AddToken = async (req, res) => {
  try {
    let {
      userId,
      marketPlaceId,
      token,
      expiresIn,
      accountName,
      addQuantity,
      consumerKey,
      Secret
    } = req.body
    console.log("data", userId,marketPlaceId, token, expiresIn, accountName)
    const marketPlace = await Marketplace.findOne({
      where: { id: marketPlaceId }
    })
    if (!accountName) {
      return res.status(400).json({
        success: false,
        message: 'Please Provide All Required Details'
      })
    }
    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: 'Market place not found.'
      })
    }

    let access_token = token
    let refreshToken = ''
    let refreshTokenExpiresIn
    
    if (marketPlace.url.includes('ebay')) {
      const data = qs.stringify({
        grant_type: 'authorization_code',
        code: token,
        redirect_uri: process.env.RU_NAME
      })
      const auth = Buffer.from(
        `${process.env.APP_ID}:${process.env.CERT_ID}`
      ).toString('base64')
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.ebay.com/identity/v1/oauth2/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`
        },
        data: data
      }
      const getToken = await axios.request(config)
      access_token = getToken.data.access_token
      refreshToken = getToken.data.refresh_token
      refreshTokenExpiresIn = getToken.data.refresh_token_expires_in
    } else if (marketPlace.url.includes('shopify')) {
      // const response = await axios.post(
      //   `https://${accountName}.myshopify.com/admin/oauth/access_token`,
      //   {
      //     client_id: shopify.API_KEY,
      //     client_secret: shopify.API_SECRET,
      //     code: token,
      //   }
      // );
      access_token = token
    } else if (marketPlace.url.includes('woocommerce')) {
      if (!consumerKey || !Secret || consumerKey === '' || Secret === '') {
        return res.status(400).json({
          success: false,
          message: 'Please Provide All Required Details'
        })
      }
      accountName = accountName?.includes('.com')
        ? accountName
        : `${accountName}.com`
      const authString = Buffer.from(
        `${consumerKey}:${Secret}`
      ).toString('base64')
      access_token = authString
      const testUrl = `http://${accountName}/wp-json/wc/v3/orders?per_page=1`
      try {
        const testResponse = await axios.get(testUrl, {
          headers: {
            Authorization: `Basic ${authString}`
          }
        })
        if (testResponse.status === 200) {
          access_token = authString
        }
      } catch (error) {
        console.log(error , 'woo-commerce credential error')
        return res.status(401).json({
          success: false,
          message: 'Invalid WooCommerce credentials.'
        })
      }
    } else if (marketPlace.url.includes('walmart')) {
      const authString = Buffer.from(
        `${consumerKey}:${Secret}`
      ).toString('base64')
      const correlationId = uuidv4()

      const tokenHeaders = {
        Authorization: `Basic ${authString}`,
        'WM_SVC.NAME': `${accountName}`,
        'WM_QOS.CORRELATION_ID': correlationId,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }

      const tokenRequestBody = qs.stringify({
        grant_type: 'client_credentials'
      })
      const tokenUrl = 'https://marketplace.walmartapis.com/v3/token'

      try {
        const tokenResponse = await axios.post(tokenUrl, tokenRequestBody, {
          headers: tokenHeaders
        })
        access_token = tokenResponse.data.access_token
        console.log('Access Token:', access_token)
      } catch (err) {
        console.log('error', err)
      }
    }else if(marketPlace.url.includes('etsy'))
      {
        console.log("entering add token")
        const BufferToken = await Token.findOne({
          where:{
            userId:userId,
            accountName:accountName,
            marketPlaceId:marketPlaceId
          }
        })
      const tokenResponse = await axios.post('https://api.etsy.com/v3/public/oauth/token', qs.stringify({
        grant_type: 'authorization_code',
        client_id: BufferToken.dataValues.client_id,
        redirect_uri: process.env.ETSY_REDIRECT_URI,
        // redirect_uri:"http://localhost:3000/profile",
        code: token,
        code_verifier: process.env.ETSY_CODE_VERIFIER
    }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

      access_token = tokenResponse.data.access_token
      refreshToken = tokenResponse.data.refresh_token
      refreshTokenExpiresIn = tokenResponse.data.expires_in
    }

    const existingToken = await Token.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName
      }
    })

    if (existingToken) {
      existingToken.token = access_token
      existingToken.refreshToken = refreshToken
      existingToken.refreshTokenExpiresIn = refreshTokenExpiresIn
      existingToken.expiresIn = expiresIn
      existingToken.client_id = consumerKey && consumerKey != 'undefined' ? consumerKey : null
      existingToken.client_secret = Secret && Secret != 'undefined' ? Secret : null
      existingToken.status = 'active';
      existingToken.lastTokenRefreshDate = moment().toISOString();
      await existingToken.save()

      return res.status(200).json({
        success: true,
        status: 200,
        data: existingToken
      })
    }

    const data = await Token.create({
      userId: userId.trim(),
      marketPlaceId,
      token: access_token,
      expiresIn,
      refreshToken,
      refreshTokenExpiresIn,
      accountName,
      client_id : consumerKey && consumerKey != 'undefined' ? consumerKey : null,
      client_secret : Secret && Secret != 'undefined' ? Secret : null,
      lastTokenRefreshDate: moment().toISOString()
    })
    if (data) {
      helperFunction(userId, marketPlaceId, accountName, addQuantity)
    }
    return res.status(200).json({
      success: true,
      status: 200,
      data: data
    })
  } catch (err) {
    console.log(err , 'er')
    return res.status(500).json({
      success: false,
      status: 500,
      message: err?.message || 'Unexpected Error'
    })
  }
}

exports.AddTokenForAmazon = async (req, res) => {
  try {
    const { userId, marketPlaceId, token, expiresIn, accountName } = req.body

    const marketPlace = await Marketplace.findOne({
      where: { id: marketPlaceId }
    })

    if (!marketPlace) {
      return res.status(500).json({
        success: false,
        message: 'Market place not found.'
      })
    }

    let access_token = token
    let refreshToken = ''
    let refreshTokenExpiresIn

    if (marketPlace.url.includes('amazon')) {
      const getToken = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        {
          grant_type: 'authorization_code',
          code: token,
          client_id: process.env.AM_CLIENT_ID,
          client_secret: process.env.AM_CLIENT_SECRET,
          redirect_uri: process.env.AM_REDIRECT_URI
        }
      )

      access_token = getToken.data.access_token
      console.log('getToken', getToken)
    }

    // const existingToken = await Token.findOne({
    //   where: {
    //     userId: userId,
    //     marketPlaceId: marketPlaceId,
    //     accountName: accountName,
    //   },
    // });

    // if (existingToken) {
    //   existingToken.token = access_token;
    //   existingToken.refreshToken = refreshToken;
    //   existingToken.refreshTokenExpiresIn = refreshTokenExpiresIn;
    //   existingToken.expiresIn = expiresIn;
    //   await existingToken.save();

    //   return res.status(200).json({
    //     success: true,
    //     status: 200,
    //     data: existingToken,
    //   });
    // }

    // const data = await Token.create({
    //   userId,
    //   marketPlaceId,
    //   token: access_token,
    //   expiresIn,
    //   refreshToken,
    //   refreshTokenExpiresIn,
    //   accountName,
    // });

    // return res.status(200).json({
    //   success: true,
    //   status: 200,
    //   data: data,
    // });
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.GetAllTokens = async (req, res) => {
  try {
    const { userId } = req.query

    const data = await Token.findAll({
      where: { userId: userId },
      include: [{ model: User }, { model: Marketplace }]
    })

    return res.status(200).json({
      success: true,
      status: 200,
      data: data
    })
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

// exports.GetUserMarketplaces = async (req, res) => {
//   try {
//     const userId = req.params.id

//     const data = await Token.findAll({
//       where: {
//         userId: userId
//       },
//       include: {
//         model: Marketplace
//       }
//     })

//     const response = data.map(item => {
//       return {
//         id: item.id,
//         accountName: item.accountName,
//         marketplaceId: item?.marketplace?.id,
//         marketplaceName: item?.marketplace?.parentMarketplace,
//         marketplaceLogo: item?.marketplace?.image
//       }
//     })

//     return res.status(200).json({
//       success: false,
//       status: 200,
//       data: response
//     })
//   } catch (err) {
//     console.log(err)
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.message
//     })
//   }
// }

exports.GetUserMarketplaces = async (req, res) => {
  try {
    const userId = req.params.id;

    // Get tokens with marketplace info
    const data = await Token.findAll({
      where: {
        userId: userId
      },
      include: [
        {
          model: Marketplace,
          attributes: ['id', 'parentMarketplace', 'image']
        }
      ]
    });

    // Get product counts for each marketplace using the same counting logic as GetCatalogueStatusCount
    const productCounts = await Promise.all(
      data.map(async (token) => {
        const baseQuery = { 
          userId: userId,
          accountName: token.accountName 
        };

        // Using the same counting method as GetCatalogueStatusCount
        const count = await csku.count({
          where: baseQuery,  // For 'all' status, we don't include status in where clause
          distinct: true,
          col: 'channelId'
        });

        return {
          accountName: token.accountName,
          productCount: count
        };
      })
    );

    // Create a map of account names to product counts
    const productCountMap = productCounts.reduce((acc, item) => {
      acc[item.accountName] = item.productCount;
      return acc;
    }, {});


    const response = data.map(item => {
      return {
        id: item.id,
        accountName: item.accountName,
        marketplaceId: item?.marketplace?.id,
        marketplaceName: item?.marketplace?.parentMarketplace,
        marketplaceLogo: item?.marketplace?.image,
        productCount: productCountMap[item.accountName] || 0,
        banner1: item.top_banner || null,    
        banner2: item.bottom_banner || null, 
      }
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: response
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    });
  }
};
exports.GetAllTokensByGroup = async (req, res) => {
  try {
    const { userId } = req.query

    // Fetch all tokens related to the user
    const tokens = await Token.findAll({
      where: { userId: userId },
      include: [
        {
          model: User,
          attributes: []
        },
        {
          model: Marketplace,
          attributes: []
        }
      ],
      raw: true
    })

    // Group the tokens by marketplaceId
    const groupedTokens = tokens.reduce((acc, token) => {
      const marketplaceId = token.marketPlaceId
      if (!acc[marketplaceId]) {
        acc[marketplaceId] = []
      }
      acc[marketplaceId].push(token.accountName)
      return acc
    }, {})

    // Convert the groupedTokens object to the desired format
    const result = await Promise.all(
      Object.keys(groupedTokens).map(async marketplaceId => {
        const geoSites = await Geosite.findAll({
          where: { marketPlaceId: marketplaceId },
          raw: true
        })

        const marketplaceData = await Marketplace.findOne({
          where: { id: marketplaceId },
          attributes: ['parentMarketplace', 'image'], // Include the parentMarketplace and image attributes
          raw: true
        })

        return {
          marketPlaceId: marketplaceId,
          parentMarketplace: marketplaceData.parentMarketplace,
          marketplaceLogo: marketplaceData.image,
          accountName: groupedTokens[marketplaceId],
          geoSite: geoSites.map(site => ({
            globalId: site.globalId,
            siteId: site.siteId,
            currency: site.currency,
            siteName: site.siteName,
            countryName: site.countryName
          }))
        }
      })
    )

    return res.status(200).json({
      success: true,
      status: 200,
      data: result
    })
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

// exports.AddTokenForWooCommerce = async (req, res) =>
// {
//   try {
//     const { consumerKey, Secret, marketPlaceId, accountName, userId } = req.body;

//     const marketPlace = await Marketplace.findOne({
//       where: { id: marketPlaceId },
//     });

//     if (!marketPlace) {
//       return res.status(500).json({
//         success: false,
//         message: "Market place not found.",
//       });
//     }
//     let token;
//     let refreshToken = "";
//     if (marketPlace.url.includes("woocommerce")) {
//       token = Buffer.from(`${ consumerKey }:${ Secret }`).toString('base64');
//     }

//     const existingToken = await Token.findOne({
//       where: {
//         userId: userId,
//         marketPlaceId: marketPlaceId,
//         accountName: accountName,
//       },
//     });

//     if (existingToken) {
//       existingToken.token = token;
//       existingToken.refreshToken = refreshToken;
//       // existingToken.refreshTokenExpiresIn = refreshTokenExpiresIn;
//       // existingToken.expiresIn = expiresIn;
//       await existingToken.save();

//       return res.status(200).json({
//         success: true,
//         status: 200,
//         data: existingToken,
//       });
//     }

//     const data = await Token.create({
//       userId,
//       marketPlaceId,
//       token: token,
//       // expiresIn,
//       refreshToken,
//       // refreshTokenExpiresIn,
//       accountName,
//     });

//     return res.status(200).json({
//       success: true,
//       status: 200,
//       data: data,
//     });

//   } catch (err) {
//     console.log(err);
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.message,
//     });
//   }
// }

exports.handleBanner = async (req, res) => {
  try {
    const { userId, top_banner, bottom_banner } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    // Build update object dynamically; both banners are optional.
    const updateData = {};
    if (typeof top_banner !== 'undefined') {
      updateData.top_banner = top_banner;
    }
    if (typeof bottom_banner !== 'undefined') {
      updateData.bottom_banner = bottom_banner;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    // Update the token records based on userId
    const [updatedCount] = await Tokens.update(updateData, { where: { userId } });
    if (updatedCount === 0) {
      return res.status(404).json({ success: false, message: 'No token record found for the provided userId.' });
    }

    return res.json({ success: true, message: 'Banners updated successfully.' });
  } catch (error) {
    console.error('Error updating banners:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}