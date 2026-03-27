<script lang="ts">
  import { enumify } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Button, { decorations } from "./Button.svelte";
</script>

{#each enumify(decorations)._values as decoration}
  <Sweater body={async () => {}}>
    {#snippet vest(pocket: {})}
      <Button {...{ [decoration]: true }}>{decoration}</Button>
    {/snippet}
  </Sweater>
{/each}
