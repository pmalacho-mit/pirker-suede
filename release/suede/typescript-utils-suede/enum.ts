export function enumify<const T extends readonly string[]>(
  ...values: T
): { [K in T[number]]: K } & { _values: T };
export function enumify<const T extends Record<string, unknown>>(
  values: T,
): { [K in Extract<keyof T, string>]: K } & {
  _values: readonly Extract<keyof T, string>[];
};
export function enumify(
  ...args: readonly [Record<string, unknown>] | readonly string[]
) {
  const values =
    args.length === 1 && typeof args[0] === "object" && args[0] !== null
      ? Object.keys(args[0])
      : (args as readonly string[]);

  return values.reduce(
    (acc, value) => {
      (acc as any)[value] = value;
      return acc;
    },
    { _values: values } as Record<string, string> & {
      _values: readonly string[];
    },
  );
}

export type Enumified<T extends { _values: readonly string[] }> =
  T["_values"][number];
