import type { AnyRouter, TRPCError } from '@trpc/server';
import type { HttpMethod } from './types';
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
    info: {
        path: string;
        type: 'query' | 'mutation';
    };
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
export declare function createOpenApiHandler<TContext>(opts: CreateOpenApiHandlerOptions<TContext>): (req: OpenApiRequest) => Promise<OpenApiResponse>;
/**
 * Get all registered OpenAPI routes
 */
export declare function getOpenApiRoutes(router: AnyRouter): Array<{
    method: HttpMethod;
    path: string;
    procedurePath: string;
}>;
//# sourceMappingURL=handler.d.ts.map