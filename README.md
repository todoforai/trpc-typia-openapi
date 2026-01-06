# trpc-typia-openapi

OpenAPI support for tRPC with Typia validation. Generate OpenAPI documentation and REST endpoints from your tRPC router using Typia's blazing-fast runtime validation.

## Features

- **10-100x faster validation** than Zod via Typia's AOT compilation
- **No schema duplication** - use TypeScript types directly
- **Full OpenAPI 3.1 support** with automatic documentation generation
- **REST endpoint handler** for serving OpenAPI-compatible HTTP endpoints
- **Fastify adapter** included

## Installation

```bash
npm install trpc-typia-openapi typia
# or
yarn add trpc-typia-openapi typia
# or
bun add trpc-typia-openapi typia
```

### TypeScript Configuration

Typia requires a TypeScript transformer. Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "typia/lib/transform" }]
  }
}
```

And use `ts-patch` or a bundler that supports TypeScript transformers.

## Usage

### 1. Define Types and Create Parsers

```typescript
import typia, { tags } from 'typia';
import { withSchema } from 'trpc-typia-openapi';

// Define your types with Typia tags for validation
interface CreateUserInput {
  name: string;
  email: string & tags.Format<"email">;
  age: number & tags.Type<"uint32"> & tags.Minimum<18>;
}

interface UserResponse {
  id: string & tags.Format<"uuid">;
  name: string;
  email: string;
  createdAt: string & tags.Format<"date-time">;
}

// Create parsers with embedded JSON schemas
const createUserInput = withSchema(
  typia.createAssert<CreateUserInput>(),
  typia.json.schemas<[CreateUserInput], "3.1">()
);

const userResponse = withSchema(
  typia.createAssert<UserResponse>(),
  typia.json.schemas<[UserResponse], "3.1">()
);
```

### 2. Define tRPC Procedures with OpenAPI Metadata

```typescript
import { initTRPC } from '@trpc/server';
import type { OpenApiMeta } from 'trpc-typia-openapi';

const t = initTRPC.meta<OpenApiMeta>().create();

export const appRouter = t.router({
  createUser: t.procedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        tags: ['Users'],
        summary: 'Create a new user',
      },
    })
    .input(createUserInput)
    .output(userResponse)
    .mutation(async ({ input }) => {
      // Your logic here
      return {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: input.name,
        email: input.email,
        createdAt: new Date().toISOString(),
      };
    }),

  getUser: t.procedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/{userId}',
        tags: ['Users'],
      },
    })
    .input(withSchema(
      typia.createAssert<{ userId: string }>(),
      typia.json.schemas<[{ userId: string }], "3.1">()
    ))
    .output(userResponse)
    .query(async ({ input }) => {
      // Your logic here
    }),
});
```

### 3. Generate OpenAPI Document

```typescript
import { generateOpenApiDocument } from 'trpc-typia-openapi';

const openApiDoc = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  description: 'API documentation',
  tags: [
    { name: 'Users', description: 'User management endpoints' },
  ],
});

// Serve at /openapi.json
```

### 4. Serve REST Endpoints (Fastify)

```typescript
import Fastify from 'fastify';
import { fastifyOpenApiPlugin } from 'trpc-typia-openapi/adapters/fastify';

const server = Fastify();

await server.register(fastifyOpenApiPlugin, {
  router: appRouter,
  createContext: ({ req }) => ({
    // Your context
  }),
  basePath: '/api/v1',
});

// Now /api/v1/users (POST) and /api/v1/users/{userId} (GET) are available
```

## API Reference

### `withSchema(assertFn, schema)`

Wraps a Typia assertion function with its JSON schema for OpenAPI generation.

```typescript
const parser = withSchema(
  typia.createAssert<MyType>(),
  typia.json.schemas<[MyType], "3.1">()
);
```

### `generateOpenApiDocument(router, options)`

Generates an OpenAPI 3.1 document from a tRPC router.

Options:
- `title` - API title
- `version` - API version
- `baseUrl` - Base URL for the API
- `description` - Optional description
- `tags` - OpenAPI tags
- `securitySchemes` - Security scheme definitions
- `security` - Default security requirements

### OpenAPI Metadata

Add to any procedure via `.meta()`:

```typescript
.meta({
  openapi: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: '/your/path/{param}',
    tags: ['Tag1', 'Tag2'],
    summary: 'Short description',
    description: 'Detailed description',
    deprecated: false,
    protect: true, // Adds security requirement
  },
})
```

## Migration from Zod/trpc-to-openapi

### Before (Zod)

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// ... duplicate schema definition
```

### After (Typia)

```typescript
import typia, { tags } from 'typia';
import { withSchema } from 'trpc-typia-openapi';

interface CreateUserInput {
  name: string;
  email: string & tags.Format<"email">;
}

const createUserInput = withSchema(
  typia.createAssert<CreateUserInput>(),
  typia.json.schemas<[CreateUserInput], "3.1">()
);
```

## Performance

Typia's AOT compilation provides:
- **10-100x faster** validation compared to Zod
- **Smaller bundle size** - no runtime schema parsing
- **Zero type duplication** - TypeScript types are the source of truth

## License

MIT
