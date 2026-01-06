import type { FastifyPluginAsync, FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AnyRouter, TRPCError } from '@trpc/server';
import type { OpenApiRequest, CreateContextFn } from '../handler';
import { createOpenApiHandler } from '../handler';
import fp from 'fastify-plugin';

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

/**
 * Convert Fastify request to OpenApiRequest
 */
function toOpenApiRequest(req: FastifyRequest): OpenApiRequest {
  const headers: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = value as string | string[] | undefined;
  }

  return {
    method: req.method,
    url: req.url,
    headers,
    body: req.body,
    query: req.query as Record<string, string | string[] | undefined>,
    params: req.params as Record<string, string>,
  };
}

/**
 * Fastify plugin for tRPC OpenAPI
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { fastifyOpenApiPlugin } from 'trpc-typia-openapi/adapters/fastify';
 *
 * const server = Fastify();
 *
 * await server.register(fastifyOpenApiPlugin, {
 *   router: appRouter,
 *   createContext: ({ req }) => createContext(req),
 *   basePath: '/api/v1',
 * });
 * ```
 */
async function fastifyOpenApiPluginImpl<TContext>(
  fastify: FastifyInstance,
  opts: FastifyOpenApiPluginOptions<TContext>
): Promise<void> {
  const { router, createContext, basePath = '', onError } = opts;

  // Create the handler
  const handler = createOpenApiHandler({
    router,
    createContext: async ({ req, info }) => {
      // Convert back to allow access to raw Fastify request if needed
      return createContext({ req, info });
    },
    onError: onError
      ? ({ error, path, req, ctx }) => {
          // We can't easily get the original FastifyRequest here,
          // but we pass through what we have
          onError({ error, path, req: req as unknown as FastifyRequest, ctx });
        }
      : undefined,
  });

  // Register a catch-all route
  fastify.all(`${basePath}/*`, async (req: FastifyRequest, reply: FastifyReply) => {
    const openApiReq = toOpenApiRequest(req);

    // Adjust URL to remove basePath for matching
    if (basePath) {
      openApiReq.url = openApiReq.url.slice(basePath.length);
    }

    const response = await handler(openApiReq);

    // Set headers
    for (const [key, value] of Object.entries(response.headers)) {
      reply.header(key, value);
    }

    return reply.status(response.status).send(response.body);
  });
}

// Wrap with fastify-plugin for proper encapsulation and type compatibility
export const fastifyOpenApiPlugin: FastifyPluginAsync<FastifyOpenApiPluginOptions<unknown>> = fp(
  fastifyOpenApiPluginImpl as FastifyPluginAsync<FastifyOpenApiPluginOptions<unknown>>,
  {
    name: 'trpc-typia-openapi',
    fastify: '5.x',
  }
);

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
export function createFastifyHandler<TContext>(
  opts: Omit<FastifyOpenApiPluginOptions<TContext>, 'basePath'> & {
    basePath?: string;
  }
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { router, createContext, basePath = '', onError } = opts;

  const handler = createOpenApiHandler({
    router,
    createContext,
    onError: onError
      ? ({ error, path, req, ctx }) => {
          onError({ error, path, req: req as unknown as FastifyRequest, ctx });
        }
      : undefined,
  });

  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const openApiReq = toOpenApiRequest(req);

    // Adjust URL to remove basePath for matching
    if (basePath && openApiReq.url.startsWith(basePath)) {
      openApiReq.url = openApiReq.url.slice(basePath.length) || '/';
    }

    const response = await handler(openApiReq);

    // Set headers
    for (const [key, value] of Object.entries(response.headers)) {
      reply.header(key, value);
    }

    reply.status(response.status).send(response.body);
  };
}

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
export async function registerOpenApiRoutes<TContext>(
  fastify: FastifyInstance,
  opts: FastifyOpenApiPluginOptions<TContext>
): Promise<void> {
  const { router, createContext, basePath = '', onError } = opts;

  const handler = createOpenApiHandler({
    router,
    createContext,
    onError: onError
      ? ({ error, path, req, ctx }) => {
          onError({ error, path, req: req as unknown as FastifyRequest, ctx });
        }
      : undefined,
  });

  // Get routes from router
  const { getOpenApiRoutes } = await import('../handler');
  const routes = getOpenApiRoutes(router);

  // Convert {param} to :param for Fastify
  const toFastifyPath = (path: string) =>
    path.replace(/\{([^}]+)\}/g, ':$1');

  for (const route of routes) {
    const fastifyPath = `${basePath}${toFastifyPath(route.path)}`;
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';

    fastify[method](fastifyPath, async (req: FastifyRequest, reply: FastifyReply) => {
      const openApiReq = toOpenApiRequest(req);

      // Set the original path (without basePath) for matching
      const originalPath = req.url.slice(basePath.length);
      openApiReq.url = originalPath.split('?')[0] || '/';

      const response = await handler(openApiReq);

      for (const [key, value] of Object.entries(response.headers)) {
        reply.header(key, value);
      }

      reply.status(response.status).send(response.body);
    });
  }
}
