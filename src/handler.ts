import type { AnyRouter, TRPCError } from '@trpc/server';
import type { OpenApiMeta, HttpMethod } from './types';

/**
 * Internal procedure definition structure from tRPC
 */
interface ProcedureDef {
  _def: {
    type: 'query' | 'mutation' | 'subscription';
    meta?: OpenApiMeta;
    inputs?: unknown[];
    output?: unknown;
  };
}

/**
 * Internal router definition structure from tRPC
 */
interface RouterDef {
  _def: {
    procedures: Record<string, unknown>;
    router: boolean;
  };
}

/**
 * Check if a value is a nested router
 */
function isRouter(value: unknown): value is RouterDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    typeof (value as RouterDef)._def === 'object' &&
    (value as RouterDef)._def !== null &&
    'router' in (value as RouterDef)._def &&
    (value as RouterDef)._def.router === true
  );
}

/**
 * Incoming HTTP request abstraction
 */
export interface OpenApiRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
}

/**
 * HTTP response abstraction
 */
export interface OpenApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Context factory function type
 */
export type CreateContextFn<TContext> = (opts: {
  req: OpenApiRequest;
  info: { path: string; type: 'query' | 'mutation' };
}) => Promise<TContext> | TContext;

/**
 * Handler options
 */
export interface CreateOpenApiHandlerOptions<TContext> {
  router: AnyRouter;
  createContext: CreateContextFn<TContext>;
  onError?: (opts: {
    error: TRPCError | Error;
    path: string;
    req: OpenApiRequest;
    ctx: TContext | undefined;
  }) => void;
}

/**
 * Route match result
 */
interface RouteMatch {
  procedurePath: string;
  procedure: ProcedureDef;
  params: Record<string, string>;
}

/**
 * Parse path pattern and extract parameter positions
 * e.g., /users/{userId}/posts/{postId} -> { pattern: /^\/users\/([^/]+)\/posts\/([^/]+)$/, params: ['userId', 'postId'] }
 */
function compilePathPattern(path: string): { regex: RegExp; params: string[] } {
  const params: string[] = [];
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
 * Route entry for matching
 */
interface RouteEntry {
  method: HttpMethod;
  regex: RegExp;
  params: string[];
  procedurePath: string;
  procedure: ProcedureDef;
}

/**
 * Build route table from router
 */
function buildRouteTable(router: AnyRouter): RouteEntry[] {
  const routes: RouteEntry[] = [];

  function collectRoutes(routerDef: unknown, prefix: string = '') {
    const def = routerDef as RouterDef;
    if (!def._def?.procedures) return;

    for (const [name, value] of Object.entries(def._def.procedures)) {
      const fullPath = prefix ? `${prefix}.${name}` : name;

      // Check if it's a nested router
      if (isRouter(value)) {
        collectRoutes(value, fullPath);
      } else {
        const proc = value as ProcedureDef;
        const meta = proc._def.meta as OpenApiMeta | undefined;

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
function matchRoute(
  routes: RouteEntry[],
  method: string,
  pathname: string
): RouteMatch | null {
  const upperMethod = method.toUpperCase() as HttpMethod;

  for (const route of routes) {
    if (route.method !== upperMethod) continue;

    const match = route.regex.exec(pathname);
    if (match) {
      const params: Record<string, string> = {};
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
function parseUrl(url: string): { pathname: string; query: Record<string, string> } {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return { pathname: url, query: {} };
  }

  const pathname = url.slice(0, queryIndex);
  const queryString = url.slice(queryIndex + 1);
  const query: Record<string, string> = {};

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
function buildInput(
  req: OpenApiRequest,
  routeParams: Record<string, string>
): unknown {
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
function errorToResponse(error: TRPCError | Error): OpenApiResponse {
  const trpcError = error as TRPCError;
  const code = trpcError.code || 'INTERNAL_SERVER_ERROR';

  const statusMap: Record<string, number> = {
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
export function createOpenApiHandler<TContext>(
  opts: CreateOpenApiHandlerOptions<TContext>
): (req: OpenApiRequest) => Promise<OpenApiResponse> {
  const { router, createContext, onError } = opts;
  const routes = buildRouteTable(router);

  // Get the caller function from the router
  const caller = (router as { createCaller: (ctx: TContext) => Record<string, unknown> }).createCaller;

  return async (req: OpenApiRequest): Promise<OpenApiResponse> => {
    let { pathname } = parseUrl(req.url);
    // Normalize trailing slash (e.g. /business-context/ -> /business-context)
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
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
    const procedureType = procedure._def.type as 'query' | 'mutation';

    let ctx: TContext | undefined;

    try {
      // Create context
      ctx = await createContext({ req, info: { path: procedurePath, type: procedureType } });

      // Build input
      const input = buildInput(req, params);

      // Call procedure
      const trpcCaller = caller(ctx);

      // Navigate to the procedure (handles nested routers)
      const pathParts = procedurePath.split('.');
      let current: unknown = trpcCaller;

      for (const part of pathParts) {
        current = (current as Record<string, unknown>)[part];
      }

      // Execute the procedure
      const result = await (current as (input: unknown) => Promise<unknown>)(input);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result,
      };
    } catch (error) {
      const err = error as TRPCError | Error;

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
export function getOpenApiRoutes(router: AnyRouter): Array<{
  method: HttpMethod;
  path: string;
  procedurePath: string;
}> {
  const routes = buildRouteTable(router);
  return routes.map((r) => ({
    method: r.method,
    path: r.regex.source.replace(/\\/g, '').replace(/\(\[\^\/\]\+\)/g, '{param}'),
    procedurePath: r.procedurePath,
  }));
}
