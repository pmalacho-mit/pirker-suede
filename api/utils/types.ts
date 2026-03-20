// Expands object types one level deep
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type ExpandRecursively<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T;

export type BindFirst<F extends (...args: any[]) => any> = F extends (
  first: any,
  ...rest: infer R
) => infer Ret
  ? (...args: R) => Ret
  : never;
