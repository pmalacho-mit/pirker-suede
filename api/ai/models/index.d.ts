import type { KnownProvider } from "@mariozechner/pi-ai";
import type { MODELS } from "../../../node_modules/@mariozechner/pi-ai/dist/models.generated";
import type * as PI from "@mariozechner/pi-ai";
import type { Expand, ExpandRecursively } from "../../utils/types.ts";

export type ModelByProvider<P extends KnownProvider> = (typeof MODELS)[P];
export type ModelID<P extends KnownProvider> = keyof ModelByProvider<P>;

type ExcludeStreamKeys = "signal" | "onPayload";
export type StreamOptions = Omit<PI.StreamOptions, ExcludeStreamKeys>;

export type CustomStreams = {
  [k in keyof typeof PI as k extends `stream${string}`
    ? k extends "stream" | "streamSimple"
      ? never
      : k extends `${string}Simple${string}`
      ? never
      : k
    : never]: (typeof PI)[k] extends (...args: infer A) => infer _
    ? ExpandRecursively<{
        model: A[0];
        options: Omit<NonNullable<A[2]>, ExcludeStreamKeys | "client">;
      }>
    : never;
};

export type CustomStream = keyof CustomStreams;

type StreamOptionsForApi<TApi> = [
  Extract<CustomStreams[keyof CustomStreams], { model: { api: TApi } }>,
] extends [never]
  ? StreamOptions
  : Extract<
      CustomStreams[keyof CustomStreams],
      { model: { api: TApi } }
    >["options"];

export type StreamOptionsByProviderAndModel = ExpandRecursively<{
  [P in KnownProvider]: ExpandRecursively<{
    -readonly [M in ModelID<P>]: ExpandRecursively<
      StreamOptionsForApi<
        ModelByProvider<P>[M] extends { api: infer A } ? A : StreamOptions
      >
    >;
  }>;
}>;

type StreamFunctionForApi<TApi> = [
  {
    [K in keyof CustomStreams]: CustomStreams[K] extends {
      model: { api: TApi };
    }
      ? K
      : never;
  }[keyof CustomStreams],
] extends [never]
  ? "stream"
  : {
      [K in keyof CustomStreams]: CustomStreams[K] extends {
        model: { api: TApi };
      }
        ? K
        : never;
    }[keyof CustomStreams];

export type StreamFunctionByProviderAndModel = ExpandRecursively<{
  [P in KnownProvider]: Expand<{
    -readonly [M in ModelID<P>]: StreamFunctionForApi<
      ModelByProvider<P>[M] extends { api: infer A }
        ? A
        : PI.ProviderStreamOptions
    >;
  }>;
}>;

export type AnthropicEffort = Expand<PI.AnthropicOptions["effort"]>;
export type Transport = Expand<PI.Transport>;
export type CacheRetention = Expand<PI.CacheRetention>;
export type GoogleThinkingLevel = Expand<PI.GoogleThinkingLevel>;
export type ResponseCreateParamsStreaming = Expand<
  PI.OpenAIResponsesOptions["serviceTier"]
>;
