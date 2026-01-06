"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiHandler = createOpenApiHandler;
exports.getOpenApiRoutes = getOpenApiRoutes;
/**
 * Check if a value is a nested router
 */
function isRouter(value) {
    return (typeof value === 'object' &&
        value !== null &&
        '_def' in value &&
        typeof value._def === 'object' &&
        value._def !== null &&
        'router' in value._def &&
        value._def.router === true);
}
/**
 * Parse path pattern and extract parameter positions
 * e.g., /users/{userId}/posts/{postId} -> { pattern: /^\/users\/([^/]+)\/posts\/([^/]+)$/, params: ['userId', 'postId'] }
 */
function compilePathPattern(path) {
    const params = [];
    const pattern = path.replace(/\{([^}]+)\}/g, (_, param) => {
        params.push(param);
        return '([^/]+)';
    });
    return {
        regex: new RegExp(`^${pattern}$`),
        params,
    };
}
/**
 * Build route table from router
 */
function buildRouteTable(router) {
    const routes = [];
    function collectRoutes(routerDef, prefix = '') {
        const def = routerDef;
        if (!def._def?.procedures)
            return;
        for (const [name, value] of Object.entries(def._def.procedures)) {
            const fullPath = prefix ? `${prefix}.${name}` : name;
            // Check if it's a nested router
            if (isRouter(value)) {
                collectRoutes(value, fullPath);
            }
            else {
                const proc = value;
                const meta = proc._def.meta;
                if (meta?.openapi) {
                    const { method, path } = meta.openapi;
                    const httpMethod = method || (proc._def.type === 'mutation' ? 'POST' : 'GET');
                    const { regex, params } = compilePathPattern(path);
                    routes.push({
                        method: httpMethod,
                        regex,
                        params,
                        procedurePath: fullPath,
                        procedure: proc,
                    });
                }
            }
        }
    }
    collectRoutes(router);
    return routes;
}
/**
 * Match incoming request to a route
 */
function matchRoute(routes, method, pathname) {
    const upperMethod = method.toUpperCase();
    for (const route of routes) {
        if (route.method !== upperMethod)
            continue;
        const match = route.regex.exec(pathname);
        if (match) {
            const params = {};
            route.params.forEach((name, index) => {
                params[name] = decodeURIComponent(match[index + 1]);
            });
            return {
                procedurePath: route.procedurePath,
                procedure: route.procedure,
                params,
            };
        }
    }
    return null;
}
/**
 * Parse URL to extract pathname and query
 */
function parseUrl(url) {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
        return { pathname: url, query: {} };
    }
    const pathname = url.slice(0, queryIndex);
    const queryString = url.slice(queryIndex + 1);
    const query = {};
    for (const pair of queryString.split('&')) {
        const [key, value] = pair.split('=');
        if (key) {
            query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
        }
    }
    return { pathname, query };
}
/**
 * Build input for tRPC procedure from request
 */
function buildInput(req, routeParams) {
    const { pathname, query } = parseUrl(req.url);
    // For GET requests, combine path params and query params
    if (req.method.toUpperCase() === 'GET') {
        return {
            ...query,
            ...req.query,
            ...routeParams,
        };
    }
    // For other methods, combine path params with body
    if (typeof req.body === 'object' && req.body !== null) {
        return {
            ...req.body,
            ...routeParams,
        };
    }
    // Just path params if no body
    if (Object.keys(routeParams).length > 0) {
        return routeParams;
    }
    return req.body;
}
/**
 * Convert tRPC error to HTTP response
 */
function errorToResponse(error) {
    const trpcError = error;
    const code = trpcError.code || 'INTERNAL_SERVER_ERROR';
    const statusMap = {
        PARSE_ERROR: 400,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        METHOD_NOT_SUPPORTED: 405,
        TIMEOUT: 408,
        CONFLICT: 409,
        PRECONDITION_FAILED: 412,
        PAYLOAD_TOO_LARGE: 413,
        UNPROCESSABLE_CONTENT: 422,
        TOO_MANY_REQUESTS: 429,
        CLIENT_CLOSED_REQUEST: 499,
        INTERNAL_SERVER_ERROR: 500,
        NOT_IMPLEMENTED: 501,
    };
    return {
        status: statusMap[code] || 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
            message: error.message,
            code,
            data: trpcError.cause || null,
        },
    };
}
/**
 * Create the OpenAPI HTTP handler
 *
 * @example
 * ```typescript
 * import { createOpenApiHandler } from 'trpc-typia-openapi';
 *
 * const handler = createOpenApiHandler({
 *   router: appRouter,
 *   createContext: ({ req }) => ({ user: req.user }),
 * });
 *
 * // Use with your HTTP framework
 * const response = await handler(request);
 * ```
 */
function createOpenApiHandler(opts) {
    const { router, createContext, onError } = opts;
    const routes = buildRouteTable(router);
    // Get the caller function from the router
    const caller = router.createCaller;
    return async (req) => {
        const { pathname } = parseUrl(req.url);
        const match = matchRoute(routes, req.method, pathname);
        if (!match) {
            return {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    message: `No route found for ${req.method} ${pathname}`,
                    code: 'NOT_FOUND',
                },
            };
        }
        const { procedurePath, procedure, params } = match;
        const procedureType = procedure._def.type;
        let ctx;
        try {
            // Create context
            ctx = await createContext({ req, info: { path: procedurePath, type: procedureType } });
            // Build input
            const input = buildInput(req, params);
            // Call procedure
            const trpcCaller = caller(ctx);
            // Navigate to the procedure (handles nested routers)
            const pathParts = procedurePath.split('.');
            let current = trpcCaller;
            for (const part of pathParts) {
                current = current[part];
            }
            // Execute the procedure
            const result = await current(input);
            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: result,
            };
        }
        catch (error) {
            const err = error;
            if (onError) {
                onError({ error: err, path: procedurePath, req, ctx });
            }
            return errorToResponse(err);
        }
    };
}
/**
 * Get all registered OpenAPI routes
 */
function getOpenApiRoutes(router) {
    const routes = buildRouteTable(router);
    return routes.map((r) => ({
        method: r.method,
        path: r.regex.source.replace(/\\/g, '').replace(/\(\[\^\/\]\+\)/g, '{param}'),
        procedurePath: r.procedurePath,
    }));
}
//# sourceMappingURL=handler.js.map