<script lang="ts" module>
  export const base =
    /* tw: */ "shrink appearance-none align-middle min-h-20 w-full py-2 px-3 bg-white rounded-lg text-sm border border-gray-300 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-gray-800 focus:border-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";
  export const variants = {
    ghost:
      /* tw: */ "bg-transparent border-transparent shadow-none focus:bg-white focus:border-transparent",
  } as const;
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import { classify, type StyledProps, type Variants } from "./utils.js";
  let {
    custom,
    ...attributes
  }: StyledProps<"textarea", typeof base, typeof variants, Custom, false> & {
    custom?: Custom;
  } = $props();
</script>

<textarea {...attributes} class={classify(base, attributes, variants, custom)}
></textarea>
