<script lang="ts" module>
  export const base =
    /* tw: */ "inline-flex items-stretch *:rounded-none [&>*:first-child]:rounded-s-lg [&>*:last-child]:rounded-e-lg [&>*:not(:first-child)]:-ms-px";

  export const variants = {
    vertical:
      /* tw: */ "flex-col [&>*:first-child]:rounded-s-none [&>*:first-child]:rounded-ss-lg [&>*:first-child]:rounded-se-lg [&>*:last-child]:rounded-e-none [&>*:last-child]:rounded-es-lg [&>*:last-child]:rounded-ee-lg [&>*:not(:first-child)]:ms-0 [&>*:not(:first-child)]:-mt-px",
  } as const;
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import { classify, type StyledProps, type Variants } from "./utils.js";

  let {
    children,
    custom,
    ...attributes
  }: StyledProps<"div", typeof base, typeof variants, Custom> & {
    custom?: Custom;
  } = $props();
</script>

<div {...attributes} class={classify(base, attributes, variants, custom)}>
  {@render children()}
</div>
