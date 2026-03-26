<script lang="ts" module>
  export { x, paperAirplane, edit };

  export type Props = {
    width?: string | number;
    height?: string | number;
    classes?: string[];
  };
</script>

{#snippet edit({ width = 24, height = 24, classes }: Props)}
  <svg
    class="feather feather-edit {classes?.join(' ') ?? ''}"
    fill="none"
    {height}
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
    viewBox="0 0 24 24"
    {width}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
{/snippet}

{#snippet x({ width = "1rem", height = "1rem", classes }: Props)}
  <svg
    class={classes?.join(" ") ?? ""}
    xmlns="http://www.w3.org/2000/svg"
    {width}
    {height}
    viewBox="0 0 512 512"
  >
    <polygon
      points="400 145.49 366.51 112 256 222.51 145.49 112 112 145.49 222.51 256 112 366.51 145.49 400 256 289.49 366.51 400 400 366.51 289.49 256 400 145.49"
    />
  </svg>
{/snippet}

{#snippet paperAirplane()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    class="h-6 w-6 ml-2 transform rotate-90"
  >
    <path
      d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
    >
    </path>
  </svg>
{/snippet}
