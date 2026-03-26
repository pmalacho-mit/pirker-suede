import type { Snippet } from "svelte";

/**
 * Extracts the argument types from a Svelte Snippet type.
 *
 * @template T - A Snippet type to extract arguments from
 * @returns A tuple type representing the snippet's arguments
 *
 * @example
 * ```ts
 * type MySnippet = Snippet<[string, number]>;
 * type Args = ExtractSnippetArgs<MySnippet>; // [string, number]
 * ```
 */
export type ExtractSnippetArgs<T extends Snippet<any>> = T extends Snippet<
  infer A
>
  ? A
  : never;

/**
 * Expands an object type to show all its properties explicitly.
 * Useful for improving type readability in IDE tooltips.
 *
 * @template T - The type to expand
 * @returns The same type with all properties explicitly shown
 *
 * @example
 * ```ts
 * type Combined = { a: string } & { b: number };
 * type Expanded = Expand<Combined>; // { a: string; b: number }
 * ```
 */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

/**
 * Checks if a type is nullable (can be null or undefined).
 *
 * @template T - The type to check
 * @returns `true` if the type accepts null or undefined, `false` otherwise
 *
 * @example
 * ```ts
 * type A = IsNullable<string | null>; // true
 * type B = IsNullable<string>; // false
 * type C = IsNullable<number | undefined>; // true
 * ```
 */
export type IsNullable<T> = null extends T
  ? true
  : undefined extends T
  ? true
  : false;

/**
 * Makes properties optional if they are nullable (null or undefined).
 * Properties that can be null/undefined become optional with their non-nullable type.
 * Non-nullable properties remain required.
 *
 * @template T - The object type to transform
 * @returns A new type with nullable properties made optional
 *
 * @example
 * ```ts
 * type Input = { name: string; age: number | null; email?: string };
 * type Output = MakeOptionalIfNullable<Input>;
 * // { name: string; age?: number; email?: string }
 * ```
 */
export type MakeOptionalIfNullable<T> = {
  [K in keyof T as IsNullable<T[K]> extends true ? K : never]?: NonNullable<
    T[K]
  >;
} & {
  [K in keyof T as IsNullable<T[K]> extends false ? K : never]: T[K];
};

/**
 * Extracts the keys of an object type that are required (not optional).
 *
 * @template T - The object type to analyze
 * @returns A union of string literal types representing required keys
 *
 * @example
 * ```ts
 * type Obj = { required: string; optional?: number; alsoRequired: boolean };
 * type Keys = RequiredKeys<Obj>; // "required" | "alsoRequired"
 * ```
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Represents a value that may or may not be present.
 * Equivalent to `T | undefined`.
 *
 * @template T - The type of the value when present
 *
 * @example
 * ```ts
 * type Name = Maybe<string>; // string | undefined
 * const value: Maybe<number> = undefined; // valid
 * ```
 */
export type Maybe<T> = T | undefined;

export type IfMaybe<T, If, Else> = undefined extends T ? If : Else;

/**
 * Represents either a single value or an array of values of the same type.
 *
 * @template T - The type of the value(s)
 *
 * @example
 * ```ts
 * type Input = SingleOrArray<string>;
 * const a: Input = "hello"; // valid
 * const b: Input = ["hello", "world"]; // valid
 * ```
 */
export type SingleOrArray<T> = T | T[];

/**
 * Extracts the element type from an array type.
 *
 * @template ArrayType - A readonly array type
 * @returns The type of elements in the array
 *
 * @example
 * ```ts
 * type StringArray = string[];
 * type Element = ArrayElement<StringArray>; // string
 *
 * type Mixed = (string | number)[];
 * type MixedElement = ArrayElement<Mixed>; // string | number
 * ```
 */
export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;
