<script lang="ts" module>
  import type {
    TestHarness,
    PocketElements,
  } from "../../suede/sweater-vest-suede";
  import { tick } from "svelte";

  async function elements<T extends PocketElements>(
    { container, findByRole }: TestHarness<T>,
    doTick: boolean = true,
  ) {
    if (doTick) await tick();

    const [textArea, button] = await Promise.all([
      findByRole<HTMLTextAreaElement>(container, "textbox"),
      findByRole<HTMLButtonElement>(container, "button"),
    ]);

    return { textArea, button };
  }

  const attachment = (model: InputModel, key: string, text: string) =>
    model.attachmentIndicators.set(
      key,
      new AttachmentIndicatorModel({
        renderables: (render) => ({
          label: render(dummyAttachmentIndicator, text),
        }),
      }),
    );
</script>

<script lang="ts">
  import { Sweater } from "../../suede/sweater-vest-suede";
  import Input, { Model as InputModel } from "./Input.svelte";
  import { Model as AttachmentIndicatorModel } from "./AttachmentIndicator.svelte";
  import {
    responseModeSelector,
    Model as ResponseModeModel,
  } from "./ResponseModeSelector.svelte";
</script>

<Sweater config category="modes">
  <Sweater
    body={async ({ set }) => {
      set({ model: new InputModel({ mode: "send" }) });
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
  <Sweater
    body={async ({ set }) => {
      set({ model: new InputModel({ mode: "cancel" }) });
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
</Sweater>

{#snippet dummyOverlay()}
  <div>
    <p>Hello, world!</p>
  </div>
{/snippet}

{#snippet dummyResponseModes()}
  {@render responseModeSelector(
    new ResponseModeModel({
      options: ["send", "multichoice"] as const,
    }),
  )}
{/snippet}

<Sweater config category="filling snippets">
  <Sweater
    name="overlay"
    body={async ({ set }) => {
      const model = new InputModel({ mode: "send" });
      set({ model });
      model.inputOverlay.set((render) => render(dummyOverlay));
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
  <Sweater
    name="above (response mode)"
    body={async ({ set }) => {
      const model = new InputModel({ mode: "send" });
      set({ model });
      model.above.append((render) => render(dummyResponseModes));
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config category="interactions">
  <Sweater
    name="type and send and set cancel"
    body={async (harness) => {
      const { set, fn, withUserFocus, expect } = harness;
      const model = new InputModel({ mode: "send" });
      set({ model });
      const text = "Hello, world!";
      const send = fn(() => (model.mode = "cancel"));
      model.subscribe({ send });
      const { textArea, button } = await elements(harness);
      await withUserFocus(async (userEvent) => {
        await userEvent.type(textArea, text, { delay: 100 });
        await userEvent.click(button);
      });
      expect(send).toHaveBeenCalledWith(model, text);
      expect(textArea).toBeDisabled();
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
  <Sweater
    name="cancel"
    body={async (harness) => {
      const { set, fn, withUserFocus, expect, delay } = harness;
      const model = new InputModel({ mode: "cancel" });
      set({ model });
      const cancel = fn(() => (model.mode = "send"));
      model.subscribe({ cancel });
      const { button, textArea } = await elements(harness);
      expect(textArea).toBeDisabled();
      await withUserFocus(async (userEvent) => {
        await delay({ seconds: 0.25 });
        await userEvent.click(button);
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(textArea).not.toBeDisabled();
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config category="attachments">
  <Sweater
    name="basic"
    body={async ({ set }) => {
      const model = new InputModel({ mode: "cancel" });
      set({ model });
      attachment(model, "x", "hello");
      attachment(model, "y", "world");
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
  <Sweater
    name="dynamic"
    body={async ({ set, delay }) => {
      const model = new InputModel({ mode: "cancel" });
      set({ model });
      attachment(model, "x", "hello");
      await delay({ seconds: 0.5 });
      attachment(model, "y", "world");
      await delay({ seconds: 0.5 });
      model.removeAttachmentIndicator("x");
      await delay({ seconds: 1 });
      attachment(model, "x", "hello");
      await delay({ seconds: 0.5 });
      model.removeAttachmentIndicator("y");
      model.removeAttachmentIndicator("x");
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
  <Sweater
    name="many"
    body={async ({ set, delay }) => {
      const model = new InputModel({ mode: "cancel" });
      set({ model });
      for (let i = 0; i < 10; i++) {
        await delay({ seconds: 0.25 });
        attachment(model, `${i}`, `hello ${i}`);
      }
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config category="misc">
  <Sweater
    name="placeholder"
    body={async ({ set }) => {
      const model = new InputModel({ mode: "send" });
      set({ model });
      await tick();
      model.placeholder = "What's on your mind?";
    }}
  >
    {#snippet vest({ model }: { model: InputModel })}
      <Input {model} />
    {/snippet}
  </Sweater>
</Sweater>

{#snippet dummyAttachmentIndicator(a: string)}
  {a}
{/snippet}
