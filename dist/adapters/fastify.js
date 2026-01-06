"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastifyOpenApiPlugin = void 0;
exports.createFastifyHandler = createFastifyHandler;
exports.registerOpenApiRoutes = registerOpenApiRoutes;
const handler_1 = require("../handler");
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
/**
 * Convert Fastify request to OpenApiRequest
 */
function toOpenApiRequest(req) {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        headers[key.toLowerCase()] = value;
    }
    return {
        method: req.method,
        url: req.url,
        headers,
        body: req.body,
        query: req.query,
        params: req.params,
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
async function fastifyOpenApiPluginImpl(fastify, opts) {
    const { router, createContext, basePath = '', onError } = opts;
    // Create the handler
    const handler = (0, handler_1.createOpenApiHandler)({
        router,
        createContext: async ({ req, info }) => {
            // Convert back to allow access to raw Fastify request if needed
            return createContext({ req, info });
        },
        onError: onError
            ? ({ error, path, req, ctx }) => {
                // We can't easily get the original FastifyRequest here,
                // but we pass through what we have
                onError({ error, path, req: req, ctx });
            }
            : undefined,
    });
    // Register a catch-all route
    fastify.all(`${basePath}/*`, async (req, reply) => {
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
exports.fastifyOpenApiPlugin = (0, fastify_plugin_1.default)(fastifyOpenApiPluginImpl, {
    name: 'trpc-typia-openapi',
    fastify: '5.x',
});
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
function createFastifyHandler(opts) {
    const { router, createContext, basePath = '', onError } = opts;
    const handler = (0, handler_1.createOpenApiHandler)({
        router,
        createContext,
        onError: onError
            ? ({ error, path, req, ctx }) => {
                onError({ error, path, req: req, ctx });
            }
            : undefined,
    });
    return async (req, reply) => {
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
async function registerOpenApiRoutes(fastify, opts) {
    const { router, createContext, basePath = '', onError } = opts;
    const handler = (0, handler_1.createOpenApiHandler)({
        router,
        createContext,
        onError: onError
            ? ({ error, path, req, ctx }) => {
                onError({ error, path, req: req, ctx });
            }
            : undefined,
    });
    // Get routes from router
    const { getOpenApiRoutes } = await Promise.resolve().then(() => __importStar(require('../handler')));
    const routes = getOpenApiRoutes(router);
    // Convert {param} to :param for Fastify
    const toFastifyPath = (path) => path.replace(/\{([^}]+)\}/g, ':$1');
    for (const route of routes) {
        const fastifyPath = `${basePath}${toFastifyPath(route.path)}`;
        const method = route.method.toLowerCase();
        fastify[method](fastifyPath, async (req, reply) => {
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
//# sourceMappingURL=fastify.js.map