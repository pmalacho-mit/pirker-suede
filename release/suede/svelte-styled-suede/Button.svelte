<script lang="ts" module>
  export const base =
    /* tw: */ "inline-flex shrink-0 cursor-pointer flex-nowrap items-center justify-center gap-1.5 text-center align-middle select-none px-4 h-10 text-sm font-semibold rounded-lg bg-gray-200 border border-gray-300 disabled:border-gray-200 transition-colors duration-200 ease-out hover:bg-gray-300 active:bg-gray-350 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none";

  export const variants = {
    blue600:
      /* tw: */ "bg-blue-600 text-white hover:bg-blue-700 border-blue-700",
    warning:
      /* tw: */ "bg-amber-400 text-amber-900 hover:bg-amber-500 border-amber-500",
    xs: /* tw: */ "text-xs px-2 h-6",
    circle: /* tw: */ "rounded-full p-0 w-10 h-10",
  } as const;
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import { classify, type StyledProps, type Variants } from "./utils.js";

  let {
    children,
    custom,
    ...attributes
  }: StyledProps<"button", typeof base, typeof variants, Custom> & {
    custom?: Custom;
  } = $props();
</script>

<button {...attributes} class={classify(base, attributes, variants, custom)}>
  {@render children()}
</button>
