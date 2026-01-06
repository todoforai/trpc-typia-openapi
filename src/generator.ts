import type { OpenAPIV3_1 } from 'openapi-types';
import type { AnyRouter } from '@trpc/server';
import type { OpenApiMeta, GenerateOpenApiDocumentOptions, HttpMethod } from './types';
import { getSchemaFromParser, getFullSchemaFromParser, isTypiaParser } from './procedure';

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
 * Parse OpenAPI path template to extract parameter names
 * Converts {param} to :param format and extracts param names
 */
function parsePath(path: string): { params: string[]; normalizedPath: string } {
  const params: string[] = [];
  const normalizedPath = path.replace(/\{([^}]+)\}/g, (_, param) => {
    params.push(param);
    return `{${param}}`;
  });
  return { params, normalizedPath };
}

/**
 * Get the HTTP method to use based on procedure type and explicit config
 */
function getHttpMethod(procedureType: string, explicitMethod?: HttpMethod): HttpMethod {
  if (explicitMethod) return explicitMethod;
  return procedureType === 'mutation' ? 'POST' : 'GET';
}

/**
 * Build request body schema for OpenAPI
 */
function buildRequestBody(
  inputSchema: object | undefined,
  pathParams: string[],
  contentType: string = 'application/json'
): OpenAPIV3_1.RequestBodyObject | undefined {
  if (!inputSchema) return undefined;

  // For GET requests with path params only, no body needed
  // But if there's a schema beyond path params, include it
  const schemaObj = inputSchema as OpenAPIV3_1.SchemaObject;

  if (schemaObj.type === 'object' && schemaObj.properties) {
    // Remove path parameters from request body
    const bodyProperties = { ...schemaObj.properties };
    const bodyRequired = (schemaObj.required || []).filter(
      (r: string) => !pathParams.includes(r)
    );

    for (const param of pathParams) {
      delete bodyProperties[param];
    }

    // If no properties left after removing path params, no body needed
    if (Object.keys(bodyProperties).length === 0) {
      return undefined;
    }

    return {
      required: true,
      content: {
        [contentType]: {
          schema: {
            ...schemaObj,
            properties: bodyProperties,
            required: bodyRequired.length > 0 ? bodyRequired : undefined,
          },
        },
      },
    };
  }

  return {
    required: true,
    content: {
      [contentType]: { schema: schemaObj },
    },
  };
}

/**
 * Build path parameters for OpenAPI
 */
function buildPathParameters(
  pathParams: string[],
  inputSchema: object | undefined
): OpenAPIV3_1.ParameterObject[] {
  const schemaObj = inputSchema as Record<string, unknown> | undefined;
  const properties = schemaObj?.properties as Record<string, unknown> | undefined;

  return pathParams.map((param) => {
    // Try to get schema from input
    const paramSchema = properties?.[param];

    return {
      name: param,
      in: 'path',
      required: true,
      schema: paramSchema || { type: 'string' },
    } as OpenAPIV3_1.ParameterObject;
  });
}

/**
 * Build query parameters for GET requests
 */
function buildQueryParameters(
  inputSchema: object | undefined,
  pathParams: string[],
  method: HttpMethod
): OpenAPIV3_1.ParameterObject[] {
  if (method !== 'GET' || !inputSchema) return [];

  const schemaObj = inputSchema as Record<string, unknown>;
  if (schemaObj.type !== 'object' || !schemaObj.properties) return [];

  const params: OpenAPIV3_1.ParameterObject[] = [];
  const required = (schemaObj.required as string[]) || [];
  const properties = schemaObj.properties as Record<string, unknown>;

  for (const [name, propSchema] of Object.entries(properties)) {
    // Skip path parameters
    if (pathParams.includes(name)) continue;

    params.push({
      name,
      in: 'query',
      required: required.includes(name),
      schema: propSchema,
    } as OpenAPIV3_1.ParameterObject);
  }

  return params;
}

/**
 * Build response schema for OpenAPI
 */
function buildResponse(
  outputSchema: object | undefined,
  responseContentType: string = 'application/json'
): OpenAPIV3_1.ResponsesObject {
  const successResponse: OpenAPIV3_1.ResponseObject = {
    description: 'Successful response',
  };

  if (outputSchema) {
    successResponse.content = {
      [responseContentType]: {
        schema: outputSchema as OpenAPIV3_1.SchemaObject,
      },
    };
  }

  return {
    '200': successResponse,
    default: {
      description: 'Error response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
              data: {
                type: 'object',
                additionalProperties: true,
              },
            },
            required: ['message', 'code'],
          },
        },
      },
    },
  };
}

/**
 * Recursively collect all procedures from a router
 */
function collectProcedures(
  router: unknown,
  prefix: string = ''
): Map<string, { path: string; procedure: ProcedureDef }> {
  const procedures = new Map<string, { path: string; procedure: ProcedureDef }>();
  const routerDef = router as RouterDef;

  if (!routerDef._def?.procedures) return procedures;

  for (const [name, value] of Object.entries(routerDef._def.procedures)) {
    const fullPath = prefix ? `${prefix}.${name}` : name;

    // Check if it's a nested router
    if (isRouter(value)) {
      const nestedProcedures = collectProcedures(value, fullPath);
      for (const [k, v] of nestedProcedures) {
        procedures.set(k, v);
      }
    } else {
      procedures.set(fullPath, { path: fullPath, procedure: value as ProcedureDef });
    }
  }

  return procedures;
}

/**
 * Collect all component schemas from parsers
 */
function collectComponentSchemas(
  procedures: Map<string, { path: string; procedure: ProcedureDef }>
): Record<string, OpenAPIV3_1.SchemaObject> {
  const components: Record<string, OpenAPIV3_1.SchemaObject> = {};

  for (const { procedure } of procedures.values()) {
    const def = procedure._def;

    // Collect from inputs
    if (def.inputs?.[0] && isTypiaParser(def.inputs[0])) {
      const fullSchema = getFullSchemaFromParser(def.inputs[0]);
      // Typia outputs components as { schemas: { TypeName: {...} } }
      const typiaComponents = fullSchema?.components as { schemas?: Record<string, unknown> } | undefined;
      if (typiaComponents?.schemas) {
        Object.assign(components, typiaComponents.schemas);
      }
    }

    // Collect from output
    if (def.output && isTypiaParser(def.output)) {
      const fullSchema = getFullSchemaFromParser(def.output);
      // Typia outputs components as { schemas: { TypeName: {...} } }
      const typiaComponents = fullSchema?.components as { schemas?: Record<string, unknown> } | undefined;
      if (typiaComponents?.schemas) {
        Object.assign(components, typiaComponents.schemas);
      }
    }
  }

  return components;
}

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
export function generateOpenApiDocument(
  router: AnyRouter,
  options: GenerateOpenApiDocumentOptions
): OpenAPIV3_1.Document {
  const {
    title,
    version,
    baseUrl,
    description,
    servers,
    securitySchemes,
    security,
    tags,
  } = options;

  const paths: OpenAPIV3_1.PathsObject = {};
  const procedures = collectProcedures(router);
  const componentSchemas = collectComponentSchemas(procedures);

  for (const [procedurePath, { procedure }] of procedures) {
    const def = procedure._def;
    const meta = def.meta as OpenApiMeta | undefined;

    // Skip procedures without OpenAPI metadata
    if (!meta?.openapi) continue;

    const { method, path, tags: opTags, summary, description: opDesc, deprecated, contentType, responseContentType, protect } = meta.openapi;
    const { params: pathParams, normalizedPath } = parsePath(path);
    const httpMethod = getHttpMethod(def.type, method);

    // Extract schemas from Typia parsers
    const inputParser = def.inputs?.[0];
    const outputParser = def.output;

    const inputSchema = inputParser ? getSchemaFromParser(inputParser) : undefined;
    const outputSchema = outputParser ? getSchemaFromParser(outputParser) : undefined;

    // Build operation
    const operation: OpenAPIV3_1.OperationObject = {
      operationId: procedurePath.replace(/\./g, '_'),
      tags: opTags,
      summary,
      description: opDesc,
      deprecated,
      parameters: [
        ...buildPathParameters(pathParams, inputSchema),
        ...buildQueryParameters(inputSchema, pathParams, httpMethod),
      ],
      responses: buildResponse(outputSchema, responseContentType),
    };

    // Add request body for non-GET methods
    if (httpMethod !== 'GET') {
      const requestBody = buildRequestBody(inputSchema, pathParams, contentType);
      if (requestBody) {
        operation.requestBody = requestBody;
      }
    }

    // Add security if protected
    if (protect && security) {
      operation.security = security;
    }

    // Remove empty parameters array
    if (operation.parameters?.length === 0) {
      delete operation.parameters;
    }

    // Add to paths
    if (!paths[normalizedPath]) {
      paths[normalizedPath] = {};
    }
    (paths[normalizedPath] as Record<string, OpenAPIV3_1.OperationObject>)[httpMethod.toLowerCase()] = operation;
  }

  // Build document
  const document: OpenAPIV3_1.Document = {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description,
    },
    servers: servers || [{ url: baseUrl }],
    paths,
  };

  // Add components if any
  if (Object.keys(componentSchemas).length > 0 || securitySchemes) {
    document.components = {};
    if (Object.keys(componentSchemas).length > 0) {
      document.components.schemas = componentSchemas;
    }
    if (securitySchemes) {
      document.components.securitySchemes = securitySchemes;
    }
  }

  // Add security at document level
  if (security) {
    document.security = security;
  }

  // Add tags
  if (tags) {
    document.tags = tags;
  }

  return document;
}

/**
 * Get all procedures that have OpenAPI metadata
 */
export function getOpenApiProcedures(
  router: AnyRouter
): Map<string, { method: HttpMethod; path: string; procedurePath: string }> {
  const result = new Map<string, { method: HttpMethod; path: string; procedurePath: string }>();
  const procedures = collectProcedures(router);

  for (const [procedurePath, { procedure }] of procedures) {
    const meta = procedure._def.meta as OpenApiMeta | undefined;
    if (!meta?.openapi) continue;

    const { method, path } = meta.openapi;
    const httpMethod = getHttpMethod(procedure._def.type, method);

    result.set(`${httpMethod} ${path}`, {
      method: httpMethod,
      path,
      procedurePath,
    });
  }

  return result;
}
