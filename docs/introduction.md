# Introduction

This framework was designed with the future of AI-assisted development in mind. As AI becomes a core part of how we build and maintain software, codebases need to be **readable, predictable, and consistent** — not just for humans, but for AI agents too.

Traditional Express apps scatter configuration, routing, error handling, logging, and rate limiting across dozens of files with imperative patterns that are hard to parse and reason about. This framework replaces all of that with a small set of declarative functions (`defineConfig`, `defineController`, `defineModule`) that make the entire application structure explicit and self-documenting.

![Console Logs](/image.png)


## Why this matters for AI development

- **Consistency** — Every project follows the same patterns for config, routing, errors, and logging. An AI reading one project instantly understands all of them.
- **Declarative structure** — No hidden side effects, no imperative middleware chains to trace. The entire app is defined in ~3 function calls that AI can parse in a single pass.
- **Auto-generated OpenAPI 3.1 documentation** — The framework exposes a single `/spec` route returning a valid OpenAPI 3.1 document built from your declarations. Drop it into Swagger UI, Redoc, Postman, or any codegen tool. No manual docs to maintain or drift out of sync.
- **~60% fewer tokens** — A typical module definition in this framework is 15-20 lines of pure declarations vs. 50-60 lines of imperative Express code (router setup, middleware wiring, error handling, handler wrapping). AI agents spend significantly fewer tokens reading, understanding, and modifying the codebase.
- **Predictable error handling** — Throw an `HttpException` anywhere, the framework catches it. No more hunting for missing `try/catch` blocks or inconsistent error responses.

The result: a framework that is easier to write, easier to read, and easier to maintain — whether you're a human developer or an AI agent working on the code.
