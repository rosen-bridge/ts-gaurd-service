import fastifyCors, { FastifyCorsOptions } from '@fastify/cors';
import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { keygenRoute } from '../api/keygen';
import { p2pRoutes } from '../api/p2p';
import Configs from '../configs/Configs';
import { generalInfoRoute } from '../api/generalInfo';
import { eventRoutes } from '../api/events';
import { assetRoutes } from '../api/assets';
import { revenueRoutes } from '../api/revenue';
import { healthRoutes } from '../api/healthCheck';
import { tssRoute } from '../api/tss';
import WinstonLogger from '@rosen-bridge/winston-logger';
import { signRoute } from '../api/signTx';

const logger = WinstonLogger.getInstance().getLogger(import.meta.url);

/**
 * initialize api server
 * setup swagger on it
 * register all routers
 * then start it
 */
let apiServer: FastifyInstance;
const initApiServer = async () => {
  apiServer = fastify({
    bodyLimit: Configs.apiBodyLimit,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await apiServer.register(swagger);
  if (Configs.apiAllowedOrigins.includes('*')) {
    await apiServer.register(fastifyCors, {});
  } else {
    await apiServer.register(fastifyCors, () => {
      return (
        req: FastifyRequest,
        callback: (
          error: Error | null,
          corsOptions?: FastifyCorsOptions
        ) => void
      ) => {
        if (
          req.headers.origin &&
          Configs.apiAllowedOrigins.indexOf(req.headers.origin) !== -1
        ) {
          callback(null, { origin: true });
        }
        callback(null, { origin: false });
      };
    });
  }
  await apiServer.register(swaggerUi, {
    routePrefix: '/swagger',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  await apiServer.register(p2pRoutes);
  if (Configs.keygen.isActive) {
    await apiServer.register(keygenRoute);
  } else {
    await apiServer.register(tssRoute);
    await apiServer.register(generalInfoRoute);
    await apiServer.register(eventRoutes);
    await apiServer.register(healthRoutes);
    await apiServer.register(revenueRoutes);
    await apiServer.register(assetRoutes);
    await apiServer.register(signRoute);
  }
  apiServer.get('/', (request, reply) => {
    reply.redirect('/swagger');
  });
  const port = Configs.apiPort;
  const host = Configs.apiHost;

  await apiServer.listen({ host, port });
  logger.info(`api service started at http://${host}:${port}`);
};

export { initApiServer, apiServer };
