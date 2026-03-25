import { describe, test, expect, expectTypeOf } from "vitest";
import {
  getProviderModelSchemas,
  type ProviderModelSchemas,
  type ModelSchemas,
} from "@release/api/ai/models/providers";
import { getProviders, getModelsForProvider } from "@release/api/ai/models/";
import type { TObject } from "@sinclair/typebox";

// All environment variable keys that getEnvApiKey() from pi-ai consults
// when checking whether a provider has credentials available. We snapshot
// and restore them around tests that care about the "hasApiKey" filter so
// that leftover state from other test files never causes spurious failures.
const ALL_API_KEY_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_OAUTH_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "ZAI_API_KEY",
  "MISTRAL_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_CN_API_KEY",
  "HF_TOKEN",
  "OPENCODE_API_KEY",
  "KIMI_API_KEY",
  "GOOGLE_CLOUD_API_KEY",
  "COPILOT_GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "AWS_PROFILE",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
] as const;

function snapshotEnv() {
  const saved: Record<string, string | undefined> = {};
  for (const key of ALL_API_KEY_VARS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const key of ALL_API_KEY_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearAllApiKeyVars() {
  for (const key of ALL_API_KEY_VARS) delete process.env[key];
}

describe("getProviderModelSchemas", () => {
  test("returns an object keyed by all providers", () => {
    const result = getProviderModelSchemas();
    const providers = getProviders();

    expect(Object.keys(result).sort()).toEqual(providers.slice().sort());
  });

  test("each provider entry is a non-empty record of models", () => {
    const result = getProviderModelSchemas();

    for (const provider of getProviders()) {
      const models = result[provider];
      expect(models).toBeDefined();
      expect(typeof models).toBe("object");
      expect(Object.keys(models).length).toBeGreaterThan(0);
    }
  });

  test("model keys match getModelsForProvider", () => {
    const result = getProviderModelSchemas();

    for (const provider of getProviders()) {
      const expectedModels = getModelsForProvider(provider).slice().sort();
      const actualModels = Object.keys(result[provider]).sort();
      expect(actualModels).toEqual(expectedModels);
    }
  });

  test("each model value is a TypeBox object schema", () => {
    const result = getProviderModelSchemas();

    for (const provider of getProviders()) {
      for (const [, schema] of Object.entries(result[provider])) {
        const s = schema as TObject;
        // TypeBox object schemas carry a `properties` map.
        expect(s.properties).toBeDefined();
        expect(typeof s.properties).toBe("object");
      }
    }
  });

  test("anthropic entry contains known models with schemas", () => {
    const result = getProviderModelSchemas();
    const anthropic = result["anthropic"];

    expect(anthropic).toBeDefined();
    expect(anthropic["claude-3-5-haiku-latest"]).toBeDefined();
    expect(anthropic["claude-3-5-haiku-latest"].properties).toBeDefined();
  });

  test("openai entry contains known models with schemas", () => {
    const result = getProviderModelSchemas();
    const openai = result["openai"];

    expect(openai).toBeDefined();
    expect(openai["gpt-4o"]).toBeDefined();
    expect(openai["gpt-4o"].properties).toBeDefined();
  });

  test("schemas differ across providers", () => {
    const result = getProviderModelSchemas();
    const anthropicSchema = result["anthropic"]["claude-3-5-haiku-latest"];
    const openaiSchema = result["openai"]["gpt-4o"];

    // Different provider APIs expose different options, so their schemas
    // should not be the same object reference or have identical shapes.
    expect(anthropicSchema).not.toBe(openaiSchema);
    expect(anthropicSchema).not.toEqual(openaiSchema);
  });

  test('filter="hasApiKey" returns empty object when no keys are set', () => {
    const saved = snapshotEnv();
    clearAllApiKeyVars();

    try {
      const result = getProviderModelSchemas("hasApiKey");
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      restoreEnv(saved);
    }
  });

  test('filter="hasApiKey" includes provider when its key is set', () => {
    const saved = snapshotEnv();
    clearAllApiKeyVars();
    process.env["OPENAI_API_KEY"] = "fake-key";

    try {
      const result = getProviderModelSchemas("hasApiKey");
      expect(result["openai"]).toBeDefined();
      expect(Object.keys(result["openai"]).length).toBeGreaterThan(0);
    } finally {
      restoreEnv(saved);
    }
  });

  test('filter="hasApiKey" excludes providers whose key is not set', () => {
    const saved = snapshotEnv();
    clearAllApiKeyVars();
    process.env["OPENAI_API_KEY"] = "fake-key";

    try {
      const result = getProviderModelSchemas("hasApiKey");
      expect(result["openai"]).toBeDefined();
      // anthropic has no key set, so it must be absent
      expect((result as Record<string, unknown>)["anthropic"]).toBeUndefined();
    } finally {
      restoreEnv(saved);
    }
  });

  test('filter="hasApiKey" result keys are a subset of filter="all" keys', () => {
    const saved = snapshotEnv();
    clearAllApiKeyVars();
    process.env["OPENAI_API_KEY"] = "fake-key";
    process.env["ANTHROPIC_API_KEY"] = "fake-key";

    try {
      const all = Object.keys(getProviderModelSchemas("all"));
      const filtered = Object.keys(getProviderModelSchemas("hasApiKey"));

      expect(filtered.length).toBeGreaterThan(0);
      for (const provider of filtered) expect(all).toContain(provider);
    } finally {
      restoreEnv(saved);
    }
  });

  test("type: ProviderModelSchemas is correctly shaped", () => {
    expectTypeOf<ProviderModelSchemas>().toHaveProperty("anthropic");
    expectTypeOf<ProviderModelSchemas>().toHaveProperty("openai");
    expectTypeOf<ModelSchemas<"anthropic">>().toHaveProperty(
      "claude-3-5-haiku-latest",
    );
    expectTypeOf<ModelSchemas<"openai">>().toHaveProperty("gpt-4o");
  });
});
