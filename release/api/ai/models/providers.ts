import type { TObject } from "@sinclair/typebox";
import {
  getProviders,
  getModelsForProvider,
  getStreamOptionsSchema,
  type Provider,
  type ModelForProvider,
} from "./index.js";

/**
 * A record of model names to their TypeBox stream-options schema.
 * Each value is the fully-typed object schema for that model's configuration.
 */
export type ModelSchemas<P extends Provider> = {
  [M in ModelForProvider<P>]: ReturnType<typeof getStreamOptionsSchema<P, M>>;
};

/**
 * A record of provider names to their available models and each model's
 * TypeBox stream-options schema.
 */
export type ProviderModelSchemas = {
  [P in Provider]: ModelSchemas<P>;
};

/**
 * Returns an object keyed by every available provider. Each entry is itself a
 * record keyed by model name whose value is the TypeBox object schema
 * describing that model's stream configuration options.
 *
 * Optionally pass `"hasApiKey"` to restrict the result to providers whose API
 * key is present in the current environment.
 */
export const getProviderModelSchemas = (
  filter: Parameters<typeof getProviders>[0] = "all",
): ProviderModelSchemas => {
  const providers = getProviders(filter);
  const result = {} as ProviderModelSchemas;

  for (const provider of providers) {
    const models = getModelsForProvider(provider, filter);
    const modelSchemas = {} as Record<string, TObject>;

    for (const model of models)
      modelSchemas[model as string] = getStreamOptionsSchema(
        provider,
        model as ModelForProvider<typeof provider>,
      );

    result[provider] = modelSchemas as ModelSchemas<typeof provider>;
  }

  return result;
};
