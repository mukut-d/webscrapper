const { default: axios } = require('axios')
const csku = require('../../models/csku')
const isku = require('../../models/isku')
const { v4: uuidv4 } = require('uuid')
const { STRING } = require('sequelize')
const { Op } = require('sequelize')
const qs = require('qs')
const { sequelize } = require('../../database/config')
const order = require('../../models/order')
const Tokens = require('../../models/tokens')
const Marketplace = require('../../models/marketplace')
const moment = require('moment')
const { mod } = require('mathjs')
const {apiCallLog} = require("../../helper/apiCallLog")

async function getWalmartToken (token, correlationId) {
    const { client_id, client_secret } = token?.dataValues
    const base64Credentials = Buffer.from(
      `${client_id}:${client_secret}`
    ).toString('base64')
    const tokenHeaders = {
      Authorization: `Basic ${base64Credentials}`,
      'WM_SVC.NAME': 'Walmart Marketplace Price',
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
      return tokenResponse.data.access_token
    } catch (error) {
      console.log('Error occurred while creating token:', error)
      throw new Error(`Failed to get Walmart token: ${error.message}`)
    }
  }
  
  const createHeaders = (correlationId, accessToken, serviceName) => ({
    'WM_QOS.CORRELATION_ID': correlationId,
    'WM_SEC.TIMESTAMP': Date.now().toString(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'WM_SEC.ACCESS_TOKEN': accessToken,
    'WM_SVC.NAME': serviceName
  })

exports.GetWalmartOrder = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity,
  type,
  startDate
) => {
  const orders = []
  try {
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(token, correlationId)
    console.log(correlationId , accessToken, accountName , 'token')
    const ordersHeaders = await createHeaders(correlationId, accessToken, accountName);
    let limit = 200
    let nextCursor = null
    do {
      const url = `https://marketplace.walmartapis.com/v3/orders?createdStartDate=${startDate}&limit=${limit}${
        nextCursor ? `&nextCursor=${nextCursor}` : ''
      }`
      try {
        const response = await axios.get(url, { headers: ordersHeaders })
        const { elements, meta } = response?.data?.list || {}
        if (elements?.order && elements?.order?.length) {
          orders.push(...elements?.order)
        }
        nextCursor = meta?.nextCursor || null
      } catch (error) {
        console.error(
          'Error fetching Walmart orders:',
          error.response?.data || error.message
        )
        break
      }
    } while (nextCursor)
    await pushDataWalmart(
      orders,
      marketplaceId,
      accountName,
      userId,
      addQuantity,
      type
    )
    return orders
  } catch (error) {
    console.log('error', error)
  }
}

exports.handleWalmartOrder = async (
  token,
  marketPlace,
  startDate,
  orders,
  marketplaceId,
  accountName,
  userId,
  addQuantity
) => {
  const functionName= 'handleWalmartOrder'
  try {
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(token, correlationId)
    console.log(correlationId , accessToken, accountName , 'token')
    const ordersHeaders = await createHeaders(correlationId, accessToken, accountName);
    let limit = 200
    let nextCursor = null
    do {
      const url = `https://marketplace.walmartapis.com/v3/orders?createdStartDate=${startDate}&limit=${limit}${
        nextCursor ? `&nextCursor=${nextCursor}` : ''
      }`
      try {
        const response = await axios.get(url, { headers: ordersHeaders })
        const { elements, meta } = response?.data?.list || {}
        if (elements?.order && elements?.order?.length) {
          orders.push(...elements?.order)
        }
        nextCursor = meta?.nextCursor || null
      } catch (error) {
        console.error(
          'Error fetching Walmart orders:',
          error.response?.data || error.message
        )
        break
      }
      apiCallLog("handleWalmartOrders", "/order/get-order-cron", functionName,
        {
          token:token,
          marketPlace:marketPlace,
          startDate:startDate,
          orders:orders,
          marketplaceId:marketplaceId,
          accountName:accountName,
          userId:userId,
        }
        , {}, {}, 'success');
    } while (nextCursor)
    await pushDataWalmart(
      orders,
      marketplaceId,
      accountName,
      userId,
      addQuantity,
      'firstFetch'
    )
    return orders
  } catch (err) {
    console.log('error', err)
  }
}

const syncMarketplaceQuantities = require('../../controllers/api/v1/marketplaceSync');

async function pushDataWalmart (
  orders,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  type
) {
  const functionName="pushDataWalmart"
  try {
    apiCallLog("pushDataWalmart", "/order/get-order-cron", functionName,
      {
        orders:orders,
        marketplaceId:marketplaceId,
        accountName:accountName,
        userId:userId,
        type:type      }
      , {}, {}, 'success');
    const iskuData = []
    const cskuData = []
    let response = []
    for (let i = 0; i < orders.length; i++) {
      let item = orders[i]
      let status = 'UNPAID'
      let orderPaymentStatus = 'UNPAID'
      let fulfillmentStatus = 'NOT_STARTED'

      switch (item.status) {
        case 'Created':
          status = 'pending'
          orderPaymentStatus = 'UNPAID'
          fulfillmentStatus = 'NOT_STARTED'
          break
        case 'Acknowledged':
          status = 'in_progress'
          orderPaymentStatus = 'UNPAID'
          fulfillmentStatus = 'NOT_STARTED'
          break
        case 'Shipped':
          status = 'shipped'
          orderPaymentStatus = 'PAID'
          fulfillmentStatus = 'NOT_STARTED'
          break
        case 'Delivered':
          status = 'delivered'
          orderPaymentStatus = 'PAID'
          fulfillmentStatus = 'FULLFILLED'
          break
        case 'cancelled':
          status = 'canceled'
          orderPaymentStatus = 'UNPAID'
          fulfillmentStatus = 'NOT_STARTED'
          break
        default:
          status = 'unpaid'
          orderPaymentStatus = 'UNPAID'
          fulfillmentStatus = 'NOT_STARTED'
      }

      const orderExist = await order.findOne({
        where: {
          orderId: item.purchaseOrderId.toString(),
          userId: userId,
          accountName: accountName
        }
      })
      if (!orderExist) {
        console.log('new order')
        
        apiCallLog("pushDataWalmart - order doesnot exist", "/order/get-order-cron", functionName,
          {
              orderId: item.purchaseOrderId.toString(),
              userId: userId,
              accountName: accountName
            }
          , {}, {}, 'success');
        for (let j = 0; j < item.orderLines.orderLine.length; j++) {
          let line = item.orderLines.orderLine[j]
          const cskuExist = await csku.findOne({
            where: { isku: String(line.item.sku) }
          })

          const currentQuantity = cskuExist.dataValues.quantity
              const lineQuantity = line.orderLineQuantity.amount

              
                await syncMarketplaceQuantities(
                  line.item.sku,
                  currentQuantity,
                  userId,
                  'Walmart',
                  lineQuantity
                )

          if (!cskuExist) {
            const newItem = {
              title: line.item.productName,
              sku: line.item.sku,
              price: line.charges.charge.map(id => id.chargeAmount.amount),
              quantity: line.orderLineQuantity.amount,
              fulfillment_status: line.fulfillment.fulfillmentOption,
              fulfillment_service: line.fulfillment_service || null,
              variantId: line.variant_id || null,
              brand: item.vendor || null,
              images: item.image ? [item.image.src] : [],
              description: item.note || null,
              categoryId: null,
              categoryName: null,
              currency: line.charges.charge.map(id => id.chargeAmount.currency),
              marketplaceId: marketplaceId,
              accountName: accountName,
              userId: userId
            }
            await Tokens.update(
              {
                itemsFetched: sequelize.literal(
                  `CAST("itemsFetched" AS INTEGER) + ${1}`
                )
              },
              { where: { userId: userId, accountName: accountName } }
            )

            cskuData.push({
              channelId: newItem.id || null,
              variantId: newItem.variantId || null,
              isku: newItem.sku,
              price: newItem.price,
              mrp: newItem.price,
              description: newItem.description || null,
              categoryId: newItem.categoryId || null,
              categoryName: newItem.categoryName || null,
              quantity: newItem.quantity,
              currency: newItem.currency,
              marketplaceId: marketplaceId,
              accountName: accountName,
              userId: userId,
              title: newItem.title
            })

            if (!newItem.sku) {
              iskuData.push({
                isku: newItem.id,
                costPrice: newItem.price,
                title: newItem.title,
                images: newItem.images,
                quantity: newItem.quantity,
                currency: newItem.currency,
                accountName: accountName,
                marketplaceId: marketplaceId,
                userId: userId
              })
            } else {
              const iskuExist = await isku.findOne({
                where: { isku: String(newItem.sku) }
              })
              if (iskuExist && addQuantity) {
                iskuExist.quantity += newItem.quantity

                await iskuExist.save()
              } else if (!iskuExist) {
                iskuData.push({
                  isku: newItem.sku,
                  costPrice: newItem.price,
                  title: newItem.title,
                  // images: newItem.images,
                  quantity: newItem.quantity,
                  currency: newItem.currency,
                  accountName: accountName,
                  marketplaceId: marketplaceId,
                  userId: userId
                })
              }
            }
          } else {
            try {
                const currentQuantity = cskuExist.dataValues.quantity
              const lineQuantity = line.orderLineQuantity.amount

              // Only sync if the order status indicates a confirmed purchase
              if (['in_progress', 'shipped', 'delivered'].includes(status)) {
                await syncMarketplaceQuantities(
                  line.item.sku,
                  currentQuantity,
                  userId,
                  'Walmart',
                  lineQuantity
                )
              }
              const allCskus = await csku.findAll({
                where: {
                  isku: cskuExist.isku,
                  id: {
                    [Op.ne]: cskuExist.dataValues.id
                  }
                }
              })

              cskuExist.quantity =
                cskuExist.dataValues.quantity - line.orderLineQuantity.amount
              await cskuExist.save()

              if (allCskus.length > 0 && type != 'firstFetch') {
                updateMarketplaceData(allCskus)
              }
            } catch (err) {
              console.log(err)
            }
          }
        }
        // console.log("sdfghjk", item.shippingInfo)

        response.push({
          orderId: item?.purchaseOrderId,
          creationDate: item?.orderDate,
          lastModifiedDate: item?.updated_at || null,
          orderFulfillmentStatus: fulfillmentStatus,
          orderPaymentStatus: orderPaymentStatus,
          sellerId: accountName,
          buyerUserName: item?.customerEmailId || null,
          buyerRegistrationAddress: {
            fullName: item?.shippingInfo?.postalAddress?.name,
            addressLine1:
              item?.shippingInfo?.postalAddress?.addressLine1 || null,
            city: item?.shippingInfo?.postalAddress?.city || null,
            stateOrProvince: item?.shippingInfo?.postalAddress?.city || null,
            postalCode: item?.shippingInfo?.postalAddress?.postalCode || null,
            countryCode: item?.shippingInfo?.postalAddress?.country || null,
            primaryPhone: item?.shippingInfo?.phone || null,
            email: item?.customerEmailId || null,
            customerOrderId: item?.customerOrderId
          },
          pricingSummary: {
            total_tax: item?.orderLines?.orderLine?.flatMap(line =>
              line?.charges?.charge?.map(i =>
                i?.tax && i?.tax?.taxAmount ? i?.tax?.taxAmount?.amount : 0
              )
            ),
            total: item?.orderLines?.orderLine?.flatMap(line =>
              line?.charges?.charge?.map(i => i?.chargeAmount?.amount)
            )
          },
          payments: item?.financial_status,
          fulfillmentStartInstructions: item?.orderLines?.orderLine.map(
            line => {
              return {
                fulfillmentOption: line?.fulfillment?.fulfillmentOption,
                shipMethod: line?.fulfillment?.shipMethod,
                storeId: line?.fulfillment?.storeId,
                pickUpDateTime: line?.fulfillment?.pickUpDateTime,
                pickUpBy: line?.fulfillment?.pickUpBy,
                shippingProgramType: line?.fulfillment?.shippingProgramType
              }
            }
          ),
          items: item.orderLines.orderLine.map(line => {
            return {
              lineItemId: line?.lineNumber || null,
              itemName: line?.item?.productName || null,
              sku: line?.item?.sku,
              itemCost: line?.price,
              quantity: line?.orderLineQuantity?.amount,
              unitOfMeasurement: line?.orderLineQuantity?.unitOfMeasurement,
              lineItemStatus: line?.orderLineStatuses?.orderLineStatus.map(
                status => status?.status
              ),
              trackingInfo: line?.orderLineStatuses?.orderLineStatus.map(
                track => track?.trackingInfo
              )
            }
          }),
          totalMarketplaceFee: 0,
          marketplaceId: marketplaceId,
          status: status,
          accountName: accountName,
          userId: userId,
          shippedDate: status == 'shipped' ? moment().toISOString() : null
        })
      } else {
        apiCallLog("pushDataWalmart - order exist", "/order/get-order-cron", functionName,
          {
              orderId: item.purchaseOrderId.toString(),
              userId: userId,
              accountName: accountName
            }
          , {}, {}, 'success');
        await order.update(
          {
            orderFulfillmentStatus: fulfillmentStatus,
            orderPaymentStatus: orderPaymentStatus,
            status: status
          },
          {
            where: {
              orderId: orderExist.dataValues.orderId
            }
          }
        )
      }
    }
    response = response.filter(item => item != null)
    await order.bulkCreate(response)
    await isku.bulkCreate(iskuData)
    await csku.bulkCreate(cskuData)
  } catch (error) {
    console.log(error)
    apiCallLog("pushDataWalmart", "/order/get-order-cron", functionName,
      {
        orders:orders,
        marketplaceId:marketplaceId,
        accountName:accountName,
        userId:userId,
        type:type
        }
      , {}, {}, 'error');
  }
}

async function updateMarketplaceData (cskus) {
  try {
    for (var i = 0; i < cskus.length; i++) {
      const csku = cskus[i]

      const marketplace = await Marketplace.findOne({
        where: { id: csku.dataValues.marketplaceId }
      })
      const token = await Tokens.findOne({
        where: {
          accountName: csku.dataValues.accountName,
          userId: csku.dataValues.userId,
          marketPlaceId: csku.dataValues.marketplaceId
        }
      })
      if (marketplace.dataValues.url.includes('walmart')) {
        const quantity = csku.dataValues.quantity - 1
        csku.quantity = quantity
      }
    }
  } catch (error) {
    console.log(error)
  }
}

exports.updateWalmartOrder = async (
  id,
  userId,
  marketplaceId,
  accountName,
  status,
  res,
  channelId,
  comment,
  reason
) => {
  // console.log("fghjkd", {id, userId, marketplaceId, accountName, status, res})
  try {
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName
      }
    })

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Token for this user not found.'
      })
    }

    const orderExist = await order.findOne({ where: { orderId: id } })
    console.log('ertyhnb', orderExist)

    if (!orderExist)
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Invalid Order ID'
      })

    if (orderExist.dataValues.status === status) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Cannot update order to same status.'
      })
    }
    const item = await csku.findOne({ where: { channelId: channelId } })
    if (!item) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Invalid Order ID'
      })
    }
    // console.log("fghjk", item)
    let statusMarket
    let orderPaymentStatus
    let fullfillmentStatus

    switch (status) {
      case 'paid':
        // statusMarket = "completed";
        orderPaymentStatus = 'PAID'
        fullfillmentStatus = 'FULFILLED'
        break
      case 'shipped':
        // statusMarket = "processing";
        orderPaymentStatus = 'PAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      case 'in_progress':
        // statusMarket = "on-hold";
        orderPaymentStatus = 'UNPAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      case 'pending':
        // statusMarket = "pending";
        orderPaymentStatus = 'UNPAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      case 'canceled':
        // statusMarket = "cancelled";
        orderPaymentStatus = 'UNPAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      case 'refunded':
        // statusMarket = "refunded";
        orderPaymentStatus = 'PAID'
        fullfillmentStatus = 'FULFILLED'
        break
      case 'unpaid':
        // statusMarket = "failed";
        orderPaymentStatus = 'UNPAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      case 'problematic order':
        // statusMarket = "trash";
        orderPaymentStatus = 'UNPAID'
        fullfillmentStatus = 'NOT_STARTED'
        break
      default:
        console.log('Unknown statusDb:', status)
        statusMarket = undefined
    }
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(token, correlationId)
    try {
        console.log(correlationId , accessToken, accountName , 'token')
        try {
            for (i = 0; i < order.length; i++) {
                const item = order[i]
                if (status === 'canceled') {
                    const cancelurl = `https://marketplace.walmartapis.com/v3/orders/${id}/cancel`
                    const cancelHeaders = await createHeaders(correlationId, accessToken, accountName);
                    const cancelPayload = {
                        orderCancellation: {
                            orderLines: {
                                orderLine: [
                                    {
                                        lineNumber: item.lineNumber,
                                        orderLineStatuses: {
                                            orderLineStatus: [
                                                {
                            status: 'Cancelled',
                            cancellationReason: reason,
                            statusQuantity: {
                              unitOfMeasurement:
                                item.orderLineQuantity.unitOfMeasurement,
                              amount: item.orderLineQuantity.amount
                            }
                        }
                        ]
                      }
                    }
                ]
                }
              }
            }
            
            try {
              const Response = await axios.post(cancelurl, cancelPayload, {
                headers: cancelHeaders
            })
            cancelData = Response.data.access_token
        } catch (err) {
            console.log('error', err)
            }
        } else if (status === 'refunded') {
            const refundurl = `https://marketplace.walmartapis.com/v3/orders/${id}/refund`
            const refundHeaders = await createHeaders(correlationId, accessToken, accountName);
            const refundPayload = {
              orderRefund: {
                purchaseOrderId: id,
                customerOrderId: data?.customerOrderId,
                customerEmailId: data?.customerEmailId,
                orderDate: Date.now(),
                shippingInfo: {
                  phone: data?.shippingInfo?.phone,
                  estimatedDeliveryDate:
                    data?.shippingInfo?.estimatedDeliveryDate,
                  estimatedShipDate: data?.shippingInfo?.estimatedShipDate,
                  methodCode: data?.shippingInfo?.methodCode,
                  postalAddress: {
                    name: data?.shippingInfo?.postalAddress?.name,
                    address1: data?.shippingInfo?.postalAddress?.address1,
                    city: data?.shippingInfo?.postalAddress?.city,
                    state: data?.shippingInfo?.postalAddress?.state,
                    postalCode: data?.shippingInfo?.postalAddress?.postalCode,
                    country: data?.shippingInfo?.postalAddress?.country,
                    addressType: data?.shippingInfo?.postalAddress?.addressType
                  }
                },
                orderLines: {
                  orderLine: [
                    {
                      lineNumber: item.id,
                      item: {
                        productName: item.item.productName,
                        sku: item.item.sku
                      },
                      isFullRefund: false,
                      refunds: {
                        refund: [
                          {
                            refundComments: comment,
                            refundCharges: {
                              refundCharge: [
                                {
                                  refundReason: reason,
                                  charge: {
                                    chargeType: additional?.chargeType,
                                    chargeName: additional?.chargeName,
                                    chargeAmount: {
                                      currency:
                                        additional?.chargeAmount?.currency,
                                      amount: additional?.chargeAmount?.amount
                                    },

                                    tax: {
                                      taxName: additional?.tax?.taxName || null,
                                      taxAmount: {
                                        currency:
                                          additional?.tax?.taxAmount
                                            ?.currency || null,
                                        amount:
                                          additional?.tax?.taxAmount?.amount ||
                                          null
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            }

            try {
              const response = await axios.post(refundurl, refundPayload, {
                headers: refundHeaders
              })
              console.log('Order lines cancelled successfully:', cancelledOrder)
            } catch (error) {
              console.error(
                'Error cancelling order lines:',
                error.response.data.errors.error
              )
              throw error
            }
          } else if (status === 'in_progress') {
            const url = `https://marketplace.walmartapis.com/v3/orders/${id}/shipping`
            const ordersHeaders = await createHeaders(correlationId, accessToken, accountName);
            const shippingPayload = {
              orderShipment: {
                orderLines: {
                  orderLine: [
                    {
                      lineNumber: item?.lineNumber,
                      intentToCancelOverride: false,
                      sellerOrderId: '92344',
                      orderLineStatuses: {
                        orderLineStatus: [
                          {
                            status: 'Shipped',
                            statusQuantity: {
                              unitOfMeasurement:
                                item?.orderLineQuantity.unitOfMeasurement,
                              amount: item?.orderLineQuantity.amount
                            },
                            trackingInfo: {
                              shipDateTime: Date.now(),
                              carrierName: {
                                carrier: 'UPS'
                              },
                              methodCode: 'Standard',
                              trackingNumber: '22344'
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            }
            try {
              const response = await axios.post(url, shippingPayload, {
                headers: ordersHeaders
              })
              const cancelledOrder = response.data.list.elements.order
              console.log('Order lines cancelled successfully:', cancelledOrder)
            } catch (error) {
              console.error(
                'Error cancelling order lines:',
                error.response.data.errors.error
              )
              throw error
            }
          } else if (status === 'Acknowledged') {
            const acknowledgeurl = `https://marketplace.walmartapis.com/v3/orders/${id}/acknowledge`
            const acknowledgeHeaders = await createHeaders(correlationId, accessToken, accountName);
            const acknowledgePayload = {
              order: {
                purchaseOrderId: id,
                customerOrderId: data?.customerOrderId,
                customerEmailId: data?.customerEmailId,
                orderDate: Date.now(),
                shippingInfo: {
                  phone: data?.shippingInfo?.phone,
                  estimatedDeliveryDate:
                    data?.shippingInfo?.estimatedDeliveryDate,
                  estimatedShipDate: data?.shippingInfo?.estimatedShipDate,
                  methodCode: data?.shippingInfo?.methodCode,
                  postalAddress: {
                    name: data?.shippingInfo?.postalAddress?.name,
                    address1: data?.shippingInfo?.postalAddress?.address1,
                    city: data?.shippingInfo?.postalAddress?.city,
                    state: data?.shippingInfo?.postalAddress?.state,
                    postalCode: data?.shippingInfo?.postalAddress?.postalCode,
                    country: data?.shippingInfo?.postalAddress?.country,
                    addressType: data?.shippingInfo?.postalAddress?.addressType
                  }
                },
                orderLines: {
                  orderLine: [
                    {
                      lineNumber: item.id,
                      item: {
                        productName: item.item.productName,
                        sku: item.item.sku
                      },
                      charges: {
                        charge: [
                          {
                            chargeType: item.charges.charge.map(
                              id => id.chargeType
                            ),
                            chargeName: item.charges.charge.map(
                              id => id.chargeName
                            ),
                            chargeAmount: {
                              currency: additional?.chargeAmount?.currency,
                              amount: additional?.chargeAmount?.amount
                            }
                          }
                        ]

                      }
                    }
                  ]
                }
              }
            }

            try {
              const response = await axios.post(
                acknowledgeurl,
                acknowledgePayload,
                { headers: acknowledgeHeaders }
              )
              console.log('Order lines cancelled successfully:', response.data)
            } catch (error) {
              console.error(
                'Error cancelling order lines:',
                error.response.data.errors.error
              )
              throw error
            }
          }
        }
      } catch (error) {
        console.error('Error getting order:', error.response.data.errors.error)
        throw error
      }
      await orderExist.update(
        {
          status: status,
          orderFulfillmentStatus: fullfillmentStatus,
          orderPaymentStatus: orderPaymentStatus
        },
        { where: { orderId: id } }
      )

      return res.status(200).json({
        success: true,
        status: 200,
        message: 'Status updated successfully'
      })
    } catch (err) {
      console.log(err)
      return res.status(400).json({
        success: false,
        status: 400,
        message: err.message
      })
    }
  } catch (err) {
    console.log(err)
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.getWalmartDeliveredOrders = async (token, accountName, userId) => {
  try {
    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`
    const headers = {
      'X-Shopify-Access-Token': token.dataValues.token,
      'Content-Type': 'application/json'
    }

    const orderData = await order.findAll({
      where: {
        userId: userId,
        accountName: accountName,
        status: 'shipped',
        shippedDate: { [Op.not]: null }
      }
    })

    const deliveredOrders = []

    await Promise.all(
      orderData.map(async orders => {
        const shippedDate = moment(orders.dataValues.shippedDate)
        const today = moment()

        if (today.diff(shippedDate, 'days') >= 10) {
          const response = await axios.get(shopifyUrl, {
            headers,
            params: { ids: orders.dataValues.orderId }
          })

          const shopifyOrder = response.data.orders[0]

          if (shopifyOrder && shopifyOrder.fulfillment_status === 'fulfilled') {
            await order.update(
              {
                status: 'delivered',
                deliveryDate:
                  shopifyOrder.fulfillments[0]?.shipment_status?.delivered_at ||
                  shopifyOrder.updated_at
              },
              {
                where: {
                  orderId: shopifyOrder.id.toString()
                }
              }
            )
            deliveredOrders.push(shopifyOrder)
          }
        }
      })
    )

    return deliveredOrders
  } catch (err) {
    console.log(err)
    return []
  }
}

exports.fetchWalmartCancelRequests = async (
  token,
  returnDate,
  startDate,
  accountName
) => {
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`
  const headers = {
    'X-Shopify-Access-Token': token.dataValues.token,
    'Content-Type': 'application/json'
  }

  const response = await axios.get(shopifyUrl, {
    headers,
    params: {
      status: 'any',
      created_at_min: returnDate,
      created_at_max: startDate
    }
  })

  const orders = response.data.orders

  let cancels = orders.filter(order => order.cancelled_at !== null)

  return cancels.map(order => ({
    orderId: order.id,
    status: 'canceled',
    cancelId: order.id // Assuming order ID is used as cancel ID in this context
  }))
}

exports.fetchWalmartReturns = async (token, returnDate, accountName) => {
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`
  const headers = {
    'X-Shopify-Access-Token': token.dataValues.token,
    'Content-Type': 'application/json'
  }

  const response = await axios.get(shopifyUrl, {
    headers,
    params: {
      status: 'any',
      created_at_min: returnDate
    }
  })

  const orders = response.data.orders

  let returns = orders.filter(order => order.financial_status === 'returned')

  return returns.map(order => ({
    orderId: order.id,
    status: 'return_complete',
    returnId: order.id // Assuming order ID is used as return ID in this context
  }))
}