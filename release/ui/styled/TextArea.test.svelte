<script lang="ts">
  import { enumify } from "../../suede/typescript-utils-suede/enum.js";
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Textarea, { decorations } from "./TextArea.svelte";
</script>

<Sweater body={async () => {}}>
  {#snippet vest(pocket: {})}
    <Textarea placeholder="default" />
  {/snippet}
</Sweater>
{#each enumify(decorations)._values as decoration}
  <Sweater body={async () => {}}>
    {#snippet vest(pocket: {})}
      <Textarea {...{ [decoration]: true }} placeholder={decoration} />
    {/snippet}
  </Sweater>
{/each}
