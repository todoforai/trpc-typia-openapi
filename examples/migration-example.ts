/**
 * Example: Migrating from Zod to Typia
 *
 * This shows how to migrate the existing project router from
 * Zod schemas to Typia validation with trpc-typia-openapi.
 */

import typia, { tags } from 'typia';
import { initTRPC, TRPCError } from '@trpc/server';
import { withSchema, type OpenApiMeta } from 'trpc-typia-openapi';

// ============================================
// STEP 1: Define TypeScript interfaces
// (replaces Zod schemas)
// ============================================

// Input types with Typia validation tags
interface ProjectIdInput {
  projectId: string;
}

interface ProjectCreateInput {
  name: string;
  description?: string;
  isPublic: boolean;
}

interface ProjectUpdateInput {
  projectId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
  status?: 'active' | 'archived' | 'deleted';
}

interface ShareProjectInput {
  projectId: string;
  email: string & tags.Format<'email'>;
  canWrite: boolean;
}

// Output types
interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  status: string;
  createdAt: string & tags.Format<'date-time'>;
  updatedAt: string & tags.Format<'date-time'>;
}

interface ProjectWithSettings extends ProjectResponse {
  settings: {
    id: string;
    projectId: string;
    // ... other settings
  };
}

interface SuccessResponse {
  success: boolean;
}

// ============================================
// STEP 2: Create parsers with schemas
// (these bundle validator + JSON schema)
// ============================================

const projectIdInput = withSchema(
  typia.createAssert<ProjectIdInput>(),
  typia.json.schemas<[ProjectIdInput], '3.1'>()
);

const projectCreateInput = withSchema(
  typia.createAssert<ProjectCreateInput>(),
  typia.json.schemas<[ProjectCreateInput], '3.1'>()
);

const projectUpdateInput = withSchema(
  typia.createAssert<ProjectUpdateInput>(),
  typia.json.schemas<[ProjectUpdateInput], '3.1'>()
);

const shareProjectInput = withSchema(
  typia.createAssert<ShareProjectInput>(),
  typia.json.schemas<[ShareProjectInput], '3.1'>()
);

const projectWithSettingsOutput = withSchema(
  typia.createAssert<ProjectWithSettings>(),
  typia.json.schemas<[ProjectWithSettings], '3.1'>()
);

const projectResponseOutput = withSchema(
  typia.createAssert<ProjectResponse>(),
  typia.json.schemas<[ProjectResponse], '3.1'>()
);

const successOutput = withSchema(
  typia.createAssert<SuccessResponse>(),
  typia.json.schemas<[SuccessResponse], '3.1'>()
);

// ============================================
// STEP 3: Create tRPC with OpenAPI meta
// ============================================

const t = initTRPC.meta<OpenApiMeta>().context<{ userId: string }>().create();

const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

// ============================================
// STEP 4: Define router with Typia parsers
// ============================================

export const projectRouter = t.router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/projects',
        tags: ['Project'],
        summary: 'List all projects',
      },
    })
    .input(withSchema(
      typia.createAssert<{}>(),
      typia.json.schemas<[{}], '3.1'>()
    ))
    .output(withSchema(
      typia.createAssert<ProjectWithSettings[]>(),
      typia.json.schemas<[ProjectWithSettings[]], '3.1'>()
    ))
    .query(async ({ ctx }) => {
      // return projectService.listProjects(ctx.userId);
      return [];
    }),

  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/projects/{projectId}',
        tags: ['Project'],
        summary: 'Get a project by ID',
      },
    })
    .input(projectIdInput)
    .output(projectWithSettingsOutput)
    .query(async ({ ctx, input }) => {
      // return projectService.getProjectWithSettings(input.projectId, ctx.userId);
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),

  create: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/projects',
        tags: ['Project'],
        summary: 'Create a new project',
      },
    })
    .input(projectCreateInput)
    .output(projectWithSettingsOutput)
    .mutation(async ({ ctx, input }) => {
      // return projectService.createProject(ctx.userId, input);
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
    }),

  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/projects/{projectId}',
        tags: ['Project'],
        summary: 'Update a project',
      },
    })
    .input(projectUpdateInput)
    .output(successOutput)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...body } = input;
      // await projectService.updateProject(ctx.userId, projectId, body);
      return { success: true };
    }),

  delete: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/projects/{projectId}',
        tags: ['Project'],
        summary: 'Delete a project',
      },
    })
    .input(projectIdInput)
    .output(successOutput)
    .mutation(async ({ ctx, input }) => {
      // return projectService.deleteProject(ctx.userId, input.projectId);
      return { success: true };
    }),

  share: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/projects/{projectId}/share',
        tags: ['Project'],
        summary: 'Share a project with another user',
      },
    })
    .input(shareProjectInput)
    .output(projectResponseOutput)
    .mutation(async ({ ctx, input }) => {
      // return projectService.shareProject(ctx.userId, input.projectId, input.email, input.canWrite);
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
    }),
});

// ============================================
// STEP 5: Generate OpenAPI document
// ============================================

import { generateOpenApiDocument } from 'trpc-typia-openapi';

const openApiDoc = generateOpenApiDocument(projectRouter, {
  title: 'Project API',
  version: '1.0.0',
  baseUrl: 'https://api.todofor.ai',
  description: 'Project management API',
  tags: [
    { name: 'Project', description: 'Project management endpoints' },
  ],
  securitySchemes: {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'session',
    },
    apiKeyAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    },
  },
});

console.log(JSON.stringify(openApiDoc, null, 2));
