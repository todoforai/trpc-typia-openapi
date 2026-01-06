export { withSchema, createInput, createOutput, isTypiaParser, getSchemaFromParser, getFullSchemaFromParser, } from './procedure';
export { generateOpenApiDocument, getOpenApiProcedures } from './generator';
export { createOpenApiHandler, getOpenApiRoutes, type OpenApiRequest, type OpenApiResponse, type CreateContextFn, type CreateOpenApiHandlerOptions, } from './handler';
export { fastifyOpenApiPlugin, createFastifyHandler, registerOpenApiRoutes, type FastifyOpenApiPluginOptions, } from './adapters/fastify';
export type { OpenApiMeta, GenerateOpenApiDocumentOptions, TypiaParser, HttpMethod, ProcedureType, } from './types';
export type { OpenAPIV3_1 } from 'openapi-types';
//# sourceMappingURL=index.d.ts.map