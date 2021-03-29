import 'source-map-support/register';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import * as helmet from 'helmet';
import * as serverless from 'serverless-http';
import * as cors from 'cors';
import routes from './route';

// express instance
const app = express();

// express middleware
app.use(cors());
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet());

// all router lists
app.use('/orders', routes);

// get all unrouted url
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    next(new Error(`Route Not Found: [${req.method}] ${req.path}`));
});

// Error Handle
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(422).json({
        code: 422,
        success: false,
        message: error.message,
    });
});

// export to serverless
export const handler = serverless(app, {
    request(request, event, context) {
        request.context = event.requestContext;
    },
});
