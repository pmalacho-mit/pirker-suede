import * as PI from "@mariozechner/pi-ai";
import type { TLiteral, TSchema } from "@sinclair/typebox";
import { StreamOptionsByProviderAndModel } from "./options.generated.js";
import { StreamFunctionByProviderAndModel } from "./streams.generated.js";
import { is } from "../../utils/typebox.js";

export namespace StreamOptions {
  type Properties = typeof StreamOptionsByProviderAndModel.properties;
  export type Provider = keyof Properties;
  export type Model<P extends Provider> = keyof Properties[P]["properties"];
  export type Options<
    P extends Provider,
    M extends Model<P>,
  > = Properties[P]["properties"][M];
}

export const getStreamOptionsSchema = <
  Provider extends StreamOptions.Provider,
  Model extends StreamOptions.Model<Provider>,
>(
  provider: Provider,
  model: Model,
) => {
  const providerSchema = StreamOptionsByProviderAndModel.properties[provider];
  const modelSchema: TSchema =
    providerSchema.properties[model as keyof typeof providerSchema.properties];
  if (!is(modelSchema, "Object"))
    throw new Error("Unexpected non-object schema for stream options");
  return modelSchema as StreamOptions.Options<Provider, Model>;
};

export namespace StreamFunctions {
  type Properties = typeof StreamFunctionByProviderAndModel.properties;
  export type Provider = keyof Properties;
  export type Model<P extends Provider> = keyof Properties[P]["properties"];
  export type Schema<
    P extends Provider,
    M extends Model<P>,
  > = Properties[P]["properties"][M];
  export type Name<P extends Provider, M extends Model<P>> = Schema<
    P,
    M
  > extends TLiteral<infer F>
    ? F
    : never;
  export type Function<P extends Provider, M extends Model<P>> = Name<
    P,
    M
  > extends keyof typeof PI
    ? (typeof PI)[Name<P, M>]
    : never;
}

export const getStreamFunctionSchema = <
  Provider extends StreamFunctions.Provider,
  Model extends StreamFunctions.Model<Provider>,
>(
  provider: Provider,
  model: Model,
) => {
  const providerSchema = StreamFunctionByProviderAndModel.properties[provider];
  const modelSchema: TSchema =
    providerSchema.properties[model as keyof typeof providerSchema.properties];
  return modelSchema as StreamFunctions.Schema<Provider, Model>;
};

export const getStreamFunctionName = <
  Provider extends StreamFunctions.Provider,
  Model extends StreamFunctions.Model<Provider>,
>(
  provider: Provider,
  model: Model,
) => {
  const schema = getStreamFunctionSchema(provider, model) as TSchema;
  if (!is(schema, "Literal"))
    throw new Error("Unexpected non-literal schema for stream function name");
  return schema.const as StreamFunctions.Name<Provider, Model>;
};

export const getStreamFunction = <
  Provider extends StreamFunctions.Provider,
  Model extends StreamFunctions.Model<Provider>,
>(
  provider: Provider,
  model: Model,
) =>
  PI[
    getStreamFunctionName(provider, model) as keyof typeof PI
  ] as StreamFunctions.Function<Provider, Model>;

export type Provider = StreamOptions.Provider & StreamFunctions.Provider;

export const getProviders = () =>
  Object.keys(StreamOptionsByProviderAndModel.properties) as Provider[];

export const getModelsForProvider = <P extends Provider>(provider: P) =>
  Object.keys(
    StreamOptionsByProviderAndModel.properties[provider].properties,
  ) as StreamOptions.Model<P>[];

export const getModelsByProvider = () => {
  const providers = getProviders();
  const result = {} as { [P in Provider]: StreamOptions.Model<P>[] };
  for (const provider of providers)
    result[provider] = getModelsForProvider(provider);
  return result;
};
