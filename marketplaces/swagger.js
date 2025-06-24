exports.swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Your API",
      description: "Description of your API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "https://marketplaces.sellerpundit.com",

      },
      {
        url: "http://localhost:5001",

      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
          },
        },

        SuccessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
          },
        },

        SuccessOrderResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  orderId: { type: "string" },
                  creationDate: { type: "string", format: "date-time" },
                  lastModifiedDate: { type: "string", format: "date-time" },
                  orderFulfillmentStatus: { type: "string" },
                  orderPaymentStatus: { type: "string" },
                  sellerId: { type: "string" },
                  buyerUserName: { type: "string" },
                  buyerRegistrationAddress: {
                    type: "object",
                    properties: {
                      city: { type: "string" },
                      fullName: { type: "string" },
                      postalCode: { type: "string" },
                      countryCode: { type: "string" },
                      addressLine1: { type: "string" },
                      primaryPhone: { type: "string" },
                      stateOrProvince: { type: "string" },
                    },
                  },
                  pricingSummary: {
                    type: "object",
                    properties: {
                      total: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          currency: { type: "string" },
                        },
                      },
                      deliveryCost: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          currency: { type: "string" },
                        },
                      },
                      priceSubtotal: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          currency: { type: "string" },
                        },
                      },
                    },
                  },
                  payments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        amount: {
                          type: "object",
                          properties: {
                            value: { type: "string" },
                            currency: { type: "string" },
                          },
                        },
                        paymentDate: { type: "string", format: "date-time" },
                        paymentHolds: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              holdState: { type: "string" },
                              holdAmount: {
                                type: "object",
                                properties: {
                                  value: { type: "string" },
                                  currency: { type: "string" },
                                },
                              },
                              holdReason: { type: "string" },
                              releaseDate: {
                                type: "string",
                                format: "date-time",
                              },
                              expectedReleaseDate: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                        },
                        paymentMethod: { type: "string" },
                        paymentStatus: { type: "string" },
                        paymentReferenceId: { type: "string" },
                      },
                    },
                  },
                  shippedDate: { type: "string", format: "date-time" },
                  fulfillmentStartInstructions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        shippingStep: {
                          type: "object",
                          properties: {
                            fullName: { type: "string" },
                            primaryPhone: {
                              type: "object",
                              properties: {
                                phoneNumber: { type: "string" },
                              },
                            },
                            contactAddress: {
                              type: "object",
                              properties: {
                                city: { type: "string" },
                                postalCode: { type: "string" },
                                countryCode: { type: "string" },
                                addressLine1: { type: "string" },
                                stateOrProvince: { type: "string" },
                              },
                            },
                          },
                        },
                        maxEstimatedDeliveryDate: {
                          type: "string",
                          format: "date-time",
                        },
                        minEstimatedDeliveryDate: {
                          type: "string",
                          format: "date-time",
                        },
                      },
                    },
                  },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        itemId: { type: "string" },
                        itemCost: {
                          type: "object",
                          properties: {
                            value: { type: "string" },
                            currency: { type: "string" },
                          },
                        },
                        quantity: { type: "integer" },
                        lineItemId: { type: "string" },
                        appliedPromotions: {
                          type: "array",
                          items: { type: "object" },
                        },
                      },
                    },
                  },
                  totalMarketplaceFee: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                      currency: { type: "string" },
                    },
                  },
                  status: { type: "string" },
                  marketplaceId: { type: "integer" },
                  returnId: { type: "string", nullable: true },
                  cancelId: { type: "string", nullable: true },
                  fulfillmentId: { type: "string", nullable: true },
                  accountName: { type: "string" },
                  userId: { type: "string" },
                  deliveryDate: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },

        SuccessInventoryResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  isku: { type: "string" },
                  costPrice: { type: "string" },
                  currency: { type: "string" },
                  weight: { type: "string", nullable: true },
                  height: { type: "string", nullable: true },
                  width: { type: "string", nullable: true },
                  depth: { type: "string", nullable: true },
                  quantity: { type: "string" },
                  images: {
                    type: "array",
                    items: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  title: { type: "string" },
                  marketplaceId: { type: "integer" },
                  accountName: { type: "string" },
                  warehouseLocation: { type: "string", nullable: true },
                  status: { type: "string" },
                  lowQtyThresh: { type: "integer" },
                  isSellerFulfilled: { type: "boolean" },
                  userId: { type: "string" },
                  created_at: { type: "string", format: "date-time" },
                  updated_at: { type: "string", format: "date-time" },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },

        SuccessCatalogueResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  images: {
                    type: "array",
                    items: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  channelId: { type: "string" },
                  isku: { type: "string" },
                  status: { type: "string" },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                  title: { type: "string" },
                  quantity: { type: "string" },
                  currency: { type: "string" },
                  price: { type: "string" },
                  mrp: { type: "string" },
                  categoryId: { type: "string" },
                  categoryName: { type: "string" },
                  marketplaceId: { type: "string" },
                  collections: { type: "string" },
                },
              },
            },
          },
        },

        SuccessTokenResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            status: {
              type: "integer",
            },
            message: {
              type: "string",
            },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  userId: { type: "string" },
                  accountName: { type: "string" },
                  marketPlaceId: { type: "string" },
                  token: { type: "string" },
                  expiresIn: { type: "string" },
                  accessToken: { type: "string" },
                  refreshToken: { type: "string" },
                  refreshTokenExpiresIn: { type: "string" },
                  isDataFetched: { type: "string" },
                  fetchDate: { type: "string" },
                  itemsFetched: { type: "string" },
                  ordersFetched: { type: "string" },
                  status: { type: "string" },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                  user: { type: "object" },
                  marketplace: { type: "object" },
                },
              },
            },
          },
        },
        AuthRequest: {
          type: "object",
          properties: {
            email: {
              type: "string",
              example: "test1@gmail.com",
            },
            password: {
              type: "string",
              example: "test1@123",
            },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            isLoggedIn: {
              type: "boolean",
              example: true,
            },
            user: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  example: "6655aafd-65cd-4e37-9227-a3ccb7412f3f",
                },
                email: {
                  type: "string",
                  example: "test1@gmail.com",
                },
                jwt_token: {
                  type: "string",
                  example:
                    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2NTVhYWZkLTY1Y2QtNGUzNy05MjI3LWEzY2NiNzQxMmYzZiIsImVtYWlsIjoidGVzdDFAZ21haWwuY29tIiwiaWF0IjoxNzE5NTU2NDg1LCJleHAiOjE3MTk1NjAwODV9.6kswvRT8724OP9A2qJnbgDS2buRrKt_olA2Oe-VRljM",
                },
                createdAt: {
                  type: "string",
                  example: "2024-06-06T08:33:03.834Z",
                },
                updatedAt: {
                  type: "string",
                  example: "2024-06-28T06:34:45.193Z",
                },
                accountExist: {
                  type: "boolean",
                  example: true,
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./swagger.js"],
};

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: User Login
 *     description: Authenticate user and get a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRequest'
 *     responses:
 *       '200':
 *         description: User authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       '400':
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /order/get-all-orders:
 *   get:
 *     summary: Get All Orders
 *     description: Retrieve all orders with pagination and filters.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *         example: 10
 *       - in: query
 *         name: marketplaceId
 *         schema:
 *           type: integer
 *         description: Marketplace ID
 *         example: 10
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Account name
 *         example: "dee29e-1e"
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *         example: "6655aafd-65cd-4e37-9227-a3ccb7412f3f"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: true
 *         description: Order status
 *         example: "all"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: search by orderId  or buyerUserName
 *         example: "21-11966-28529"
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *         required: false
 *         description: Sort order or fields. Enum (buyerUserName,sellerId,lastModifiedDate,orderId )
 *         example: "degagnem613"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         enum:
 *             - asc
 *             - desc
 *         required: false
 *         description: Sort order details in asc or desc order. Enum (asc, desc)
 *         example: "asc"
 *     responses:
 *       '200':
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessOrderResponse'
 *       '400':
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /catalogue/get-all-inventory:
 *   get:
 *     summary: Get All inventory
 *     description: Retrieve all inventory with pagination and filters.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *         example: 10
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *         example: "6655aafd-65cd-4e37-9227-a3ccb7412f3f"
 *       - in: query
 *         name: marketplaceId
 *         schema:
 *           type: integer
 *         description: Marketplace ID
 *         example: 10
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Account name
 *         example: "dee29e-1e"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: search by isku or quantity or title
 *         example: "21-11966-28529"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: true
 *         description: Inventory status. Enum (all, available,low on stock, out of stock, deleted)
 *         example: "all"
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *         required: false
 *         description: Sort order or fields. Enum (title,isku,quantity,lowQtyThresh,warehouseLocation,updatedAt )
 *         example: "degagnem613"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         enum:
 *             - asc
 *             - desc
 *         required: false
 *         description: Sort order details in asc or desc order. Enum (asc, desc)
 *         example: "asc"
 *     responses:
 *       '200':
 *         description: Inventory retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessInventoryResponse'
 *       '400':
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /catalogue/get-all-catalogue:
 *   get:
 *     summary: Get All catalogue
 *     description: Retrieve all catalogue with pagination and filters.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *         example: 10
 *       - in: query
 *         name: marketplaceId
 *         schema:
 *           type: integer
 *         description: Marketplace ID
 *         example: 10
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Account name
 *         example: "dee29e-1e"
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *         example: "6655aafd-65cd-4e37-9227-a3ccb7412f3f"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: true
 *         description: Order status. Enum (all, live, under review, ready to list, draft, group product, failed, deleted, completed)
 *         example: "all"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: search by channelId, isku, quantity, title
 *         example: "ROYAL ENFIELD"
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *         enum:
 *             - title
 *             - channelId
 *             - isku
 *         required: false
 *         description: Sort order or fields. Enum (title,channelId,isku )
 *         example: "title"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         enum:
 *             - asc
 *             - desc
 *         required: false
 *         description: Sort product in asc or desc order. Enum (asc, desc)
 *         example: "asc"
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *         description: Site ID
 *         example: 10
 *     responses:
 *       '200':
 *         description: Catalogue retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessCatalogueResponse'
 *       '400':
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /token/get-all-tokens:
 *   get:
 *     summary: Get all user token details
 *     description: Retrieve all catalogue with pagination and filters.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *         example: "6655aafd-65cd-4e37-9227-a3ccb7412f3f"
 *     responses:
 *       '200':
 *         description: All Token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessTokenResponse'
 *       '400':
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */


/**
 * @swagger
 * /order/update/status:
 *   put:
 *     summary: Update Order Status
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 12915
 *               status:
 *                 type: string
 *                 example: delivered
 *               accountName:
 *                 type: string
 *                 example: dee29e-1e
 *               marketplaceId:
 *                 type: string
 *                 example: 10
 *               userId:
 *                 type: string
 *                 example: 6655aafd-65cd-4e37-9227-a3ccb7412f3f
 *               channelId:
 *                 type: string
 *                 example: 123645879
 *               comment:
 *                 type: string
 *                 example: testing
 *               reason:
 *                 type: string
 *                 example: testing
 *     responses:
 *       '200':
 *         description: Order Status Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * @swagger
 * /catalogue/update/csku/{id}:
 *   put:
 *     summary: Update Catalogue
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               marketPlaceId:
 *                 type: string
 *               siteId:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               quantityLimitPerBuyer:
 *                 type: integer
 *               price:
 *                 type: number
 *               currency:
 *                 type: string
 *               mrp:
 *                 type: string
 *               isku:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               channelId:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               accountName:
 *                 type: string
 *               merchantLocation:
 *                 type: string
 *               policies:
 *                 type: object
 *                 properties:
 *                   paymentPolicies:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                   returnPolicies:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                   shippingPolicies:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *               product:
 *                 type: object
 *                 properties:
 *                   dimensions:
 *                     type: object
 *                     properties:
 *                       height:
 *                         type: integer
 *                       length:
 *                         type: integer
 *                       width:
 *                         type: integer
 *                       unit:
 *                         type: string
 *                   weight:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: integer
 *                       unit:
 *                         type: string
 *                   packageType:
 *                     type: string
 *               categoryAspects:
 *                 type: object
 *                 properties:
 *                   category:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                   aspects:
 *                     type: object
 *     responses:
 *       '200':
 *         description: Catalogue Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /catalogue/create/isku:
 *   post:
 *     summary: Create Individual ISKU
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marketplaceId:
 *                 type: string
 *               accountName:
 *                 type: string
 *               userId:
 *                 type: string
 *               isku: 
 *                 type: string
 *               costPrice:
 *                 type: number
 *               currency:
 *                 type: string
 *               weight:
 *                 type: number
 *               height:
 *                 type: number
 *               width:
 *                 type: number
 *               depth:
 *                 type: number
 *               title:
 *                 type: string
 *               warehouseLocation:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               quantity:
 *                 type: integer
 *     responses:
 *       '200':
 *         description: ISKU successfully created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /catalogue/update/isku/{iskuNo}:
 *   put:
 *     summary: Update Inventory Item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: iskuNo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               isSellerFulfilled:
 *                 type: boolean
 *               title:
 *                 type: string
 *               mrp:
 *                 type: string
 *                 format: float
 *               currency:
 *                 type: string
 *               costPrice:
 *                 type: number
 *                 format: float
 *               quantity:
 *                 type: integer
 *               warehouseLocation:
 *                 type: string
 *               lowQtyThresh:
 *                 type: integer
 *               height:
 *                 type: number
 *                 format: float
 *               width:
 *                 type: number
 *                 format: float
 *               depth:
 *                 type: number
 *                 format: float
 *               weight:
 *                 type: number
 *                 format: float
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       '200':
 *         description: Inventory Item Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /inbound/create/inbound:
 *   post:
 *     summary: Add Inbound
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inboundData:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     isku:
 *                       type: string
 *                     goodQty:
 *                       type: integer
 *                     badQty:
 *                       type: integer
 *                     costPrice:
 *                       type: string
 *     responses:
 *       '200':
 *         description: Inbound Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 Inbound_id:
 *                   type: string
 *                 status:
 *                   type: integer
 *                 message:
 *                   type: string
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /inbound/update/inbound/{inboundId}:
 *   put:
 *     summary: Update Inbound
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inboundId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isku:
 *                 type: string
 *               goodQty:
 *                 type: integer
 *               badQty:
 *                 type: integer
 *     responses:
 *       '200':
 *         description: Inbound Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
