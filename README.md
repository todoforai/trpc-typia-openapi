# trpc-typia-openapi

OpenAPI support for tRPC with Typia validation. Generate OpenAPI 3.1 docs and REST endpoints from your tRPC router.

## Why Typia?

- **10-100x faster validation** via AOT compilation (no runtime schema parsing)
- **No schema duplication** - TypeScript types are the source of truth
- **Smaller bundle size** - validation code is generated at compile time

## Installation

```bash
npm install trpc-typia-openapi typia
```

Typia requires a TypeScript transformer. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "typia/lib/transform" }]
  }
}
```

Use `ts-patch` or a bundler that supports TypeScript transformers.

## Quick Start

```typescript
import typia, { tags } from 'typia';
import { initTRPC } from '@trpc/server';
import { createParser, generateOpenApiDocument, type OpenApiMeta } from 'trpc-typia-openapi';

// 1. Define types with Typia validation tags
interface CreateUserInput {
  name: string;
  email: string & tags.Format<"email">;
}

interface User {
  id: string & tags.Format<"uuid">;
  name: string;
  email: string;
}

// 2. Create tRPC router with OpenAPI metadata
const t = initTRPC.meta<OpenApiMeta>().create();

export const appRouter = t.router({
  createUser: t.procedure
    .meta({
      openapi: { method: 'POST', path: '/users', tags: ['Users'] },
    })
    .input(createParser(
      typia.createAssert<CreateUserInput>(),
      typia.json.schemas<[CreateUserInput], "3.1">()
    ))
    .output(createParser(
      typia.createAssert<User>(),
      typia.json.schemas<[User], "3.1">()
    ))
    .mutation(({ input }) => {
      return { id: crypto.randomUUID(), ...input };
    }),
});

// 3. Generate OpenAPI document
const openApiDoc = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
});
```

## Fastify Adapter

```typescript
import Fastify from 'fastify';
import { fastifyOpenApiPlugin } from 'trpc-typia-openapi';

const server = Fastify();

await server.register(fastifyOpenApiPlugin, {
  router: appRouter,
  createContext: ({ req }) => ({}),
  basePath: '/api',
});
```

## OpenAPI Metadata Options

```typescript
.meta({
  openapi: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: '/your/path/{param}',
    tags: ['Tag'],
    summary: 'Short description',
    description: 'Detailed description',
    deprecated: false,
    protect: true, // Adds security requirement
  },
})
```

## Migration from Zod

```typescript
// Before: Zod
const schema = z.object({
  email: z.string().email(),
});

// After: Typia
interface Input {
  email: string & tags.Format<"email">;
}
const parser = createParser(
  typia.createAssert<Input>(),
  typia.json.schemas<[Input], "3.1">()
);
```

## License

MIT
