<script lang="ts" module>
  export const base =
    /* tw: */ "inline-flex items-center justify-center align-middle px-[0.5em] h-6 min-w-6 text-sm bg-gray-200 rounded-lg border border-gray-300 border-b-2";
  export const decorations = {
    xs: /* tw: */ "h-4 min-w-4 text-[0.625rem]",
    sm: /* tw: */ "h-5 min-w-5 text-xs",
    lg: /* tw: */ "h-7 min-w-7 text-base",
  } as const;

  export type Props = StyledProps<"kbd", typeof base, typeof decorations>;
</script>

<script lang="ts">
  import { classify, type StyledProps } from ".";
  let {
    children,
    xs = false,
    sm = false,
    lg = false,
    ...attributes
  }: Props = $props();
</script>

<kbd
  {...attributes}
  class={classify(base, attributes, decorations, { xs, sm, lg })}
>
  {@render children()}
</kbd>
