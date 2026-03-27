<script lang="ts">
  import {
    enumify,
    type Enumified,
  } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Radio, { decorations } from "./Radio.svelte";
  const decs = enumify(decorations);
  type Decoration = Enumified<typeof decs>;

  let group: Decoration = $state("primary");
</script>

<Sweater body={async () => {}}>
  {#snippet vest(pocket: {})}
    {#each enumify(decorations)._values as decoration}
      <label class="flex items-center gap-2">
        <Radio
          {...{ [decoration]: true }}
          bind:group
          name={decoration}
          value={decoration}
        />
        {decoration}
      </label>
    {/each}
  {/snippet}
</Sweater>
