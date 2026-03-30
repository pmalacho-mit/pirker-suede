<script lang="ts" module>
  export const base =
    /* tw: */ "absolute z-1 whitespace-nowrap top-0 right-0 translate-x-1/2 -translate-y-1/2";
  /**
   * Decorations here target the indicator item's position, not the container.
   * Default position is top-right.
   */
  export const variants = {
    start: /* tw: */ "left-0 right-auto -translate-x-1/2",
    end: /* tw: */ "right-0 left-auto translate-x-1/2",
    center: /* tw: */ "left-1/2 right-auto -translate-x-1/2",
    top: /* tw: */ "top-0 bottom-auto -translate-y-1/2",
    bottom: /* tw: */ "top-auto bottom-0 translate-y-1/2",
    middle: /* tw: */ "top-1/2 bottom-auto -translate-y-1/2",
  } as const;

  export const containerBase = /* tw: */ "relative inline-flex w-max";
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import type { Snippet } from "svelte";
  import { classify, type StyledProps, type Variants } from "./utils.js";
  let {
    children,
    indicator,
    custom,
    container,
    ...attributes
  }: StyledProps<"span", typeof base, typeof variants, Custom> & {
    custom?: Custom;
    indicator: Snippet;
    container?: StyledProps<"div", typeof containerBase, {}, {}, false>;
  } = $props();
</script>

<div {...container ?? {}} class={classify(containerBase, container)}>
  <span class={classify(base, attributes, variants, custom)}>
    {@render indicator()}
  </span>
  {@render children()}
</div>
