<script lang="ts" module>
  export const base =
    /* tw: */ "inline-flex items-center justify-center align-middle px-[0.5em] h-6 min-w-6 text-sm bg-gray-200 rounded-lg border border-gray-300 border-b-2";
  export const variants = {
    xs: /* tw: */ "h-4 min-w-4 text-[0.625rem]",
    sm: /* tw: */ "h-5 min-w-5 text-xs",
    lg: /* tw: */ "h-7 min-w-7 text-base",
  } as const;
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import { classify, type StyledProps, type Variants } from "./utils.js";
  let {
    children,
    custom,
    ...attributes
  }: StyledProps<"kbd", typeof base, typeof variants, Custom> & {
    custom?: Custom;
  } = $props();
</script>

<kbd {...attributes} class={classify(base, attributes, variants, custom)}>
  {@render children()}
</kbd>
