import type { OpenAPIV3_1 } from 'openapi-types';
import type { AnyRouter } from '@trpc/server';
import type { GenerateOpenApiDocumentOptions, HttpMethod } from './types';
/**
 * Generate OpenAPI document from a tRPC router with Typia schemas
 *
 * @example
 * ```typescript
 * import { generateOpenApiDocument } from 'trpc-typia-openapi';
 *
 * const openApiDoc = generateOpenApiDocument(appRouter, {
 *   title: 'My API',
 *   version: '1.0.0',
 *   baseUrl: 'https://api.example.com',
 * });
 * ```
 */
export declare function generateOpenApiDocument(router: AnyRouter, options: GenerateOpenApiDocumentOptions): OpenAPIV3_1.Document;
/**
 * Get all procedures that have OpenAPI metadata
 */
export declare function getOpenApiProcedures(router: AnyRouter): Map<string, {
    method: HttpMethod;
    path: string;
    procedurePath: string;
}>;
//# sourceMappingURL=generator.d.ts.map