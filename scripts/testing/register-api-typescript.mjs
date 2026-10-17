import { register } from 'node:module';

// Node 22/24 native TS stripping needs this local-only resolver to import the
// real API's extensionless TypeScript modules in the signed HTTP acceptance.
register(new URL('./resolve-api-typescript.mjs', import.meta.url), import.meta.url);
