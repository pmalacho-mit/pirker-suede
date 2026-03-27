<script lang="ts">
  import { Sweater } from "../../suede/sweater-vest-suede";
  import WithIndicator from "./WithIndicator.svelte";
  import Badge from "./Badge.svelte";

  const horizontal = ["start", "center", "end"] as const;
  const vertical = ["top", "middle", "bottom"] as const;

  const combinations = horizontal.flatMap((h) =>
    vertical.map((v) => ({ [h]: true, [v]: true })),
  );
</script>

<Sweater config orientation="vertical" />
{#each combinations as setting}
  <Sweater body={async () => {}}>
    {#snippet vest(pocket: {})}
      <div class="m-auto w-max">
        <WithIndicator {...setting}>
          {#snippet item()}
            <Badge xs>{Object.keys(setting).join(", ")}</Badge>
          {/snippet}
          <div class="bg-gray-200 rounded-lg w-16 h-16"></div>
        </WithIndicator>
      </div>
    {/snippet}
  </Sweater>
{/each}
