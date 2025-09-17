// src/env.d.ts
/// <reference types="astro/client" />

/**
 * Defines the environment variables and bindings available in the Cloudflare runtime.
 * This provides type safety when accessing `context.locals.runtime.env`.
 */
type ENV = {
  // Binds the ANALYTICS_KV namespace, making it accessible via `env.ANALYTICS_KV`.
  ANALYTICS_KV: KVNamespace;
};

/**
 * Imports the official Runtime type from the Astro Cloudflare adapter.
 * This type encapsulates all Cloudflare-specific properties like `env`, `cf`, and `ctx`.
 */
type Runtime = import('@astrojs/cloudflare').Runtime<ENV>;

declare namespace App {
  /**
   * Extends the global `App.Locals` interface.
   * By merging the `Runtime` type, we inform TypeScript that every `Astro.locals`
   * or `context.locals` object will contain the Cloudflare runtime properties.
   * This is the key to resolving the "Property 'runtime' does not exist" errors.
   */
  interface Locals extends Runtime {}
}