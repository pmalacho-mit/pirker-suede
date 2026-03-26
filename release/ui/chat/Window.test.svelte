<script lang="ts" module>
  export { inWindowLayout };
</script>

<script lang="ts">
  import { Sweater } from "$dependencies/sweater-vest";
  import { Reactive } from "$lib/reactive.svelte";
  import { tick } from "svelte";
  import { Model as MessageModel, renderables } from "./Message.svelte";
  import Window, { Model } from "./Window.svelte";
  import { Performance, randomLoremMarkdownSubset } from "$lib/utils/testing";
  import Layout, { configure } from "$lib/layout/Layout.svelte";
  import { markdownStream } from "$lib/utils/markdown/Markdown.svelte";
</script>

{#snippet inWindowLayout(model: Model)}
  <Layout
    configuration={configure(({ split, panel }) =>
      split(panel("svelte", Window, { props: { model } }))
    )}
  />
{/snippet}

<Sweater config>
  <Sweater
    name="simulated turn taking"
    body={async ({ set, delay }) => {
      const model = new Model();
      set({ model });
      const addMessagePerformance = new Performance({ key: "Add Message" });
      const renderStreamPerformance = new Performance({
        key: "Render Stream",
      });

      let side: "left" | "right" = "right";
      while (true) {
        const message = new MessageModel({ side });
        addMessagePerformance.analyze(async () => {
          model.messages.push(message);
          await tick();
        });
        await delay({ seconds: 0.5 });
        const stream = Reactive.Make("");
        message.body.set((render) => render(markdownStream, stream));
        const lines = Math.floor(Math.random() * 10) + 1;
        const content = randomLoremMarkdownSubset(lines);
        for (const char of content) {
          await delay({ milliseconds: 5 });
          renderStreamPerformance.analyze(async () => {
            stream.value += char;
            await tick();
          });
        }
        side = side === "right" ? "left" : "right";
      }
    }}
  >
    {#snippet vest({ model }: { model: Model })}
      <div class="h-screen">
        <Window {model} />
      </div>
    {/snippet}
  </Sweater>
  <Sweater
    name="within flex layout"
    body={async ({ set, delay }) => {
      const model = new Model();
      model.input.subscribe({
        async send(input, value) {
          input.mode = "cancel";
          let canceled = false;
          const unsub = input.subscribe({
            cancel: () => {
              canceled = true;
            },
          });
          const request = new MessageModel({
            side: "right",
            renderables: renderables.staticMessage(value, "You"),
          });
          const response = new MessageModel({
            side: "left",
            renderables: renderables.messageHeader("Tutor"),
          });
          model.messages.push(request, response);
          await delay({ milliseconds: 200 });
          const stream = Reactive.Make("");
          response.body.set((render) => render(markdownStream, stream));
          const lines = Math.floor(Math.random() * 10) + 1;
          const content = randomLoremMarkdownSubset(lines);
          for (const char of content) {
            await delay({ milliseconds: 5 });
            if (canceled) break;
            stream.value += char;
          }
          unsub();
          input.mode = "send";
        },
      });
      set({ model });
    }}
  >
    {#snippet vest({ model }: { model: Model })}
      <div class="h-screen w-full">
        {@render inWindowLayout(model)}
      </div>
    {/snippet}
  </Sweater>
</Sweater>
