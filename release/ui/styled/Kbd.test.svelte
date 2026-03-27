<script lang="ts">
  import { enumify } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Kbd, { decorations } from "./Kbd.svelte";
</script>

{#each enumify(decorations)._values as decoration}
  <Sweater body={async () => {}}>
    {#snippet vest(pocket: {})}
      <Kbd {...{ [decoration]: true }}>{decoration}</Kbd>
    {/snippet}
  </Sweater>
{/each}
