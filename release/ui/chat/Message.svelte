<!--
  @component A message bubble in a chat
-->
<script lang="ts" module>
  import {
    multipleChoice,
    type Model as MultipleChoiceModel,
  } from "$lib/multiple-choice/MultipleChoice.svelte";
  import type { WithValue } from "$lib/utils";
  import {
    markdownStream,
    staticMarkdown,
  } from "$lib/utils/markdown/Markdown.svelte";
  import SnippetRenderer, {
    type RenderableSnippet,
    type InitialRenderables,
    renderable,
    type Renderables,
    render,
  } from "$lib/utils/SnippetRenderer.svelte";
  import { stamp } from "$lib/utils/time";

  type Button = { content: RenderableSnippet<any>; action: () => void };
  type Side = "left" | "right";

  export class Model {
    readonly side: Side;
    renderedHeight = $state<number>(0);

    readonly header = renderable("single");
    readonly body = renderable("multi");
    readonly buttons = renderable<Button>("multi");

    constructor(
      initial: {
        side: Side;
      } & InitialRenderables<Model>
    ) {
      this.side = initial.side;
      renderable.init<Model>(this, initial);
    }

    withDefaultHeader(detail: string, _stamp?: string) {
      this.header.set((render) =>
        render(defaultHeader, { detail, stamp: _stamp ?? stamp() })
      );
      return this;
    }

    /**
     * @param value
     * @param method default append
     */
    withStaticMarkdownBody(value: string, method: "set" | "append" = "append") {
      this.body[method]((render) => render(staticMarkdown, value));
      return this;
    }

    /**
     * @param value
     * @param method default append
     */
    withMarkdownStreamBody(
      value: WithValue<string>,
      method: "set" | "append" = "append"
    ) {
      this.body[method]((render) => render(markdownStream, value));
      return this;
    }

    /**
     * @param model
     * @param method default append
     */
    withMultipleChoiceBody(
      model: MultipleChoiceModel,
      method: "set" | "append" = "append"
    ) {
      this.body[method]((render) => render(multipleChoice, { model }));
    }

    /**
     * @param value
     * @param method default append
     */
    withStaticTextBody(value: string, method: "set" | "append" = "append") {
      this.body[method](render.text(value));
      return this;
    }

    withDynamicTextBody(
      value: WithValue<string>,
      method: "set" | "append" = "append"
    ) {
      this.body[method](render.dynamicText(value));
      return this;
    }

    withBody(getSnippet: Parameters<Model["body"]["append"]>[0]) {
      this.body.append(getSnippet);
      return this;
    }
  }

  export { defaultHeader, divider };

  export const renderables = {
    messageHeader:
      (detail: string, _stamp?: string): Renderables<Model, "header"> =>
      (render) => ({
        header: render(defaultHeader, {
          detail,
          stamp: _stamp ?? stamp(),
        }),
      }),
    staticMessage:
      (
        value: string,
        detail: string,
        _stamp?: string
      ): Renderables<Model, "header" | "body"> =>
      (render) => ({
        ...renderables.messageHeader(detail, _stamp),
        body: render(staticMarkdown, value),
      }),
  } satisfies Record<string, (...args: any[]) => Renderables<Model, "header">>;
</script>

<script lang="ts">
  type Props = {
    model: Pick<
      Model,
      "side" | "renderedHeight" | "header" | "body" | "buttons"
    >;
  };

  let { model }: Props = $props();
</script>

<div
  class="chat"
  class:chat-start={model.side === "left"}
  class:chat-end={model.side === "right"}
  bind:clientHeight={model.renderedHeight}
>
  {#if model.header.current}
    <div class="chat-header">
      <SnippetRenderer {...model.header.current} />
    </div>
  {/if}
  <div class="chat-bubble bg-neutral-medium !text-white">
    {#if model.body.current}
      {#each model.body.current as body}
        <SnippetRenderer {...body} />
      {/each}
    {:else}
      <span class="loading loading-dots loading-md"></span>
    {/if}
  </div>
  <div class="chat-footer">
    {#if model.buttons.current}
      <div class="join">
        {#each model.buttons.current as { content, action }}
          <button class="btn btn-xs btn-warning join-item" onclick={action}>
            <SnippetRenderer {...content} />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#snippet defaultHeader({ detail, stamp }: { detail: string; stamp: string })}
  <div class="chat-header">
    {detail}
    {#if stamp}
      <time class="text-xs opacity-50">{stamp}</time>
    {/if}
  </div>
{/snippet}

{#snippet divider(text: string)}
  <div class="divider my-1" style:--divider-color="white">
    <span class="text-sm italic text-white">{text}</span>
  </div>
{/snippet}
