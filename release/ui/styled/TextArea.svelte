<script lang="ts" module>
  export const base =
    /* tw: */ "shrink appearance-none align-middle min-h-20 w-full py-2 px-3 bg-white rounded-lg text-sm border border-gray-300 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-gray-800 focus:border-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";
  export const decorations = {
    ghost:
      /* tw: */ "bg-transparent border-transparent shadow-none focus:bg-white focus:border-transparent",
  } as const;

  export type Props = StyledProps<
    "textarea",
    typeof base,
    typeof decorations,
    false
  >;
</script>

<script lang="ts">
  import { classify, type StyledProps } from ".";
  let { ghost = false, ...attributes }: Props = $props();
</script>

<textarea
  {...attributes}
  class={classify(base, attributes, decorations, { ghost })}
></textarea>
