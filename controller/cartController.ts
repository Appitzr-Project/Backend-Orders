import { Response, NextFunction } from "express";
import { body, validationResult } from 'express-validator';
import { orders, ordersModel, userProfileModel, productsModel, products, venueProfileModel } from "@appitzr-project/db-model";
import { RequestAuthenticated, userDetail } from "@base-pojokan/auth-aws-cognito";
import * as AWS from 'aws-sdk';
import { validationMessage, trans } from '@base-pojokan/express-validate-message';
import { v4 as uuidv4 } from 'uuid';

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
    body('discountCode')
        .optional()
        .isString()
        .withMessage(trans('discountCode', validationMessage.isString))
        .custom((val, { req }) => {
            // check if discount code found or not
        }),
];

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
        const { venueId, productId, discountCode } = req.body;

        // variable to save data
        let newPriceTotal: number = 0;
        let orderDataInput: orders;

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
                newPriceTotal = oldDataProductOrder.reduce((total, val) => { return total + val.price }, 0);

                if (newPriceTotal == 0) {
                    next(new Error('Price Total is 0'));
                }

                // orderDataInput = {
                //     ...oldDataOrder,
                //     ...{ products: oldDataProductOrder },
                //     ...{ totalPrice: newPriceTotal }
                // }

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
                    }
                }

                const orderUpdate = await ddb.update(orderDataUpdateQuery).promise();

                // return update data
                return res.status(200).json({
                    code: 200,
                    message: 'success',
                    data: orderUpdate
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

        const productDataArr = [];
        productDataArr.push(productData.Item);

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

        // create new data cart
        const cartNew: AWS.DynamoDB.DocumentClient.PutItemInput = {
            TableName: ordersModel.TableName,
            Item: orderInputNew,
        }
        await ddb.put(cartNew).promise();

        // return response
        return res.json({
            code: 200,
            message: "success",
            data: orderInputNew
        });
    } catch (e) {
        next(e);
    }
};