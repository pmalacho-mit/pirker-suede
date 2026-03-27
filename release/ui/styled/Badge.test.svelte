<script lang="ts">
  import { enumify } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Badge, { decorations } from "./Badge.svelte";
</script>

{#each enumify(decorations)._values as decoration}
  <Sweater body={async () => {}}>
    {#snippet vest(pocket: {})}
      <Badge {...{ [decoration]: true }}>{decoration}</Badge>
    {/snippet}
  </Sweater>
{/each}
