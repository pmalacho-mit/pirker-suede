import type { HTMLAttributes, SvelteHTMLElements } from "svelte/elements";
import type { Expand, Split } from "../../suede/typescript-utils-suede";
import { word } from "../../suede/typescript-utils-suede/regex";
import type { Snippet } from "svelte";
import { twMerge } from "tailwind-merge";

type Omittable<
  Base extends string,
  Decorations extends Record<string, string>,
> = Expand<
  | Split<Base>[number]
  | Expand<
      {
        [K in keyof Decorations]: Split<Decorations[K]>[number];
      }[keyof Decorations]
    >
>;

export type StyledProps<
  Element extends keyof SvelteHTMLElements,
  Base extends string,
  Decorations extends Record<string, string>,
  WithChildren extends boolean = true,
> = SvelteHTMLElements[Element] &
  (WithChildren extends true ? { children: Snippet } : {}) & {
    [K in keyof Decorations]?: boolean;
  } & {
    omit?: Omittable<Base, Decorations>[];
  };

/**
 * Merges a base class string with optional element classes, with support for omitting
 * specific base tokens via `attributes.omit`.
 */
export function classify<Base extends string>(
  base: Base,
  attributes?: Pick<HTMLAttributes<HTMLElement>, "class"> & {
    omit?: Omittable<Base, {}>[];
  },
): string;
/**
 * Merges a base class string, enabled decoration class groups, and optional element
 * classes, then removes any tokens listed in `attributes.omit`.
 */
export function classify<
  Base extends string,
  Decorations extends Record<string, string>,
>(
  base: Base,
  attributes?: Pick<HTMLAttributes<HTMLElement>, "class"> & {
    omit?: Omittable<Base, Decorations>[];
  },
  decorations?: Decorations,
  settings?: Record<keyof Decorations, boolean>,
): string;
/** Implementation */
export function classify<
  Base extends string,
  Decorations extends Record<string, string>,
>(
  base: Base,
  attributes?: Pick<HTMLAttributes<HTMLElement>, "class"> & {
    omit?: Omittable<Base, Decorations>[];
  },
  decorations?: Decorations,
  settings?: Record<string, boolean>,
) {
  const merged =
    settings && decorations
      ? twMerge(
          base,
          ...Object.entries(settings)
            .filter(([_, enabled]) => enabled)
            .map(
              ([decoration, _]) => decorations[decoration as keyof Decorations],
            ),
          String(attributes?.class ?? ""),
        )
      : twMerge(base, String(attributes?.class ?? ""));

  return attributes?.omit
    ? merged.replace(word(`(${attributes.omit.join("|")})`), "")
    : merged;
}
