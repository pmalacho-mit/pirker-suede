<script lang="ts">
  import { Sweater } from "$dependencies/sweater-vest";
  import { tick } from "svelte";
  import Message, { Model, defaultHeader } from "./Message.svelte";
  import { Reactive } from "$lib/reactive.svelte";
  import { markdownStream } from "$lib/utils/markdown/Markdown.svelte";
</script>

{#snippet initial()}
  hey!
{/snippet}

<Sweater
  body={async ({ set }) => {
    const model = new Model({
      side: "left",
      renderables: (render) => ({
        body: render(initial),
      }),
    });
    set({ model });
    await tick();
    model.header.set((render) =>
      render(defaultHeader, { detail: "hi", stamp: "now" })
    );
    const content = Reactive.Make("hi");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    model.body.set((render) => render(markdownStream, content));
    setInterval(() => {
      content.value += " hi";
    }, 50);
  }}
>
  {#snippet vest({ model }: { model: Model })}
    <Message {model} />
  {/snippet}
</Sweater>
