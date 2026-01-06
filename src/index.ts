// Core procedure helpers
export {
  withSchema,
  createInput,
  createOutput,
  isTypiaParser,
  getSchemaFromParser,
  getFullSchemaFromParser,
} from './procedure';

// OpenAPI document generation
export { generateOpenApiDocument, getOpenApiProcedures } from './generator';

// HTTP handler
export {
  createOpenApiHandler,
  getOpenApiRoutes,
  type OpenApiRequest,
  type OpenApiResponse,
  type CreateContextFn,
  type CreateOpenApiHandlerOptions,
} from './handler';

// Fastify adapter
export {
  fastifyOpenApiPlugin,
  createFastifyHandler,
  registerOpenApiRoutes,
  type FastifyOpenApiPluginOptions,
} from './adapters/fastify';

// Types
export type {
  OpenApiMeta,
  GenerateOpenApiDocumentOptions,
  TypiaParser,
  HttpMethod,
  ProcedureType,
} from './types';

// Re-export OpenAPI types for convenience
export type { OpenAPIV3_1 } from 'openapi-types';
