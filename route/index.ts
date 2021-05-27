import * as express from 'express';
import { Request, Response } from 'express';
import { cartStore, cartStoreValidate } from '../controller/cartController';

// Route Declare
const route = express.Router();
// Route List
route.post('/cart', cartStoreValidate, cartStore);

// health check api
route.get('/health-check', (req: Request, res: Response) => {
    return res.status(200).json({
        code: 200,
        message: 'success',
        headers: req.headers
    });
})

// export all route
export default route;