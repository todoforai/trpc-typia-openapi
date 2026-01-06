"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenApiDocument = generateOpenApiDocument;
exports.getOpenApiProcedures = getOpenApiProcedures;
const procedure_1 = require("./procedure");
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
 * Parse OpenAPI path template to extract parameter names
 * Converts {param} to :param format and extracts param names
 */
function parsePath(path) {
    const params = [];
    const normalizedPath = path.replace(/\{([^}]+)\}/g, (_, param) => {
        params.push(param);
        return `{${param}}`;
    });
    return { params, normalizedPath };
}
/**
 * Get the HTTP method to use based on procedure type and explicit config
 */
function getHttpMethod(procedureType, explicitMethod) {
    if (explicitMethod)
        return explicitMethod;
    return procedureType === 'mutation' ? 'POST' : 'GET';
}
/**
 * Build request body schema for OpenAPI
 */
function buildRequestBody(inputSchema, pathParams, contentType = 'application/json') {
    if (!inputSchema)
        return undefined;
    // For GET requests with path params only, no body needed
    // But if there's a schema beyond path params, include it
    const schemaObj = inputSchema;
    if (schemaObj.type === 'object' && schemaObj.properties) {
        // Remove path parameters from request body
        const bodyProperties = { ...schemaObj.properties };
        const bodyRequired = (schemaObj.required || []).filter((r) => !pathParams.includes(r));
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
function buildPathParameters(pathParams, inputSchema) {
    const schemaObj = inputSchema;
    const properties = schemaObj?.properties;
    return pathParams.map((param) => {
        // Try to get schema from input
        const paramSchema = properties?.[param];
        return {
            name: param,
            in: 'path',
            required: true,
            schema: paramSchema || { type: 'string' },
        };
    });
}
/**
 * Build query parameters for GET requests
 */
function buildQueryParameters(inputSchema, pathParams, method) {
    if (method !== 'GET' || !inputSchema)
        return [];
    const schemaObj = inputSchema;
    if (schemaObj.type !== 'object' || !schemaObj.properties)
        return [];
    const params = [];
    const required = schemaObj.required || [];
    const properties = schemaObj.properties;
    for (const [name, propSchema] of Object.entries(properties)) {
        // Skip path parameters
        if (pathParams.includes(name))
            continue;
        params.push({
            name,
            in: 'query',
            required: required.includes(name),
            schema: propSchema,
        });
    }
    return params;
}
/**
 * Build response schema for OpenAPI
 */
function buildResponse(outputSchema, responseContentType = 'application/json') {
    const successResponse = {
        description: 'Successful response',
    };
    if (outputSchema) {
        successResponse.content = {
            [responseContentType]: {
                schema: outputSchema,
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
function collectProcedures(router, prefix = '') {
    const procedures = new Map();
    const routerDef = router;
    if (!routerDef._def?.procedures)
        return procedures;
    for (const [name, value] of Object.entries(routerDef._def.procedures)) {
        const fullPath = prefix ? `${prefix}.${name}` : name;
        // Check if it's a nested router
        if (isRouter(value)) {
            const nestedProcedures = collectProcedures(value, fullPath);
            for (const [k, v] of nestedProcedures) {
                procedures.set(k, v);
            }
        }
        else {
            procedures.set(fullPath, { path: fullPath, procedure: value });
        }
    }
    return procedures;
}
/**
 * Collect all component schemas from parsers
 */
function collectComponentSchemas(procedures) {
    const components = {};
    for (const { procedure } of procedures.values()) {
        const def = procedure._def;
        // Collect from inputs
        if (def.inputs?.[0] && (0, procedure_1.isTypiaParser)(def.inputs[0])) {
            const fullSchema = (0, procedure_1.getFullSchemaFromParser)(def.inputs[0]);
            // Typia outputs components as { schemas: { TypeName: {...} } }
            const typiaComponents = fullSchema?.components;
            if (typiaComponents?.schemas) {
                Object.assign(components, typiaComponents.schemas);
            }
        }
        // Collect from output
        if (def.output && (0, procedure_1.isTypiaParser)(def.output)) {
            const fullSchema = (0, procedure_1.getFullSchemaFromParser)(def.output);
            // Typia outputs components as { schemas: { TypeName: {...} } }
            const typiaComponents = fullSchema?.components;
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
function generateOpenApiDocument(router, options) {
    const { title, version, baseUrl, description, servers, securitySchemes, security, tags, } = options;
    const paths = {};
    const procedures = collectProcedures(router);
    const componentSchemas = collectComponentSchemas(procedures);
    for (const [procedurePath, { procedure }] of procedures) {
        const def = procedure._def;
        const meta = def.meta;
        // Skip procedures without OpenAPI metadata
        if (!meta?.openapi)
            continue;
        const { method, path, tags: opTags, summary, description: opDesc, deprecated, contentType, responseContentType, protect } = meta.openapi;
        const { params: pathParams, normalizedPath } = parsePath(path);
        const httpMethod = getHttpMethod(def.type, method);
        // Extract schemas from Typia parsers
        const inputParser = def.inputs?.[0];
        const outputParser = def.output;
        const inputSchema = inputParser ? (0, procedure_1.getSchemaFromParser)(inputParser) : undefined;
        const outputSchema = outputParser ? (0, procedure_1.getSchemaFromParser)(outputParser) : undefined;
        // Build operation
        const operation = {
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
        paths[normalizedPath][httpMethod.toLowerCase()] = operation;
    }
    // Build document
    const document = {
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
function getOpenApiProcedures(router) {
    const result = new Map();
    const procedures = collectProcedures(router);
    for (const [procedurePath, { procedure }] of procedures) {
        const meta = procedure._def.meta;
        if (!meta?.openapi)
            continue;
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
//# sourceMappingURL=generator.js.map