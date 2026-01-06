"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOpenApiRoutes = exports.createFastifyHandler = exports.fastifyOpenApiPlugin = exports.getOpenApiRoutes = exports.createOpenApiHandler = exports.getOpenApiProcedures = exports.generateOpenApiDocument = exports.getFullSchemaFromParser = exports.getSchemaFromParser = exports.isTypiaParser = exports.createOutput = exports.createInput = exports.withSchema = void 0;
// Core procedure helpers
var procedure_1 = require("./procedure");
Object.defineProperty(exports, "withSchema", { enumerable: true, get: function () { return procedure_1.withSchema; } });
Object.defineProperty(exports, "createInput", { enumerable: true, get: function () { return procedure_1.createInput; } });
Object.defineProperty(exports, "createOutput", { enumerable: true, get: function () { return procedure_1.createOutput; } });
Object.defineProperty(exports, "isTypiaParser", { enumerable: true, get: function () { return procedure_1.isTypiaParser; } });
Object.defineProperty(exports, "getSchemaFromParser", { enumerable: true, get: function () { return procedure_1.getSchemaFromParser; } });
Object.defineProperty(exports, "getFullSchemaFromParser", { enumerable: true, get: function () { return procedure_1.getFullSchemaFromParser; } });
// OpenAPI document generation
var generator_1 = require("./generator");
Object.defineProperty(exports, "generateOpenApiDocument", { enumerable: true, get: function () { return generator_1.generateOpenApiDocument; } });
Object.defineProperty(exports, "getOpenApiProcedures", { enumerable: true, get: function () { return generator_1.getOpenApiProcedures; } });
// HTTP handler
var handler_1 = require("./handler");
Object.defineProperty(exports, "createOpenApiHandler", { enumerable: true, get: function () { return handler_1.createOpenApiHandler; } });
Object.defineProperty(exports, "getOpenApiRoutes", { enumerable: true, get: function () { return handler_1.getOpenApiRoutes; } });
// Fastify adapter
var fastify_1 = require("./adapters/fastify");
Object.defineProperty(exports, "fastifyOpenApiPlugin", { enumerable: true, get: function () { return fastify_1.fastifyOpenApiPlugin; } });
Object.defineProperty(exports, "createFastifyHandler", { enumerable: true, get: function () { return fastify_1.createFastifyHandler; } });
Object.defineProperty(exports, "registerOpenApiRoutes", { enumerable: true, get: function () { return fastify_1.registerOpenApiRoutes; } });
//# sourceMappingURL=index.js.map