import * as express from 'express';
import { Request, Response } from 'express';
import { cartDeleteValidate, cartShow, cartStore, cartStoreValidate, deleteCart } from '../controller/cartController';

// Route Declare
const route = express.Router();

// Route List
route.post('/cart', cartStoreValidate, cartStore);
route.get('/cart', cartShow);
route.delete('/cart', cartDeleteValidate, deleteCart);

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