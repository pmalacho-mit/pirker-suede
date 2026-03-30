import type { HTMLAttributes, SvelteHTMLElements } from "svelte/elements";
import type { Expand, Split } from "../typescript-utils-suede";
import { word } from "../typescript-utils-suede/regex";
import type { Snippet } from "svelte";
import { twMerge } from "tailwind-merge";

export namespace Variants {
  export type Constraint = Record<string, string>;
  export type Extract<T extends Constraint> = Expand<
    {
      [K in keyof T]: Split<T[K]>[number];
    }[keyof T]
  >;
  export type Attributes<T extends Constraint> = {
    [K in keyof T]?: boolean;
  };
}

type AllClasses<
  Base extends string,
  Builtin extends Variants.Constraint,
  Custom extends Variants.Constraint,
> = Expand<
  Split<Base>[number] | Variants.Extract<Builtin> | Variants.Extract<Custom>
>;

export type WithOmit<
  Base extends string,
  Builtin extends Variants.Constraint,
  Custom extends Variants.Constraint,
> = {
  omit?: AllClasses<Base, Builtin, Custom>[];
};

export type WithCustom<T extends Variants.Constraint> = Expand<
  string extends keyof T ? {} : { custom?: T } & Variants.Attributes<T>
>;

export type StyledProps<
  Element extends keyof SvelteHTMLElements,
  Base extends string,
  Builtin extends Variants.Constraint,
  Custom extends Variants.Constraint,
  SupportsChildren extends boolean = true,
> = SvelteHTMLElements[Element] &
  (SupportsChildren extends true ? { children: Snippet } : {}) &
  Expand<Variants.Attributes<Builtin>> &
  Expand<WithCustom<Custom>> &
  Expand<WithOmit<Base, Builtin, Custom>>;

/**
 * Merges a base class string with optional element classes, with support for omitting
 * specific base tokens via `attributes.omit`.
 */
export function classify<Base extends string>(
  base: Base,
  attributes?: Pick<HTMLAttributes<HTMLElement>, "class"> &
    WithOmit<Base, {}, {}>,
): string;
/**
 * Merges a base class string, enabled decoration class groups, and optional element
 * classes, then removes any tokens listed in `attributes.omit`.
 */
export function classify<
  Base extends string,
  Builtin extends Variants.Constraint,
  Custom extends Variants.Constraint,
>(
  base: Base,
  attributes: Pick<HTMLAttributes<HTMLElement>, "class"> &
    WithOmit<Base, Builtin, Custom> &
    Variants.Attributes<Builtin>,
  builtin: Builtin,
  custom?: Custom,
): string;
/** Implementation */
export function classify(
  base: string,
  attributes?: Pick<HTMLAttributes<HTMLElement>, "class"> &
    WithOmit<string, Variants.Constraint, Variants.Constraint> &
    Record<string, any>,
  builtin?: Record<string, string>,
  custom?: Record<string, string>,
) {
  const variants = new Array<string>();

  if (builtin && attributes)
    for (const key in builtin)
      if (attributes[key] === true) variants.push(builtin[key]);

  if (custom && attributes)
    for (const key in custom)
      if (attributes[key] === true) variants.push(custom[key]);

  const merged = twMerge(
    base,
    variants,
    attributes?.class ? String(attributes.class) : undefined,
  );

  return attributes?.omit
    ? merged.replace(word(`(${attributes.omit.join("|")})`), "")
    : merged;
}
