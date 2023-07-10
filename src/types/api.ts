import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { HealthStatusLevel } from '@rosen-bridge/health-check';

type FastifySeverInstance = FastifyInstance<
  Server<any, any>,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

enum SortRequest {
  ASC = 'ASC',
  DESC = 'DESC',
}

const HealthStatusType = Type.Object({
  id: Type.String(),
  status: Type.Enum(HealthStatusLevel),
  description: Type.Optional(Type.String()),
  lastCheck: Type.Optional(Type.String()),
});

export { FastifySeverInstance, SortRequest, HealthStatusType };
