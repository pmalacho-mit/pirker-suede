<script lang="ts" module>
  export const base =
    "styled-radio appearance-none w-6 h-6 shrink-0 cursor-pointer align-middle rounded-full border border-gray-300 bg-white transition-colors checked:bg-gray-700 checked:border-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:cursor-not-allowed disabled:opacity-20";
  export const decorations = {
    primary:
      /* tw: */ "checked:bg-blue-600 checked:border-blue-600 focus-visible:outline-blue-600",
    accent:
      /* tw: */ "checked:bg-teal-500 checked:border-teal-500 focus-visible:outline-teal-500",
    xs: /* tw: */ "w-4 h-4",
    sm: /* tw: */ "w-5 h-5",
    lg: /* tw: */ "w-7 h-7",
  } as const;

  type Props<Group, Value extends Group> = Omit<
    StyledProps<"input", typeof base, typeof decorations, false>,
    "value" | "group"
  > & {
    group: Group;
    value: Value;
  };
</script>

<script lang="ts" generics="Group, Value extends Group">
  import { classify, type StyledProps } from ".";
  let {
    primary = false,
    accent = false,
    xs = false,
    sm = false,
    lg = false,
    value,
    group = $bindable(),
    ...attributes
  }: Props<Group, Value> = $props();
</script>

<input
  type="radio"
  {...attributes}
  {value}
  bind:group
  class={classify(base, attributes, decorations, {
    primary,
    accent,
    xs,
    sm,
    lg,
  })}
/>

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3ccircle cx='8' cy='8' r='3'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-position: center;
    background-repeat: no-repeat;
  }
</style>
