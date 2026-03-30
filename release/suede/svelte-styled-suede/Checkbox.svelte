<script lang="ts" module>
  export const base =
    /* tw: */ "appearance-none w-6 h-6 shrink-0 cursor-pointer align-middle rounded border border-gray-300 bg-white transition-colors checked:bg-gray-700 checked:border-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:cursor-not-allowed disabled:opacity-20";
  export const variants = {
    primary:
      /* tw: */ "checked:bg-blue-600 checked:border-blue-600 focus-visible:outline-blue-600",

    xs: /* tw: */ "w-4 h-4",
    sm: /* tw: */ "w-5 h-5",
    lg: /* tw: */ "w-7 h-7",
  } as const;
</script>

<script lang="ts" generics="Custom extends Variants.Constraint">
  import { classify, type StyledProps, type Variants } from "./utils.js";
  let {
    checked = $bindable(),
    custom,
    ...attributes
  }: StyledProps<"input", typeof base, typeof variants, Custom, false> & {
    custom?: Custom;
  } = $props();
</script>

<input
  type="checkbox"
  bind:checked
  {...attributes}
  class={classify(base, attributes, variants, custom)}
/>

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-position: center;
    background-repeat: no-repeat;
  }
</style>
