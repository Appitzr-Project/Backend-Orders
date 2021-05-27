import { Response, NextFunction } from "express";
import { body, validationResult } from 'express-validator';
import { orders, ordersModel, userProfileModel, productsModel, venueProfileModel, products } from "@appitzr-project/db-model";
import { RequestAuthenticated, userDetail } from "@base-pojokan/auth-aws-cognito";
import * as AWS from 'aws-sdk';
import { validationMessage, trans } from '@base-pojokan/express-validate-message';
import { v4 as uuidv4 } from 'uuid';
import { venueCleanup } from "../utils";

// declare database dynamodb
const ddb = new AWS.DynamoDB.DocumentClient({ endpoint: process.env.DYNAMODB_LOCAL, convertEmptyValues: true });

export const cartStoreValidate = [
    body('venueId')
        .notEmpty()
        .withMessage(trans('venueId', validationMessage.notEmpty))
        .isUUID('4')
        .withMessage(trans('venueId', validationMessage.isUUID)),
    body('productId')
        .notEmpty()
        .withMessage(trans('productId', validationMessage.notEmpty))
        .isUUID('4')
        .withMessage(trans('productId', validationMessage.isUUID)),
];

export const cartDeleteValidate = [
    body('venueId')
        .optional()
        .isUUID('4')
        .withMessage(trans('venueId', validationMessage.isUUID)),
    body('productId')
        .optional()
        .isUUID('4')
        .withMessage(trans('productId', validationMessage.isUUID)),
]

export const cartStore = async (
    req: RequestAuthenticated,
    res: Response,
    next: NextFunction
) => {
    try {
        // express validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                code: 400,
                message: 'Error, validation failed please check again.!',
                errors: errors.array()
            });
        }

        // get detail input
        const { venueId, productId } = req.body;

        // get user login
        const user = userDetail(req);

        // get user detail
        const userQuery: AWS.DynamoDB.DocumentClient.GetItemInput = {
            TableName: userProfileModel.TableName,
            Key: {
                cognitoId: user?.sub,
                email: user?.email
            }
        }
        const userData = await ddb.get(userQuery).promise();

        // if user profile detail not found, return error
        if (!userData.Item) {
            return next(new Error('User Data Not Found.!'));
        }

        // get venue detail
        const venueQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
            TableName: venueProfileModel.TableName,
            IndexName: 'idIndex',
            KeyConditionExpression: '#id = :id',
            ExpressionAttributeNames: {
                '#id': 'id'
            },
            ExpressionAttributeValues: {
                ':id': venueId
            },
            Limit: 1
        }
        const venueData = await ddb.query(venueQuery).promise();

        // if venue not found, return error
        if (venueData.Count == 0) {
            next(new Error('Venue Not Found.!'));
        }

        // get product by id
        const productQuery: AWS.DynamoDB.DocumentClient.GetItemInput = {
            TableName: productsModel.TableName,
            Key: {
                id: productId,
                venueId: venueId
            },
            ConsistentRead: true
        }
        const productData = await ddb.get(productQuery).promise();

        // return error if product not found
        if (!productData.Item) {
            next(new Error('Product Not Found.!'));
        }

        // return error if product not active
        if (!productData.Item.isActive) {
            next(new Error('Product Out Of Stock or InActive.!'))
        }

        // find if user has cart or not
        const cartQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
            TableName: ordersModel.TableName,
            IndexName: 'userIdIndex',
            KeyConditionExpression: '#uId = :uId',
            FilterExpression: '#os = :os',
            ExpressionAttributeNames: {
                '#uId': 'userId',
                '#os': 'orderStatus'
            },
            ExpressionAttributeValues: {
                ':uId': userData?.Item.id,
                ':os': 'cart'
            },
            Limit: 1
        }
        const cartData = await ddb.query(cartQuery).promise();

        // if cart found
        if (cartData && cartData.Count !== 0) {
            // check if venueId is same or not
            // if same, update table product
            // if not same, delete all cart before, and create new one
            if (cartData?.Items[0].venueId == venueId) {
                const oldDataOrder = cartData?.Items[0];
                let oldDataProductOrder = oldDataOrder.products;
                const newDataProduct = productData?.Item;

                // search if product already exist or not
                // if exist, then skip
                // if not, add object product to array
                oldDataProductOrder.forEach((val, index) => {
                    if (val.id !== newDataProduct.id) {
                        oldDataProductOrder.push(newDataProduct);
                    }
                });

                // calculate total price
                const newPriceTotal: number = oldDataProductOrder.reduce((total, val) => { return total + val.price }, 0);

                // if price still 0, return error
                if (newPriceTotal == 0) {
                    next(new Error('Price Total is 0'));
                }

                // create query for update new data
                const orderDataUpdateQuery: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
                    TableName: ordersModel.TableName,
                    Key: {
                        id: oldDataOrder.id,
                        userId: userData?.Item.id
                    },
                    UpdateExpression: `
                        SET
                            #pr = :pr,
                            #tr = :tr,
                            #ua = :ua
                    `,
                    ExpressionAttributeNames: {
                        '#pr': 'products',
                        '#tr': 'totalPrice',
                        '#ua': 'updatedAt'
                    },
                    ExpressionAttributeValues: {
                        ':pr': oldDataProductOrder,
                        ':tr': newPriceTotal,
                        ':ua': new Date().toISOString()
                    },
                    ReturnValues: 'ALL_NEW'
                }

                // update data on db
                const orderUpdate = await ddb.update(orderDataUpdateQuery).promise();

                // return update data
                return res.status(200).json({
                    code: 200,
                    message: 'success',
                    data: {
                        id: orderUpdate?.Attributes.id,
                        userId: orderUpdate?.Attributes.userId,
                        venueId: orderUpdate?.Attributes.venueId,
                        products: orderUpdate?.Attributes.products,
                        totalPrice: orderUpdate?.Attributes.totalPrice,
                        orderStatus: orderUpdate?.Attributes.orderStatus,
                        createdAt: orderUpdate?.Attributes.createdAt,
                        updatedAt: orderUpdate?.Attributes.updatedAt,
                        venue: venueCleanup(venueData?.Items[0])
                    }
                });
            } else {

                // delete old data order
                const cardQueryDeletebyUserId: AWS.DynamoDB.DocumentClient.DeleteItemInput = {
                    TableName: ordersModel.TableName,
                    Key: {
                        id: cartData?.Items[0].id,
                        userId: userData?.Item.id
                    }
                }

                await ddb.delete(cardQueryDeletebyUserId).promise();
            }
        }

        // merge object product to array products
        const productDataArr = [];
        productDataArr.push(productData.Item);

        // create new object order
        const orderInputNew: orders = {
            id: uuidv4(),
            userId: userData?.Item.id,
            userEmail: userData?.Item.email,
            venueId: venueData?.Items[0].id,
            venueEmail: venueData?.Items[0].venueEmail,
            products: productDataArr,
            totalPrice: productData?.Item.price,
            orderStatus: 'cart',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        // create query save data cart
        const cartNewQuery: AWS.DynamoDB.DocumentClient.PutItemInput = {
            TableName: ordersModel.TableName,
            Item: orderInputNew,
        }
        // save to db
        await ddb.put(cartNewQuery).promise();

        // return response
        return res.json({
            code: 200,
            message: "success",
            data: {
                id: orderInputNew.id,
                userId: orderInputNew.userId,
                venueId: orderInputNew.venueId,
                products: orderInputNew.products,
                totalPrice: orderInputNew.totalPrice,
                orderStatus: orderInputNew.orderStatus,
                createdAt: orderInputNew.createdAt,
                updatedAt: orderInputNew.updatedAt,
                venue: venueCleanup(venueData?.Items[0])
            }
        });
    } catch (e) {
        next(e);
    }
};

export const cartShow = async (
    req: RequestAuthenticated,
    res: Response,
    next: NextFunction
) => {
    try {
        // get user login
        const user = userDetail(req);

        // get user detail
        const userQuery: AWS.DynamoDB.DocumentClient.GetItemInput = {
            TableName: userProfileModel.TableName,
            Key: {
                cognitoId: user?.sub,
                email: user?.email
            }
        }
        const userData = await ddb.get(userQuery).promise();

        // if user profile detail not found, return error
        if (!userData.Item) {
            return next(new Error('User Data Not Found.!'));
        }

        // find if user has cart or not
        const cartQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
            TableName: ordersModel.TableName,
            IndexName: 'userIdIndex',
            KeyConditionExpression: '#uId = :uId',
            FilterExpression: '#os = :os',
            ExpressionAttributeNames: {
                '#uId': 'userId',
                '#os': 'orderStatus'
            },
            ExpressionAttributeValues: {
                ':uId': userData?.Item.id,
                ':os': 'cart'
            },
            Limit: 1
        }
        const cartData = await ddb.query(cartQuery).promise();

        // return success without data if data not found
        if (cartData && cartData.Count === 0) {
            return res.status(200).json({
                code: 200,
                message: 'Cart is Empty',
            });
        }

        // get venue detail
        const venueQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
            TableName: venueProfileModel.TableName,
            IndexName: 'idIndex',
            KeyConditionExpression: '#id = :id',
            ExpressionAttributeNames: {
                '#id': 'id'
            },
            ExpressionAttributeValues: {
                ':id': cartData?.Items[0].venueId
            },
            Limit: 1
        }
        const venueData = await ddb.query(venueQuery).promise();

        // if venue not found, return error
        if (venueData.Count == 0) {
            next(new Error('Venue Not Found.!'));
        }

        // return response
        return res.status(200).json({
            code: 200,
            message: 'success',
            data: {
                id: cartData?.Items[0].id,
                userId: cartData?.Items[0].userId,
                venueId: cartData?.Items[0].venueId,
                products: cartData?.Items[0].products,
                totalPrice: cartData?.Items[0].totalPrice,
                orderStatus: cartData?.Items[0].orderStatus,
                createdAt: cartData?.Items[0].createdAt,
                updatedAt: cartData?.Items[0].updatedAt,
                venue: venueCleanup(venueData?.Items[0])
            }
        });
    } catch (e) {
        next(e);
    }
}

export const deleteCart = async (
    req: RequestAuthenticated,
    res: Response,
    next: NextFunction
) => {
    try {
        // get detail input
        const { venueId, productId } = req.body;
        let venueData;

        // get user login
        const user = userDetail(req);

        // get user detail
        const userQuery: AWS.DynamoDB.DocumentClient.GetItemInput = {
            TableName: userProfileModel.TableName,
            Key: {
                cognitoId: user?.sub,
                email: user?.email
            }
        }
        const userData = await ddb.get(userQuery).promise();

        // if user profile detail not found, return error
        if (!userData.Item) {
            return next(new Error('User Data Not Found.!'));
        }

        // check if venue found in body request
        if (venueId) {
            // get venue detail
            const venueQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
                TableName: venueProfileModel.TableName,
                IndexName: 'idIndex',
                KeyConditionExpression: '#id = :id',
                ExpressionAttributeNames: {
                    '#id': 'id'
                },
                ExpressionAttributeValues: {
                    ':id': venueId
                },
                Limit: 1
            }
            venueData = await ddb.query(venueQuery).promise();

            // if venue not found, return error
            if (venueData.Count == 0) {
                next(new Error('Venue Not Found.!'));
            }
        }

        // find if user has cart or not
        const cartQuery: AWS.DynamoDB.DocumentClient.QueryInput = {
            TableName: ordersModel.TableName,
            IndexName: 'userIdIndex',
            KeyConditionExpression: '#uId = :uId',
            FilterExpression: '#os = :os',
            ExpressionAttributeNames: {
                '#uId': 'userId',
                '#os': 'orderStatus'
            },
            ExpressionAttributeValues: {
                ':uId': userData?.Item.id,
                ':os': 'cart'
            },
            Limit: 1
        }
        const cartData = await ddb.query(cartQuery).promise();

        // if cart found
        if (cartData && cartData.Count !== 0) {
            if (cartData?.Items[0].venueId !== venueId) {
                // delete cart
                await deleteCartById(cartData?.Items[0].id, userData?.Item.id);

                // return response
                return res.status(200).json({
                    code: 200,
                    message: 'success'
                });
            } else {
                // check if productId found in body request
                if (productId) {
                    const oldDataOrder = cartData?.Items[0];
                    let oldDataProductOrder = oldDataOrder.products;

                    // search if product already exist or not
                    // if exist, then skip
                    // if not, add object product to array
                    oldDataProductOrder.forEach((val, index) => {
                        if (val.id === productId) {
                            delete oldDataProductOrder[index];
                        }
                    });

                    // calculate total price
                    const newPriceTotal: number = oldDataProductOrder.reduce((total, val) => { return total + val.price }, 0);

                    // if price still 0, return error
                    if (newPriceTotal == 0) {
                        // delete cart
                        await deleteCartById(cartData?.Items[0].id, userData?.Item.id);

                        // return response
                        return res.status(200).json({
                            code: 200,
                            message: 'success'
                        });
                    } else {
                        // create query for update new data
                        const orderDataUpdateQuery: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
                            TableName: ordersModel.TableName,
                            Key: {
                                id: oldDataOrder.id,
                                userId: userData?.Item.id
                            },
                            UpdateExpression: `
                                SET
                                    #pr = :pr,
                                    #tr = :tr,
                                    #ua = :ua
                            `,
                            ExpressionAttributeNames: {
                                '#pr': 'products',
                                '#tr': 'totalPrice',
                                '#ua': 'updatedAt'
                            },
                            ExpressionAttributeValues: {
                                ':pr': oldDataProductOrder,
                                ':tr': newPriceTotal,
                                ':ua': new Date().toISOString()
                            },
                            ReturnValues: 'ALL_NEW'
                        }

                        // update data on db
                        const orderUpdate = await ddb.update(orderDataUpdateQuery).promise();

                        // return update data
                        return res.status(200).json({
                            code: 200,
                            message: 'success',
                            data: {
                                id: orderUpdate?.Attributes.id,
                                userId: orderUpdate?.Attributes.userId,
                                venueId: orderUpdate?.Attributes.venueId,
                                products: orderUpdate?.Attributes.products,
                                totalPrice: orderUpdate?.Attributes.totalPrice,
                                orderStatus: orderUpdate?.Attributes.orderStatus,
                                createdAt: orderUpdate?.Attributes.createdAt,
                                updatedAt: orderUpdate?.Attributes.updatedAt,
                                venue: venueCleanup(venueData?.Items[0])
                            }
                        });
                    }
                } else {
                    next(new Error('ProductId Not Found.!'));
                }
            }
        }

        // return response
        return res.status(200).json({
            code: 200,
            message: 'Your Cart is Empty.!'
        })

    } catch (e) {
        next(e);
    }
}


const deleteCartById = async (id, userId) => {
    try {
        const cardQueryDeletebyUserId: AWS.DynamoDB.DocumentClient.DeleteItemInput = {
            TableName: ordersModel.TableName,
            Key: {
                id: id,
                userId: userId
            }
        }

        await ddb.delete(cardQueryDeletebyUserId).promise();
    } catch (e) {
        throw e;
    }
}