<!--
  @component General description of the component
-->
<script lang="ts" module>
  import Self from "./ResponseModeSelector.svelte";

  export class Model<Mode extends string> {
    current = $state<Mode>("" as Mode);
    modes = $state(new Array<Mode>());

    constructor(initial: { setting?: Mode; options: Mode[] }) {
      this.current = initial?.setting ?? initial.options[0];
      this.modes.push(...initial.options);
    }
  }

  export { responseModeSelector };
</script>

<script lang="ts" generics="Options extends string">
  import Radio from "../../suede/svelte-styled-suede/Radio.svelte";

  type Props = {
    model: Model<Options>;
  };

  let { model }: Props = $props();
</script>

<div>
  <div class="text-xs mx-2 mt-1 text-neutral-medium">Response mode:</div>
  <div class="mx-1 my-0 flex flex-row">
    {#each model.modes as option}
      <div
        class="flex flex-row rounded-xl mx-1 align-center items-center gap-1"
      >
        <Radio
          customized={{}}
          value={option}
          bind:group={model.current}
          xs
          primary
        />
        <span class="text-sm text-neutral-medium">
          {option}
        </span>
      </div>
    {/each}
  </div>
</div>

{#snippet responseModeSelector(model: Model<string>)}
  <Self {model} />
{/snippet}
