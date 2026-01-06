import type { FastifyPluginAsync, FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AnyRouter, TRPCError } from '@trpc/server';
import type { CreateContextFn } from '../handler';
/**
 * Options for the Fastify OpenAPI plugin
 */
export interface FastifyOpenApiPluginOptions<TContext> {
    /** tRPC router */
    router: AnyRouter;
    /** Context factory */
    createContext: CreateContextFn<TContext>;
    /** Base path prefix for all routes (e.g., '/api/v1') */
    basePath?: string;
    /** Error handler */
    onError?: (opts: {
        error: TRPCError | Error;
        path: string;
        req: FastifyRequest;
        ctx: TContext | undefined;
    }) => void;
}
export declare const fastifyOpenApiPlugin: FastifyPluginAsync<FastifyOpenApiPluginOptions<unknown>>;
/**
 * Create a standalone Fastify route handler (alternative to plugin)
 *
 * @example
 * ```typescript
 * import { createFastifyHandler } from 'trpc-typia-openapi/adapters/fastify';
 *
 * const handler = createFastifyHandler({
 *   router: appRouter,
 *   createContext: ({ req }) => createContext(req),
 * });
 *
 * // Register routes manually
 * server.get('/api/*', handler);
 * server.post('/api/*', handler);
 * ```
 */
export declare function createFastifyHandler<TContext>(opts: Omit<FastifyOpenApiPluginOptions<TContext>, 'basePath'> & {
    basePath?: string;
}): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Helper to register individual routes from the router
 * (More explicit control over route registration)
 *
 * @example
 * ```typescript
 * import { registerOpenApiRoutes } from 'trpc-typia-openapi/adapters/fastify';
 *
 * await registerOpenApiRoutes(server, {
 *   router: appRouter,
 *   createContext: ({ req }) => createContext(req),
 *   basePath: '/api/v1',
 * });
 * ```
 */
export declare function registerOpenApiRoutes<TContext>(fastify: FastifyInstance, opts: FastifyOpenApiPluginOptions<TContext>): Promise<void>;
//# sourceMappingURL=fastify.d.ts.map