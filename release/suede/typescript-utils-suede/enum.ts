export const enumify = <const T extends string[]>(...values: T) =>
  values.reduce(
    (acc, value) => {
      (acc as any)[value] = value;
      return acc;
    },
    { _values: values } as { [k in T[number]]: k } & { _values: T },
  );

export type Enumified<T extends ReturnType<typeof enumify<any>>> =
  T["_values"][number];
