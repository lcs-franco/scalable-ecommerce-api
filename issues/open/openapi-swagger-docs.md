# Add OpenAPI docs with Swagger/Scalar per service

**What to build:** Each service (user, product, cart, order) should expose auto-generated OpenAPI docs at `/docs`. Use `@fastify/swagger` to generate the spec from existing Zod route schemas, and `@scalar/fastify-api-reference` (or `@fastify/swagger-ui`) to serve the interactive UI. The generated spec can also be exported as JSON/YAML for import into Insomnia/Postman.

**Blocked by:** none

**Status:** todo

- [ ] Install `@fastify/swagger` and `@scalar/fastify-api-reference` in each service
- [ ] Register swagger plugin in `buildApp` with OpenAPI metadata (title, version, description)
- [ ] Verify all existing Zod schemas are picked up automatically (body, params, querystring, response)
- [ ] Serve interactive docs UI at `/docs` per service
- [ ] Confirm spec export (JSON) works for Insomnia/Postman import
