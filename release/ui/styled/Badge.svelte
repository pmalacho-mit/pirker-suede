<script lang="ts" module>
  export const base =
    /* tw: */ "inline-flex items-center justify-center gap-2 align-middle rounded-full text-sm w-fit h-6 px-2 bg-white text-gray-800 border border-gray-200";

  export const decorations = {
    primary: /* tw: */ "bg-blue-600 text-white border-blue-600",
    neutral: /* tw: */ "bg-gray-700 text-gray-100 border-gray-700",
    outline: /* tw: */ "bg-transparent border-current text-current",
    ghost: /* tw: */ "bg-gray-100 border-gray-100 text-gray-800",
    xs: /* tw: */ "h-4 text-[0.625rem] px-1",
    sm: /* tw: */ "h-5 text-xs px-1.5",
    lg: /* tw: */ "h-7 text-base px-3",
  } as const;

  export type Props = StyledProps<"span", typeof base, typeof decorations>;
</script>

<script lang="ts">
  import { classify, type StyledProps } from ".";

  let {
    children,
    primary = false,
    neutral = false,
    outline = false,
    ghost = false,
    xs = false,
    sm = false,
    lg = false,
    ...attributes
  }: Props = $props();
</script>

<span
  {...attributes}
  class={classify(base, attributes, decorations, {
    primary,
    neutral,
    outline,
    ghost,
    xs,
    sm,
    lg,
  })}
>
  {@render children()}
</span>
