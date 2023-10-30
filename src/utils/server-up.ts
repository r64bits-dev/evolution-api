import { Express } from 'express';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';

import { configService, SslConf } from '../config/env.config';

export class ServerUP {
  static #app: Express;

  static set app(e: Express) {
    this.#app = e;
  }

  // static proxies = [];

  // static async loadProxies() {
  //   if (ServerUP.proxies.length == 0) {
  //     // eslint-disable-next-line no-async-promise-executor
  //     await new Promise<void>(async (resolve) => {
  //       const wget = await axios.get(
  //         'https://tq.lunaproxy.com/getflowip?neek=1036540&num=100&type=2&sep=1&regions=br&ip_si=1&level=1&sb=',
  //       );

  //       try {
  //         ServerUP.proxies = wget.data.data;
  //         resolve();
  //       } catch (_) {
  //         const timeWait = Math.floor(Math.random() * (3000 - 2000 + 1) + 2000);
  //         setTimeout(function () {
  //           console.log('aguarda ' + timeWait);
  //         }, timeWait);
  //       }
  //     });
  //   }
  // }

  static get https() {
    const { FULLCHAIN, PRIVKEY } = configService.get<SslConf>('SSL_CONF');
    return https.createServer(
      {
        cert: readFileSync(FULLCHAIN),
        key: readFileSync(PRIVKEY),
      },
      ServerUP.#app,
    );
  }

  static get http() {
    return http.createServer(ServerUP.#app);
  }
}
