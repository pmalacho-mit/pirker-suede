<script lang="ts">
  import { enumify } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Checkbox, { decorations } from "./Checkbox.svelte";

  class Pocket {
    checked = $state(false);
  }
</script>

<Sweater
  body={async ({ set }) => {
    const pocket = new Pocket();
    set(pocket);
  }}
>
  {#snippet vest(pocket: Pocket)}
    <label class="flex items-center gap-2">
      <Checkbox bind:checked={pocket.checked} /> default
    </label>
    <div>(is checked: {pocket.checked})</div>
  {/snippet}
</Sweater>

{#each enumify(decorations)._values as decoration}
  <Sweater
    body={async ({ set }) => {
      const pocket = new Pocket();
      set(pocket);
    }}
  >
    {#snippet vest(pocket: Pocket)}
      <label class="flex items-center gap-2">
        <Checkbox {...{ [decoration]: true }} bind:checked={pocket.checked} />
        {decoration}
      </label>
      <div>(is checked: {pocket.checked})</div>
    {/snippet}
  </Sweater>
{/each}
