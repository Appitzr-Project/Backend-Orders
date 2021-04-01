import * as express from 'express';
import { Request, Response } from 'express';
import { orderDetail } from '../controller/OrderDetailController';

// Route Declare
const route = express.Router();

// Route List
route.get('/:id', orderDetail);

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