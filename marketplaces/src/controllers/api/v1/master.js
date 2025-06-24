const { default: axios } = require('axios')
const ebay = require('ebay-api')
const Marketplace = require('../../../models/marketplace')
const Tokens = require('../../../models/tokens')
const shippingPoliciesModel = require('../../../models/shippingPolicies')
const paymentPolicyModel = require('../../../models/paymentPolicy')
const returnPolicyModel = require('../../../models/returnPolicy')
const EbayAuthToken = require('ebay-oauth-nodejs-client')
const newRelic = require('newrelic')
const Geosite = require('../../../models/geosite')
const { Sequelize } = require('sequelize')
const fs = require('fs')
const { apiCallLog } = require("../../../helper/apiCallLog")
const moment = require('moment')
const User = require('../../../models/user');
const { sequelize } = require('../../../database/config');
// const { console } = require('inspector')

const ebayAuthToken = new EbayAuthToken({
  clientId: process.env.APP_ID,
  clientSecret: process.env.CERT_ID
});

const scopes = [
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
];

const ebayCountries = {
  Andorra: 'AD',
  'United Arab Emirates': 'AE',
  Afghanistan: 'AF',
  'Antigua and Barbuda': 'AG',
  Anguilla: 'AI',
  Albania: 'AL',
  Armenia: 'AM',
  'Netherlands Antilles': 'AN',
  Angola: 'AO',
  Antarctica: 'AQ',
  Argentina: 'AR',
  'American Samoa': 'AS',
  Austria: 'AT',
  Australia: 'AU',
  Aruba: 'AW',
  Azerbaijan: 'AZ',
  'Bosnia and Herzegovina': 'BA',
  Barbados: 'BB',
  Bangladesh: 'BD',
  Belgium: 'BE',
  'Burkina Faso': 'BF',
  Bulgaria: 'BG',
  Bahrain: 'BH',
  Burundi: 'BI',
  Benin: 'BJ',
  Bermuda: 'BM',
  'Brunei Darussalam': 'BN',
  Bolivia: 'BO',
  Brazil: 'BR',
  Bahamas: 'BS',
  Bhutan: 'BT',
  'Bouvet Island': 'BV',
  Botswana: 'BW',
  Belarus: 'BY',
  Belize: 'BZ',
  Canada: 'CA',
  'Cocos (Keeling) Islands': 'CC',
  'Congo, The Democratic Republic of the': 'CD',
  'Central African Republic': 'CF',
  Congo: 'CG',
  Switzerland: 'CH',
  "Cote d'Ivoire": 'CI',
  'Cook Islands': 'CK',
  Chile: 'CL',
  Cameroon: 'CM',
  China: 'CN',
  Colombia: 'CO',
  'Costa Rica': 'CR',
  Cuba: 'CU',
  'Reserved for internal or future use': 'CustomCode',
  'Cape Verde': 'CV',
  'Christmas Island': 'CX',
  Cyprus: 'CY',
  'Czech Republic': 'CZ',
  Germany: 'DE',
  Djibouti: 'DJ',
  Denmark: 'DK',
  Dominica: 'DM',
  'Dominican Republic': 'DO',
  Algeria: 'DZ',
  Ecuador: 'EC',
  Estonia: 'EE',
  Egypt: 'EG',
  'Western Sahara': 'EH',
  Eritrea: 'ER',
  Spain: 'ES',
  Ethiopia: 'ET',
  Finland: 'FI',
  Fiji: 'FJ',
  'Falkland Islands (Malvinas)': 'FK',
  'Federated States of Micronesia': 'FM',
  'Faroe Islands': 'FO',
  France: 'FR',
  Gabon: 'GA',
  'United Kingdom': 'GB',
  Grenada: 'GD',
  Georgia: 'GE',
  'French Guiana': 'GF',
  Guernsey: 'GG',
  Ghana: 'GH',
  Gibraltar: 'GI',
  Greenland: 'GL',
  Gambia: 'GM',
  Guinea: 'GN',
  Guadeloupe: 'GP',
  'Equatorial Guinea': 'GQ',
  Greece: 'GR',
  'South Georgia and the South Sandwich Islands': 'GS',
  Guatemala: 'GT',
  Guam: 'GU',
  'Guinea-Bissau': 'GW',
  Guyana: 'GY',
  'Hong Kong': 'HK',
  'Heard Island and McDonald Islands': 'HM',
  Honduras: 'HN',
  Croatia: 'HR',
  Haiti: 'HT',
  Hungary: 'HU',
  Indonesia: 'ID',
  Ireland: 'IE',
  Israel: 'IL',
  India: 'IN',
  'British Indian Ocean Territory': 'IO',
  Iraq: 'IQ',
  'Islamic Republic of Iran': 'IR',
  Iceland: 'IS',
  Italy: 'IT',
  Jersey: 'JE',
  Jamaica: 'JM',
  Jordan: 'JO',
  Japan: 'JP',
  Kenya: 'KE',
  Kyrgyzstan: 'KG',
  Cambodia: 'KH',
  Kiribati: 'KI',
  Comoros: 'KM',
  'Saint Kitts and Nevis': 'KN',
  "Democratic People's Republic of Korea": 'KP',
  'Republic of Korea': 'KR',
  Kuwait: 'KW',
  'Cayman Islands': 'KY',
  Kazakhstan: 'KZ',
  "Lao People's Democratic Republic": 'LA',
  Lebanon: 'LB',
  'Saint Lucia': 'LC',
  Liechtenstein: 'LI',
  'Sri Lanka': 'LK',
  Liberia: 'LR',
  Lesotho: 'LS',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Latvia: 'LV',
  'Libyan Arab Jamahiriya': 'LY',
  Morocco: 'MA',
  Monaco: 'MC',
  'Republic of Moldova': 'MD',
  Montenegro: 'ME',
  Madagascar: 'MG',
  'Marshall Islands': 'MH',
  'The Former Yugoslav Republic of Macedonia': 'MK',
  Mali: 'ML',
  Myanmar: 'MM',
  Mongolia: 'MN',
  Macao: 'MO',
  'Northern Mariana Islands': 'MP',
  Martinique: 'MQ',
  Mauritania: 'MR',
  Montserrat: 'MS',
  Malta: 'MT',
  Mauritius: 'MU',
  Maldives: 'MV',
  Malawi: 'MW',
  Mexico: 'MX',
  Malaysia: 'MY',
  Mozambique: 'MZ',
  Namibia: 'NA',
  'New Caledonia': 'NC',
  Niger: 'NE',
  'Norfolk Island': 'NF',
  Nigeria: 'NG',
  Nicaragua: 'NI',
  Netherlands: 'NL',
  Norway: 'NO',
  Nepal: 'NP',
  Nauru: 'NR',
  Niue: 'NU',
  'New Zealand': 'NZ',
  Oman: 'OM',
  Panama: 'PA',
  Peru: 'PE',
  'French Polynesia': 'PF',
  'Papua New Guinea': 'PG',
  Philippines: 'PH',
  Pakistan: 'PK',
  Poland: 'PL',
  'Saint Pierre and Miquelon': 'PM',
  Pitcairn: 'PN',
  'Puerto Rico': 'PR',
  'Palestinian territory, Occupied': 'PS',
  Portugal: 'PT',
  Palau: 'PW',
  Paraguay: 'PY',
  Qatar: 'QA',
  Reunion: 'RE',
  Romania: 'RO',
  Serbia: 'RS',
  'Russian Federation': 'RU',
  Rwanda: 'RW',
  'Saudi Arabia': 'SA',
  'Solomon Islands': 'SB',
  Seychelles: 'SC',
  Sudan: 'SD',
  Sweden: 'SE',
  Singapore: 'SG',
  'Saint Helena': 'SH',
  Slovenia: 'SI',
  'Svalbard and Jan Mayen': 'SJ',
  Slovakia: 'SK',
  'Sierra Leone': 'SL',
  'San Marino': 'SM',
  Senegal: 'SN',
  Somalia: 'SO',
  Suriname: 'SR',
  'Sao Tome and Principe': 'ST',
  'El Salvador': 'SV',
  'Syrian Arab Republic': 'SY',
  Swaziland: 'SZ',
  'Turks and Caicos Islands': 'TC',
  Chad: 'TD',
  'French Southern Territories': 'TF',
  Togo: 'TG',
  Thailand: 'TH',
  Tajikistan: 'TJ',
  Tokelau: 'TK',
  Turkmenistan: 'TM',
  Tunisia: 'TN',
  Tonga: 'TO',
  'No longer in use': 'TP',
  Turkey: 'TR',
  'Trinidad and Tobago': 'TT',
  Tuvalu: 'TV',
  'Taiwan, Province of China': 'TW',
  'Tanzania, United Republic of': 'TZ',
  Ukraine: 'UA',
  Uganda: 'UG',
  'United States': 'US',
  Uruguay: 'UY',
  Uzbekistan: 'UZ',
  'Holy See (Vatican City state)': 'VA',
  'Saint Vincent and the Grenadines': 'VC',
  Venezuela: 'VE',
  'Virgin Islands, British': 'VG',
  'Virgin Islands, U.S.': 'VI',
  Vietnam: 'VN',
  Vanuatu: 'VU',
  'Wallis and Futuna': 'WF',
  Samoa: 'WS',
  Yemen: 'YE',
  Mayotte: 'YT',
  'South Africa': 'ZA',
  Zambia: 'ZM',
  Zimbabwe: 'ZW',
  'Unknown country': 'ZZ'
};
// fetches and stores eBay policies for a given user and marketplace
exports.GetSellerProfiles = async (req, res) => {
  const functionName = "GetSellerProfiles";
  try {
    const { userId, marketplaceId, accountName } = req.body
    console.log(userId, marketplaceId, accountName, "get user profiles data");
    
    const marketPlace = await Marketplace.findOne({
      where: {
        id: parseInt(marketplaceId)
      }
    })
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: parseInt(marketplaceId),
        accountName: accountName
      }
    })
    const geoSites = await Geosite.findAll()
    if (marketPlace.url?.includes('ebay') && token) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID
      })
      eBay.OAuth2.setCredentials(token.dataValues.token)
      console.log('Geo site loop outside')
      // for (var i = 0; i < geoSites.length; i++) 
      await Promise.all(geoSites.map(async (geo) => {
        console.log('Geo site loop inside')
        let response = []
        let payment = []
        let returnPol = []

        const geoSite = geo.dataValues.globalId
        console.log(geoSite)
        let startdate = moment().add(5, 'hours').add(30, 'minutes');
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

        if (hoursDifference >= 2) {
          await refreshToken(eBay, token)
        }
        // try {
        //   await eBay.trading.GetTokenStatus({
        //     RequesterCredentials: {
        //       eBayAuthToken: token.dataValues.token,
        //     },
        //   });
        //   await apiCallLog("GetTokenStatus","/master/get-user-profiles",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
        // } catch (err) {
        //   await apiCallLog("GetTokenStatus","/master/get-user-profiles",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');

        //   await refreshToken(eBay, token);
        // }
        try {
          const shippingData = await eBay.sell.account.getFulfillmentPolicies(
            geoSite
          )
          if (shippingData.total > 0) {
            shippingData?.fulfillmentPolicies?.map(policy => {
              response.push({
                userId: userId,
                accountName: accountName,
                name: policy.name,
                fulfillmentPolicyId: policy.fulfillmentPolicyId,
                geoSite: geoSite,
                policy_details: policy,
                marketplaceId: marketplaceId,
              })
            })

            await shippingPoliciesModel.bulkCreate(response)
          }
        } catch (err) {
          const error= {
            message: err.message
          }
          newRelic.recordCustomEvent(`Error`, error)
          console.log(err)
        }

        try {
          const paymentPolicies = await eBay.sell.account.getPaymentPolicies(
            geoSite
          )

          if (paymentPolicies.total > 0) {
            paymentPolicies.paymentPolicies?.map(policy => {
              payment.push({
                userId: userId,
                accountName: accountName,
                name: policy.name,
                paymentPolicyId: policy.paymentPolicyId,
                geoSite: geoSite,
                policy_details: policy,
                marketplaceId: marketplaceId
              })
            })

            await paymentPolicyModel.bulkCreate(payment)
          }
        } catch (err) {
          newRelic.recordCustomEvent(`Error`, err.meta)
          console.log(err)
        }

        try {
          const returnPolicies = await eBay.sell.account.getReturnPolicies(
            geoSite
          )

          if (returnPolicies.total > 0) {
            returnPolicies.returnPolicies?.map(policy => {
              returnPol.push({
                userId: userId,
                accountName: accountName,
                name: policy.name,
                returnPolicyId: policy.returnPolicyId,
                geoSite: geoSite,
                policy_details: policy,
                marketplaceId: marketplaceId
              })
            })

            returnPolicyModel.bulkCreate(returnPol)
          }
        } catch (err) {
          newRelic.recordCustomEvent(`Error`, err.meta)
          console.log(err)
        }
      }))
      res.status(200).json({
        success: true,
        status: 200,
        message: `Policies fetched`
      })
    }else if (marketPlace.url?.includes('etsy') && token) {
          let startdate = moment();
          let tokenExpiresDate = moment(token.lastTokenRefreshDate);
          let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");
      
          if (minuteDifference >= 45) {
            await refreshTokenEtsy(token);
          }
      
          let access_token = token.dataValues.token;
          const id = access_token.split(".")[0];
          let response;
          const shippingPolicies = [];
          const returnPolicies = [];
      
          try {
            response = await axios.get(
              `https://openapi.etsy.com/v3/application/users/${id}/shops`,
              {
                headers: {
                  Authorization: `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                  "x-api-key": token.dataValues.client_id,
                },
              }
            );
      
            console.log("Shop Details:", response.data.shop_id);
            const shopId = response.data.shop_id;
            //Shipping policy Etsy
            try {
              const shippingData = await axios.get(`https://openapi.etsy.com/v3/application/shops/${shopId}/shipping-profiles`, {
                  headers: {
                      'Authorization': `Bearer ${access_token}`,
                      'x-api-key': token.dataValues.client_id,
                      'Content-Type': 'application/json',
                  }
              });
              console.log(shippingData.data);
              if (shippingData.data.results.length > 0) {
                shippingData?.data.results?.map(policy => {
                  shippingPolicies.push({
                    userId: userId,
                    accountName: accountName,
                    name: policy.title,
                    fulfillmentPolicyId: policy.shipping_profile_id,
                    policy_details: policy,
                    marketplaceId:marketplaceId
                  })
                })
    
                await shippingPoliciesModel.bulkCreate(shippingPolicies)
              }

              //Return Policy Etsy
              try {
                const returnData = await axios.get(`https://openapi.etsy.com/v3/application/shops/${shopId}/policies/return`, {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'x-api-key': token.dataValues.client_id,
                        'Content-Type': 'application/json',
                    }
                });
                console.log(returnData.data);

                if (returnData.data.results.length > 0) {
                  returnData?.data?.results?.map(policy => {
                    returnPolicies.push({
                      userId: userId,
                      accountName: accountName,
                      name: `Return Policy ${policy?.return_deadline}`,
                      returnPolicyId: policy.return_policy_id,
                      policy_details: policy,
                      marketplaceId: marketplaceId
                    })
                  })
      
                  await returnPolicyModel.bulkCreate(returnPolicies)
                }

            } catch (error) {
                console.error('Error fetching return policies:', error);
            }
          } catch (error) {
              console.error('Error fetching shipping profiles:', error);
          }
          } catch (error) {
            if (error.response) {
              console.error("Error:", error.response.status, error.response.data);
            } else if (error.request) {
              console.error("No response:", error.request);
            } else {
              console.error("Error:", error.message);
            }
            return; // Exit on error
          }
          res.status(200).json({
            success: true,
            status: 200,
            message: `Policies fetched`
          })       
    }
     else {
      return res.status(200).json({
        success: true,
        message: 'Integration for your marketplace incoming'
      })
    }
  } catch (err) {
    newRelic.recordCustomEvent(
      `Error while ftech policies. Error: ${err.message}`
    )
    console.log(err)
    res.status(500).json({
      success: false,
      status: 500,
      message: err.message
    })
  }
}

exports.RetrieveSellerProfiles = async (req, res) => {
  try {
    const { userId, accountName, siteId } = req.body

    // Initialize response object
    let response = {}

    // Helper function to get policies
    const getPolicies = async (model, userId, name, siteId, policyKey) => {
      const policyArray = await model.findAll({
        where: {
          userId: userId,
          accountName: name,
          geoSite: siteId
        }
      })

      return (
        policyArray?.map(policy => ({
          name: policy.name,
          id: policy[`${policyKey}PolicyId`]
        })) || []
      )
    }

    // Loop through each accountName and siteId to fetch the policies
    await Promise.all(
      accountName.map(async accName => {
        response[accName] = {}
        await Promise.all(
          siteId?.map(async Id => {
            const shippingPolicies = await getPolicies(
              shippingPoliciesModel,
              userId,
              accName,
              Id,
              'fulfillment'
            )
            const paymentPolicies = await getPolicies(
              paymentPolicyModel,
              userId,
              accName,
              Id,
              'payment'
            )
            const returnPolicies = await getPolicies(
              returnPolicyModel,
              userId,
              accName,
              Id,
              'return'
            )
            response[accName][Id] = {
              shippingPolicies,
              paymentPolicies,
              returnPolicies
            }
          })
        )
      })
    )
    res.status(200).json({
      success: true,
      status: 200,
      policies: response
    })
  } catch (err) {
    console.log(err)
    res.status(500).json({
      success: false,
      status: 500,
      message: err.message
    })
  }
}
exports.RetrieveSellerProfilesEtsy = async (req, res) => {
  try {
    const { userId, accountName } = req.body

    let response = {}

    const getPolicies = async (model, userId, name, policyKey) => {
      const policyArray = await model.findAll({
        where: {
          userId: userId,
          accountName: name,
        }
      })

      return (
        policyArray?.map(policy => ({
          name: policy.name,
          id: policy[`${policyKey}PolicyId`]
        })) || []
      )
    }

    await Promise.all(
      accountName.map(async accName => {
        response[accName] = {}
        const shippingPolicies = await getPolicies(
          shippingPoliciesModel,
          userId,
          accName,
          'fulfillment'
        )
        const returnPolicies = await getPolicies(
          returnPolicyModel,
          userId,
          accName,
          'return'
        )
        response[accName] = {
          shippingPolicies,
          returnPolicies
        }
      })
    )
    res.status(200).json({
      success: true,
      status: 200,
      policies: response
    })
  } catch (err) {
    console.log(err)
    res.status(500).json({
      success: false,
      status: 500,
      message: err.message
    })
  }
}

const getEbayInstance = async (userId, accName, marketplaceId, token) => {
  const functionName = "getEbayInstance";
  console.log(token, accName, "token");
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID
  })
  let startdate = moment().add(5, 'hours').add(30, 'minutes');
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

  if (hoursDifference >= 2) {
    await refreshToken(eBay, token)
  }
  // try {
  //   eBay.OAuth2.setCredentials(token.dataValues.token)
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token.dataValues.token,
  //     },
  //   });
  //   await apiCallLog("GetTokenStatus","/master/copy-seller-profiles",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //     await apiCallLog("GetTokenStatus","/master/copy-seller-profiles",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
  // await refreshToken(eBay, token);
  //   const newToken = await Tokens.findOne({
  //     where: {
  //       userId: userId,
  //       marketPlaceId: marketplaceId,
  //       accountName: accName
  //     }
  //   })
  //   eBay.OAuth2.setCredentials(newToken.dataValues.token)
  // }

  return eBay
}
const copyPolicies = async ({
  eBay,
  userId,
  sourceAccount,
  destinationAccount,
  marketplaceId,
  sourceToken,
  policyIds,
  sourceGeoSite,
  destinationGeoSite,
  modelName,
  fieldName,
  policyType,
  successResponses,
  errorResponses,
  res
}) => {
  const policiesData = await modelName.findAll({
    where: {
      [fieldName]: policyIds,
      userId: userId,
      accountName: sourceAccount,
      geoSite: sourceGeoSite
    }
  })

  const existingPolicies = await modelName.findAll({
    where: {
      userId: userId,
      accountName: destinationAccount,
      geoSite: destinationGeoSite,
      copied_policy_id: policyIds
    }
  })

  const existingPolicyIds = new Set(
    existingPolicies?.map(policy => policy.copied_policy_id)
  )

  // Check for existing policy IDs and store errors for them
  for (const policy of policiesData) {
    if (existingPolicyIds.has(policy[fieldName])) {
      const errorMessage = `Policy ID: ${policy[fieldName]} already exists in the database.`
      const errorDetails = {
        message: errorMessage,
        error: errorMessage,
        details: errorMessage
      }
      errorResponses.push(errorDetails)
      await modelName.update(
        { error: JSON.stringify(errorDetails) },
        {
          where: {
            userId: userId,
            accountName: destinationAccount,
            geoSite: destinationGeoSite,
            copied_policy_id: policy[fieldName]
          }
        }
      )
    }
  }

  const filteredPoliciesData = policiesData?.filter(
    policy => !existingPolicyIds.has(policy[fieldName])
  )

  let destPolicies = []

  for (const policy of filteredPoliciesData) {
    const { [fieldName]: policyId, ...rest } = policy.dataValues.policy_details
    let modifiedShippingOptions = []

    if (policyType === 'shipping') {
      const { shippingOptions } = policy?.dataValues?.policy_details ?? {}

      await Promise.all(
        shippingOptions?.map(async ({ rateTableId, ...shippingOption }) => {
          try {
            await getEbayInstance(
              userId,
              sourceAccount,
              marketplaceId,
              sourceToken
            )
            const newToken = await Tokens.findOne({
              where: {
                userId: userId,
                marketPlaceId: marketplaceId,
                accountName: sourceAccount
              }
            })
            const rateTableDetails = await axios.get(
              `https://api.ebay.com/sell/account/v2/rate_table/${rateTableId}`,
              {
                headers: {
                  Accept: 'application/json',
                  Authorization: `Bearer ${newToken?.dataValues?.token}`
                }
              }
            )
            if (rateTableDetails?.data) {
              const { rates } = rateTableDetails?.data
              const rateTable = rates?.map(rate => ({
                sortOrder: rate?.rateId,
                // shippingCarrierCode: rate?.shippingCategory || 'STANDARD',
                shippingServiceCode:
                  shippingOption?.optionType == 'DOMESTIC'
                    ? 'USPSPriority'
                    : 'StandardInternational' || rate?.shippingServiceCode,
                shippingCost: rate?.shippingCost,
                freeShipping: false,
                shipToLocations: {
                  regionIncluded: rate?.shippingRegionNames
                    .map(region => {
                      return ebayCountries[region]
                        ? { regionName: ebayCountries[region] }
                        : false
                    })
                    .filter(Boolean)
                },
                buyerResponsibleForShipping: false,
                buyerResponsibleForPickup: false
              }))
              console.log(rateTable?.length, 'rateTable')
              shippingOption.shippingServices = rateTable
              modifiedShippingOptions.push({
                ...shippingOption,
                shippingServices: rateTable?.slice(0, 5)
              })
            }
          } catch (error) {
            console.log(error?.response, 'error')
            const errorDetails = {
              message: `Error While Fetching Rate Table Details of Rate Table Id `,
              error: error.message,
              details: error.meta?.longMessage
            }
            errorResponses.push(errorDetails)
          }
        })
      )
    }

    const data = {
      userId: policy.dataValues.userId,
      accountName: destinationAccount,
      name: policy.dataValues.name,
      [fieldName]: '',
      marketplaceId: policy.dataValues.marketplaceId,
      geoSite: destinationGeoSite,
      policy_details:
        policyType === 'shipping'
          ? {
            ...rest,
            ...(modifiedShippingOptions
              ? { shippingOptions: modifiedShippingOptions }
              : {}),
            marketplaceId: destinationGeoSite
          }
          : {
            ...rest,
            marketplaceId: destinationGeoSite
          },
      copied_acc_name: sourceAccount,
      copied_policy_id: policy.dataValues[fieldName],
      status: 'ready to list'
    }
    destPolicies.push(data)
  }

  console.log(destPolicies, 'destPolicies')
  console.log(`Inserting in ${destinationAccount} account`)
  // const bulkdata = await modelName.bulkCreate(destPolicies);
  // console.log(bulkdata, "bulkdata");
  console.log('Finished writing to destination account')
  console.log('Policies to be copied: ', filteredPoliciesData?.length)

  await Promise.all(
    destPolicies?.map(async (policy, index) => {
      try {
        const {
          [fieldName]: policyId,
          shipToLocations,
          ...rest
        } = policy.policy_details
        // fs.writeFileSync('policy.json' , JSON.stringify(rest))
        console.log(rest?.shippingOptions)
        console.log(
          rest?.shippingOptions?.map(option => {
            console.log(option.shippingServices)
          }),
          'policy.policy_details'
        )
        let record = null
        record = await modelName.findOne({
          where: {
            userId: policy?.userId,
            accountName: policy?.accountName,
            geoSite: policy?.geoSite,
            copied_policy_id: policy?.copied_policy_id
          }
        })
        try {
          const policyData =
            policyType === 'shipping'
              ? await eBay.sell.account.createFulfillmentPolicy(rest)
              : policyType === 'payment'
                ? await eBay.sell.account.createPaymentPolicy(rest)
                : await eBay.sell.account.createReturnPolicy(rest)
          console.log(policyData, 'policyData')
          if (record) {
            await record.update({
              status: 'live',
              [fieldName]: policyData[fieldName]
            })
            successResponses.push({ policy, response: policyData })
          }
        } catch (error) {
          console.log(error)
          if (record) {
            const errorDetails = {
              message: `Failed to copy. Status updated to 'failed' for policy ID: ${policy.copied_policy_id}`,
              error: error.message,
              details: error.meta?.longMessage
            }
            await record.update({
              status: 'failed',
              error: JSON.stringify(errorDetails)
            })
            errorResponses.push(errorDetails)
          }
        }
      } catch (error) {
        errorResponses.push({
          message: `Error while copying on eBay`,
          error
        })
      }
    })
  )
}

// Copy seller profiles from DB
exports.CopySellerProfiles = async (req, res) => {
  try {
    const {
      userId,
      sourceAccount,
      destinationAccount,
      policyIds,
      marketplaceId,
      policyType,
      sourceGeoSite,
      destinationGeoSite
    } = req.body
    const destinationToken = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: destinationAccount
      }
    })
    const sourceToken = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: sourceAccount
      }
    })

    if (!destinationToken) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: `token not exists for the the account : ${destinationAccount}`
      })
    }
    if (!sourceToken) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: `token not exists for the the account : ${!sourceAccount}`
      })
    }

    const marketPlace = await Marketplace.findOne({
      where: { id: marketplaceId }
    })

    if (!marketPlace) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: `marketplace not exists for the id : ${marketplaceId}`
      })
    }
    if (marketPlace.url?.includes('ebay')) {
      const eBay = await getEbayInstance(
        userId,
        destinationAccount,
        marketplaceId,
        destinationToken
      )
      const successResponses = []
      const errorResponses = []

      const policyConfig = {
        shipping: {
          modelName: shippingPoliciesModel,
          fieldName: 'fulfillmentPolicyId'
        },
        payment: {
          modelName: paymentPolicyModel,
          fieldName: 'paymentPolicyId'
        },
        return: {
          modelName: returnPolicyModel,
          fieldName: 'returnPolicyId'
        }
      }

      if (policyConfig[policyType]) {
        await copyPolicies({
          eBay,
          userId,
          sourceAccount,
          destinationAccount,
          marketplaceId,
          sourceToken,
          policyIds,
          sourceGeoSite,
          destinationGeoSite,
          modelName: policyConfig[policyType].modelName,
          fieldName: policyConfig[policyType].fieldName,
          policyType,
          successResponses,
          errorResponses,
          res
        })
      } else {
        return res.status(400).json({
          success: false,
          status: 400,
          message: `Policy type ${policyType} is not supported`
        })
      }
      if (errorResponses?.length) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: 'Error copying policies'
        })
      }
      console.log('Successfully copied: ', successResponses.length)
      console.log('Errors: ', errorResponses)
      return res.status(200).json({
        success: true,
        status: 200,
        message: `Successfully copied: ${successResponses.length}`
      })
    }
  } catch (error) {
    console.log('Something went wrong: ', error)
    res.status(500).json({
      success: false,
      status: 500,
      message: 'Internal server error.',
      error: error.message
    })
  }
}

// Get all policies
exports.GetAllPolicies = async (req, res) => {
  try {
    const {
      policyType,
      userId,
      accountName,
      statusFilter,
      policyId,
      limit = 10,
      page = 1
    } = req.query
    if (
      policyType !== 'shipping' &&
      policyType !== 'payment' &&
      policyType !== 'return'
    )
      return res.status(400).send({ error: 'Invalid policy type' })

    // Determine the correct policy ID field name based on policyType
    let policyIdFieldName
    if (policyType === 'shipping') {
      policyIdFieldName = 'fulfillmentPolicyId'
    } else if (policyType === 'payment') {
      policyIdFieldName = 'paymentPolicyId'
    } else if (policyType === 'return') {
      policyIdFieldName = 'returnPolicyId'
    }

    const whereClause = {
      userId,
      ...(accountName && { accountName }),
      ...(statusFilter && statusFilter !== 'all' && { status: statusFilter }),
      ...(policyId &&
        policyId?.length >= 3 && {
        [policyIdFieldName]: { [Sequelize.Op.like]: `${policyId}%` }
      })
    }
    const limitInt = parseInt(limit, 10)
    const pageInt = parseInt(page, 10)
    const offset = (pageInt - 1) * limitInt

    const options = { where: whereClause, limit: limitInt, offset }

    let model
    if (policyType === 'shipping') {
      model = shippingPoliciesModel
    } else if (policyType === 'payment') {
      model = paymentPolicyModel
    } else if (policyType === 'return') {
      model = returnPolicyModel
    }

    // Query to get the data with limit and offset
    const policiesData = await model.findAll(options)

    // Query to get total count without limit and offset
    const totalCount = await model.count({ where: whereClause })

    const totalPages = Math.ceil(totalCount / limitInt)

    res.json({
      count: totalCount,
      pages: totalPages,
      currentPage: pageInt,
      policies: policiesData
    })
  } catch (error) {
    console.log('Error while fetching policies: ', error)
    res.status(500).send({
      error: 'An error occurred while fetching policies',
      message: error.message
    })
  }
}
exports.GetPoliciesCount = async (req, res) => {
  try {
    const { userId, accountName } = req.query;
    const statuses = ['all', 'live', 'ready to list', 'failed'];

    if (!userId) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: 'User ID is required',
      });
    }

    let baseQuery = { userId, ...(accountName && { accountName }) };
    const shippingCount = await shippingPoliciesModel.count({ where: baseQuery });
    const paymentCount = await paymentPolicyModel.count({ where: baseQuery });
    const returnCount = await returnPolicyModel.count({ where: baseQuery });

    let countData = {
      shipping: shippingCount,
      payment: paymentCount,
      return: returnCount,
    };

    await Promise.all(
      statuses.map(async (sts) => {
        // Make a fresh copy of the baseQuery for each status
        let query = { ...baseQuery };

        if (sts !== 'all') {
          query = { ...query, status: sts };
        }

        const shippingCount = await shippingPoliciesModel.count({ where: query });
        const paymentCount = await paymentPolicyModel.count({ where: query });
        const returnCount = await returnPolicyModel.count({ where: query });

        countData[sts] = shippingCount + paymentCount + returnCount;
      })
    );

    res.status(200).json({
      statusCode: 200,
      success: true,
      counts: countData,
    });
  } catch (error) {
    console.log('Error while fetching policies: ', error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'An error occurred while fetching policies',
    });
  }
};

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      'PRODUCTION',
      token.dataValues.refreshToken,
      scopes
    )

    if (JSON.parse(newToken).error) {
      token.status = 'inactive'
      await token.save()

      const nodemailer = require('nodemailer')

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password // Replace with your SMTP password
        }
      })

      const userData = await User.findOne({
        where: { id: token.dataValues.userId }
      })

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: 'aditya@mergekart.com', // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: 'Token Expired!',
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`
        }

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error)
            console.log(error)
          }
          console.log('Message sent: %s', info.messageId)
        })
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`)
      console.log(newToken.error)
      throw newToken.error
    }

    const accessToken = JSON.parse(newToken)
    eBay.OAuth2.setCredentials(accessToken.access_token)
    token.token = accessToken.access_token
    token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
    await token.save()
  } catch (error) {
    newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`)
    console.log(error)
    throw error
  }
}


const refreshTokenEtsy = async (token) => {
  try {
    let refreshToken = token.refreshToken;
    const response = await axios.post(
      "https://api.etsy.com/v3/public/oauth/token",
      {
        grant_type: "refresh_token",
        client_id: token.client_id,
        client_secret: token.client_secret,
        refresh_token: refreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Save the new token
    token.token = response.data.access_token;
    token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
    await token.save();

    console.log("Token refreshed successfully.");
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};

exports.getBrands = async (req, res) => {
  try {

    const userId = req.params.userId;

    const brandsQuery = `SELECT DISTINCT brand FROM "scratchProducts" WHERE user_id = ? AND brand IS NOT NULL AND brand != '' ORDER BY brand ASC LIMIT 100`;

    const brands = await sequelize.query(brandsQuery, {
      replacements: [
        userId
      ],
      type: Sequelize.QueryTypes.SELECT
    });

    if (!brands || brands.length === 0) {
      return res.status(200).json({
        success: false,
        status: 200,
        data: [],
        message: 'No brands found for this user'
      });
    }

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Brands fetched successfully',
      data: brands.map(brand => brand.brand)
    })

  } catch (error) {
    console.log('Error while fetching brands: ', error)
    res.status(500).json({
      success: false,
      status: 500,
      message: 'An error occurred while fetching brands',
      error: error.message
    })
  }
}