import type { TypiaParser, JsonSchemaCollection } from './types';

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
export function withSchema<T>(
  assertFn: (input: unknown) => T,
  schema: JsonSchemaCollection
): TypiaParser<T> {
  const parser = assertFn as TypiaParser<T>;
  parser._typiaSchema = schema;
  parser._isTypiaParser = true;
  return parser;
}

/**
 * Helper to create input parser - alias for withSchema with better semantics
 */
export const createInput = withSchema;

/**
 * Helper to create output parser - alias for withSchema with better semantics
 */
export const createOutput = withSchema;

/**
 * Checks if a parser is a Typia parser with embedded schema
 */
export function isTypiaParser(parser: unknown): parser is TypiaParser<unknown> {
  return (
    typeof parser === 'function' &&
    '_isTypiaParser' in parser &&
    (parser as TypiaParser<unknown>)._isTypiaParser === true
  );
}

/**
 * Extracts the JSON schema from a Typia parser.
 * Returns the first schema from the collection.
 */
export function getSchemaFromParser(parser: unknown): object | undefined {
  if (isTypiaParser(parser) && parser._typiaSchema) {
    return parser._typiaSchema.schemas[0] as object;
  }
  return undefined;
}

/**
 * Extracts all schemas and components from a Typia parser.
 * Useful for getting $ref references and component schemas.
 */
export function getFullSchemaFromParser(parser: unknown): JsonSchemaCollection | undefined {
  if (isTypiaParser(parser) && parser._typiaSchema) {
    return parser._typiaSchema;
  }
  return undefined;
}
