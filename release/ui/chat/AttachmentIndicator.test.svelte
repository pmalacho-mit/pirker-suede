<script lang="ts">
  import { Sweater } from "../../suede/sweater-vest-suede";
  import AttachmentIndicator, { Model } from "./AttachmentIndicator.svelte";

  void Sweater, AttachmentIndicator, Model;
</script>

{#snippet dummy(content: string)}
  {content}
{/snippet}

<Sweater config>
  <Sweater
    name="check"
    body={async ({ set, fn, expect, withUserFocus, container, findByRole }) => {
      const model = new Model({
        checked: false,
        renderables: (render) => ({
          label: render(dummy, "hello"),
        }),
      });
      set({ model });
      const checked = fn(() => {});
      model.subscribe({ checked });
      const checkbox = await findByRole(container, "checkbox");
      await withUserFocus(async (userEvent) => {
        await userEvent.click(checkbox);
      });
      expect(checked).toHaveBeenCalledWith(model, true);
    }}
  >
    {#snippet vest({ model }: { model: Model })}
      <AttachmentIndicator {model} />
    {/snippet}
  </Sweater>
  <Sweater
    name="edit and change snippet"
    body={async ({
      set,
      fn,
      expect,
      withUserFocus,
      container,
      findByRole,
      findByText,
    }) => {
      const model = new Model({
        renderables: (render) => ({
          label: render(dummy, "hello"),
        }),
      });
      set({ model });
      const snippet = await findByText(container, "hello");
      const edit = fn(() => {
        model.label.set((render) => render(dummy, "world"));
      });
      model.subscribe({ edit });
      const button = await findByRole(container, "button");
      await withUserFocus(async (userEvent) => {
        await userEvent.click(button);
      });
      expect(edit).toHaveBeenCalledOnce();
      expect(snippet).toHaveTextContent("world");
    }}
  >
    {#snippet vest({ model }: { model: Model })}
      <AttachmentIndicator {model} />
    {/snippet}
  </Sweater>
</Sweater>
