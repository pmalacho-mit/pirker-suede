export type Constructor<T = any> = new (...args: any[]) => T;

export type AbstractConstructor = abstract new (...args: any) => any;

export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type ExpandRecursively<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T;

export type EventOnElement<T extends HTMLElement> = Event & {
  currentTarget: EventTarget & T;
};

export type IsNullable<T> = null extends T
  ? true
  : undefined extends T
  ? true
  : false;

export type MakeOptionalIfNullable<T> = {
  [K in keyof T as IsNullable<T[K]> extends true ? K : never]?: NonNullable<
    T[K]
  >;
} & {
  [K in keyof T as IsNullable<T[K]> extends false ? K : never]: T[K];
};

export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

export type OptionalKeys<T> = {
  [K in keyof T]-?: IsNullable<T[K]> extends true ? K : never;
}[keyof T];

export type OnlyNonNullable<
  T extends Partial<Record<string, unknown | undefined | null>>,
> = {
  [k in keyof T as IsNullable<T[k]> extends true ? never : k]: T[k];
};

export type ToAllNonNullable<
  T extends Partial<Record<string, unknown | undefined | null>>,
> = {
  [k in keyof T]-?: Exclude<T[k], undefined | null>;
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type TrimLeading<
  T extends string,
  Prefix extends string,
> = T extends `${Prefix}${infer Rest}` ? Rest : T;

export type Maybe<T> = T | undefined;

export type OmitFromTuple<
  T extends readonly unknown[],
  U,
  Acc extends unknown[] = [],
> = T extends [infer Head, ...infer Tail]
  ? [Head] extends [U]
    ? OmitFromTuple<Tail, U, Acc>
    : OmitFromTuple<Tail, U, [...Acc, Head]>
  : Acc;

export type WithValue<T> = { value: T };

export type SingleOrArray<T> = T | T[];

export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export type ArrayKeys<T> = {
  [K in keyof T]: T[K] extends any[] ? K : never;
}[keyof T];

export type Parameter<T extends (arg: any) => any> = Parameters<T>[0];

/**
 * Splits a string based type into a tuple using a delimiter.
 * @template S - The input string to be split.
 * @template D - The delimiter string used for splitting.
 * @returns A tuple of strings representing the segments.
 */
export type Split<S extends string, D extends string = " "> = string extends S // Check if S is a general string, if so return string[]
  ? string[]
  : S extends "" // Check if S is an empty string, if so return []
  ? []
  : S extends `${infer T}${D}${infer U}` // Check for the delimiter D
  ? [T, ...Split<U, D>] // If found, add the part before D to the tuple and recurse on the rest (U)
  : [S]; // If no delimiter found, return a tuple with the whole string
