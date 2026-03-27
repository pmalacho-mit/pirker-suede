<script lang="ts" module>
  export const base =
    /* tw: */ "absolute z-1 whitespace-nowrap top-0 right-0 translate-x-1/2 -translate-y-1/2";
  /**
   * Decorations here target the indicator item's position, not the container.
   * Default position is top-right.
   */
  export const decorations = {
    start: /* tw: */ "left-0 right-auto -translate-x-1/2",
    end: /* tw: */ "right-0 left-auto translate-x-1/2",
    center: /* tw: */ "left-1/2 right-auto -translate-x-1/2",
    top: /* tw: */ "top-0 bottom-auto -translate-y-1/2",
    bottom: /* tw: */ "top-auto bottom-0 translate-y-1/2",
    middle: /* tw: */ "top-1/2 bottom-auto -translate-y-1/2",
  } as const;

  export const containerBase = /* tw: */ "relative inline-flex w-max";

  export type Props = StyledProps<"span", typeof base, typeof decorations> & {
    item: Snippet;
    container?: StyledProps<"div", typeof containerBase, {}, false>;
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { classify, type StyledProps } from ".";
  let {
    children,
    item,
    start = false,
    center = false,
    bottom = false,
    middle = false,
    end = false,
    top = false,
    container,
    ...attributes
  }: Props = $props();
</script>

<div {...container ?? {}} class={classify(containerBase, container)}>
  <span
    class={classify(base, attributes, decorations, {
      start,
      center,
      bottom,
      middle,
      end,
      top,
    })}
  >
    {@render item()}
  </span>
  {@render children()}
</div>
