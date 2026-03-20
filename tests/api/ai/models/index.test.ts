import { describe, test, expectTypeOf, expect } from "vitest";
import {
  type KnownProvider,
  stream,
  streamAnthropic,
  streamOpenAIResponses,
} from "../../../../release/node_modules/@mariozechner/pi-ai";
import {
  getStreamFunction,
  getStreamOptionsSchema,
  getProviders,
  getModelsForProvider,
  getModelsByProvider,
  type StreamFunctions,
  type StreamOptions,
} from "../../../../release/api/ai/models/";

describe("models", () => {
  test("StreamFunctions types", () => {
    expectTypeOf<StreamFunctions.Provider>().toEqualTypeOf<KnownProvider>();
  });

  test("StreamOptions types", () => {
    expectTypeOf<StreamOptions.Provider>().toEqualTypeOf<KnownProvider>();
  });

  test(getStreamFunction.name, () => {
    const anthropic = getStreamFunction("anthropic", "claude-3-5-haiku-latest");
    expect(anthropic).toBe(streamAnthropic);
    expectTypeOf(anthropic).toEqualTypeOf<typeof streamAnthropic>();

    const openai = getStreamFunction("openai", "gpt-4o");
    expect(openai).toBe(streamOpenAIResponses);
    expectTypeOf(openai).toEqualTypeOf<typeof streamOpenAIResponses>();

    const bedrock = getStreamFunction("amazon-bedrock", "zai.glm-4.7");
    expect(bedrock).toBe(stream);
    expectTypeOf(bedrock).toEqualTypeOf<typeof stream>();
  });

  test(getStreamOptionsSchema.name, () => {
    const anthropic = getStreamOptionsSchema(
      "anthropic",
      "claude-3-5-haiku-latest",
    );

    expect(anthropic).toEqual(
      getStreamOptionsSchema("anthropic", "claude-haiku-4-5"),
    );

    const openai = getStreamOptionsSchema("openai", "gpt-4o");
    expect(openai).toEqual(
      getStreamOptionsSchema("openai", "gpt-4o-2024-08-06"),
    );

    expect(openai).not.toEqual(anthropic);
  });

  test(getProviders.name, () => {
    const providers = getProviders();
    expectTypeOf(providers).toExtend<string[]>();
    expectTypeOf<"anthropic">().toExtend<(typeof providers)[number]>();
    expectTypeOf<"openai">().toExtend<(typeof providers)[number]>();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });

  test(getModelsForProvider.name, () => {
    const anthropic = getModelsForProvider("anthropic");
    expectTypeOf(anthropic).toExtend<string[]>();
    expectTypeOf<"claude-sonnet-4-6">().toExtend<(typeof anthropic)[number]>();

    expect(anthropic.length).toBeGreaterThan(0);
    for (const model of anthropic) {
      expect(typeof model).toBe("string");
      expect(model).toContain("claude");
    }

    const openai = getModelsForProvider("openai");
    expectTypeOf(openai).toExtend<string[]>();
    expectTypeOf<"gpt-4o">().toExtend<(typeof openai)[number]>();

    expect(openai.length).toBeGreaterThan(0);
    let gpts = 0;
    for (const model of openai) if (model.startsWith("gpt")) gpts++;
    expect(gpts).toBeGreaterThan(5);
  });

  test(getModelsByProvider.name, () => {
    const modelsByProvider = getModelsByProvider();

    const anthropicModels = modelsByProvider["anthropic"];
    expect(anthropicModels).toBeDefined();
    expect(anthropicModels).toContain("claude-3-5-haiku-latest");

    const openaiModels = modelsByProvider["openai"];
    expect(openaiModels).toBeDefined();
    expect(openaiModels).toContain("gpt-4o");
  });

  test("filtering providers and models", () => {
    const all = getProviders("all");
    expect(all.length).toBeGreaterThan(0);

    const hasApiKey = getProviders("hasApiKey");
    expect(hasApiKey.length).toBe(0);

    process.env["OPENAI_API_KEY"] = "fake";

    const hasApiKeyAfter = getProviders("hasApiKey");
    expect(hasApiKeyAfter).toContain("openai");
  });
});
