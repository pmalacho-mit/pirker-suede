import { Hono } from "hono";
import { getProviderModelSchemas } from "../ai/models/providers.js";

const providers = new Hono();

/**
 * GET /api/providers
 *
 * Returns every available provider and, for each provider, a record of model
 * names to their TypeBox stream-options schema.
 *
 * Shape:
 * ```json
 * {
 *   "anthropic": {
 *     "claude-3-5-haiku-latest": { ... },
 *     ...
 *   },
 *   "openai": {
 *     "gpt-4o": { ... },
 *     ...
 *   },
 *   ...
 * }
 * ```
 *
 * Query params:
 *   - `?filter=hasApiKey`  — restrict to providers whose API key is present in
 *                            the server's environment (defaults to `all`).
 */
providers.get("/", (c) => {
  const raw = c.req.query("filter");
  const filter = raw === "hasApiKey" ? "hasApiKey" : "all";
  return c.json(getProviderModelSchemas(filter));
});

export { providers };
