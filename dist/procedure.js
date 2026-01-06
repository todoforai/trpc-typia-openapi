"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOutput = exports.createInput = void 0;
exports.withSchema = withSchema;
exports.isTypiaParser = isTypiaParser;
exports.getSchemaFromParser = getSchemaFromParser;
exports.getFullSchemaFromParser = getFullSchemaFromParser;
/**
 * Wraps a Typia assertion function with its JSON schema for OpenAPI generation.
 *
 * Since Typia requires compile-time transformation, you need to call both
 * typia.createAssert<T>() and typia.json.schemas<[T]>() and pass them to this helper.
 *
 * @example
 * ```typescript
 * import typia from 'typia';
 * import { withSchema } from 'trpc-typia-openapi';
 *
 * interface CreateUserInput {
 *   name: string;
 *   email: string & tags.Format<"email">;
 * }
 *
 * // Create input parser with schema
 * const createUserInput = withSchema(
 *   typia.createAssert<CreateUserInput>(),
 *   typia.json.schemas<[CreateUserInput], "3.1">()
 * );
 *
 * // Use in tRPC procedure
 * const procedure = t.procedure
 *   .input(createUserInput)
 *   .mutation(({ input }) => { ... });
 * ```
 */
function withSchema(assertFn, schema) {
    const parser = assertFn;
    parser._typiaSchema = schema;
    parser._isTypiaParser = true;
    return parser;
}
/**
 * Helper to create input parser - alias for withSchema with better semantics
 */
exports.createInput = withSchema;
/**
 * Helper to create output parser - alias for withSchema with better semantics
 */
exports.createOutput = withSchema;
/**
 * Checks if a parser is a Typia parser with embedded schema
 */
function isTypiaParser(parser) {
    return (typeof parser === 'function' &&
        '_isTypiaParser' in parser &&
        parser._isTypiaParser === true);
}
/**
 * Extracts the JSON schema from a Typia parser.
 * Returns the first schema from the collection.
 */
function getSchemaFromParser(parser) {
    if (isTypiaParser(parser) && parser._typiaSchema) {
        return parser._typiaSchema.schemas[0];
    }
    return undefined;
}
/**
 * Extracts all schemas and components from a Typia parser.
 * Useful for getting $ref references and component schemas.
 */
function getFullSchemaFromParser(parser) {
    if (isTypiaParser(parser) && parser._typiaSchema) {
        return parser._typiaSchema;
    }
    return undefined;
}
//# sourceMappingURL=procedure.js.map