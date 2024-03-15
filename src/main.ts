import 'express-async-errors';

import axios from 'axios';
import compression from 'compression';
import cors from 'cors';
import express, { json, NextFunction, Request, Response, urlencoded } from 'express';
import { join } from 'path';

import { Auth, configService, Cors, HttpServer, Rabbitmq, Webhook } from './config/env.config';
import { onUnexpectedError } from './config/error.config';
import { Logger } from './config/logger.config';
import { ROOT_DIR } from './config/path.config';
import { swaggerRouter } from './docs/swagger.conf';
import { initAMQP } from './libs/amqp.server';
import { initIO } from './libs/socket.server';
import { ServerUP } from './utils/server-up';
import { HttpStatus, router } from './whatsapp/routers/index.router';
import { waMonitor } from './whatsapp/whatsapp.module';
function initWA() {
  waMonitor.loadInstance();
}

function bootstrap() {
  const logger = new Logger('SERVER');
  const app = express();

  app.use(
    cors({
      origin(requestOrigin, callback) {
        const { ORIGIN } = configService.get<Cors>('CORS');
        if (ORIGIN.includes('*')) {
          return callback(null, true);
        }
        if (ORIGIN.indexOf(requestOrigin) !== -1) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: [...configService.get<Cors>('CORS').METHODS],
      credentials: configService.get<Cors>('CORS').CREDENTIALS,
    }),
    urlencoded({ extended: true, limit: '136mb' }),
    json({ limit: '136mb' }),
    compression(),
  );

  app.set('view engine', 'hbs');
  app.set('views', join(ROOT_DIR, 'views'));
  app.use(express.static(join(ROOT_DIR, 'public')));

  app.use('/store', express.static(join(ROOT_DIR, 'store')));

  app.use('/', router);
  app.use(swaggerRouter);

  app.use(
    (err: Error, req: Request, res: Response, next: NextFunction) => {
      if (err) {
        const webhook = configService.get<Webhook>('WEBHOOK');

        if (webhook.EVENTS.ERRORS_WEBHOOK && webhook.EVENTS.ERRORS_WEBHOOK != '' && webhook.EVENTS.ERRORS) {
          const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
          const localISOTime = new Date(Date.now() - tzoffset).toISOString();
          const now = localISOTime;
          const globalApiKey = configService.get<Auth>('AUTHENTICATION').API_KEY.KEY;
          const serverUrl = configService.get<HttpServer>('SERVER').URL;

          const errorData = {
            event: 'error',
            data: {
              error: err['error'] || 'Internal Server Error',
              message: err['message'] || 'Internal Server Error',
              status: err['status'] || 500,
              response: {
                message: err['message'] || 'Internal Server Error',
              },
            },
            date_time: now,
            api_key: globalApiKey,
            server_url: serverUrl,
          };

          logger.error(errorData);

          const baseURL = webhook.EVENTS.ERRORS_WEBHOOK;
          const httpService = axios.create({ baseURL });

          httpService.post('', errorData);
        }

        return res.status(err['status'] || 500).json({
          status: err['status'] || 500,
          error: err['error'] || 'Internal Server Error',
          response: {
            message: err['message'] || 'Internal Server Error',
          },
        });
      }

      next();
    },
    (req: Request, res: Response, next: NextFunction) => {
      const { method, url } = req;

      res.status(HttpStatus.NOT_FOUND).json({
        status: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        response: {
          message: [`Cannot ${method.toUpperCase()} ${url}`],
        },
      });

      next();
    },
  );

  const httpServer = configService.get<HttpServer>('SERVER');

  ServerUP.app = app;
  const server = ServerUP[httpServer.TYPE];

  function delayExecution(callback: () => void, delayInSeconds: number) {
    setTimeout(callback, delayInSeconds * 1000);
  }

  function startWhatsapp() {
    //process.env.SERVICE_NAME = '41992063984';
    //process.env.AUTHENTICATION_API_KEY = 'B6D711FCDE4D4FD5936544120E713976';
    if (process.env.SERVICE_NAME) {
      console.log('INICIANDO V2: ', process.env.SERVICE_NAME);

      const requestData = {
        instanceName: process.env.SERVICE_NAME,
        token: process.env.SERVICE_NAME,
        qrcode: true,
      };

      const config = {
        headers: {
          apikey: process.env.AUTHENTICATION_API_KEY,
        },
        timeout: 60000,
      };
      axios
        .post('http://localhost:8080/instance/create', requestData, config)
        .then(() => {
          console.log('Chamada bem-sucedida');
        })
        .catch((error) => {
          console.error('Erro na chamada:', error);
        });
    }
  }

  server.listen(httpServer.PORT, async () => {
    logger.log(httpServer.TYPE.toUpperCase() + ' - ON: ' + httpServer.PORT);
    delayExecution(startWhatsapp, 3);
  });

  initWA();

  initIO(server);

  if (configService.get<Rabbitmq>('RABBITMQ')?.ENABLED) initAMQP();

  onUnexpectedError();
}

bootstrap();
