import {
  type TLiteral,
  type TObject,
  type TSchema,
  Kind,
} from "@sinclair/typebox";

type Kinds = TLiteral | TObject;

type KindMap = {
  [k in Kinds as k[typeof Kind]]: k;
};

type Kind<K extends keyof KindMap> = KindMap[K];

export const is = <K extends keyof KindMap>(
  schema: TSchema,
  kind: K,
): schema is Kind<K> => schema[Kind] === kind;
