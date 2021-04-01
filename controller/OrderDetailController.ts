import { Response, NextFunction } from "express";
import { ordersModel } from "@appitzr-project/db-model";
import { RequestAuthenticated, userDetail} from "@base-pojokan/auth-aws-cognito";
import * as AWS from 'aws-sdk';

// declare database dynamodb
const ddb = new AWS.DynamoDB.DocumentClient({ endpoint: process.env.DYNAMODB_LOCAL, convertEmptyValues: true });

/**
 * Index Data Function
 *
 * @param req
 * @param res
 * @param next
 */
export const orderDetail = async (
    req: RequestAuthenticated,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await userDetail(req);
        const p_orderId = req.params.id;        
        
        // dynamodb parameter
        const paramDB: AWS.DynamoDB.DocumentClient.GetItemInput = {
            TableName: ordersModel.TableName,
            Key: {
                id: p_orderId,
                userId: user.sub
            }
            //   ,AttributesToGet: venueAttribute
        }

        // query to database
        const queryDB = await ddb.get(paramDB).promise();

        // return response
        return res.json({
            code: 200,
            message: "success",
            data: queryDB?.Item
        });
    } catch (e) {
        next(e);
    }
};
