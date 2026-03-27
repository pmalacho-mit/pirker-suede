<script lang="ts" module>
  import { x, paperAirplane } from "./Icons.svelte";
  import { hasNonWhiteSpace } from "../../suede/typescript-utils-suede/regex.js";
  import { fade } from "svelte/transition";
  import { renderable, renderer } from "../../suede/snippet-renderer-suede";
  import { Reactive } from "../../suede/svelte-utils-suede/reactive.svelte.js";
  import type { KeyboardEventHandler } from "svelte/elements";
  import {
    type EventOnElement,
    type Expand,
    type WithValue,
  } from "../../suede/typescript-utils-suede";
  import {
    enumify,
    type Enumified,
  } from "../../suede/typescript-utils-suede/enum.js";
  import { WithEvents } from "../../suede/with-events-suede";
  import { SvelteMap } from "svelte/reactivity";
  import AttachmentIndicator, {
    type Model as AttachmentIndicatorModel,
  } from "./AttachmentIndicator.svelte";

  const textAreaUtility = {
    growOnInput: ({ currentTarget }: EventOnElement<HTMLTextAreaElement>) => {
      currentTarget.style.height = "auto";
      currentTarget.style.height = currentTarget.scrollHeight + "px";
    },
    resetOnContentClear: (node: HTMLElement, content: WithValue<string>) => {
      $effect(() => {
        if (content.value === "") node.style.height = "auto";
      });
    },
  };

  export { textArea, sendButton, cancelButton, instructions };

  const mode = enumify("send", "cancel");
  type Mode = Enumified<typeof mode>;

  export const defaultPlaceholder = "Type your message...";

  export type Events = {
    send: [value: string];
    complete: [];
    cancel: [];
    keypress: [event: KeyboardEvent];
  };

  export class Model extends WithEvents<Events> {
    mode = $state<Mode>(mode.send);
    placeholder = $state(defaultPlaceholder);

    readonly inputOverlay = renderable("single");
    readonly above = renderable("multi");
    readonly attachmentIndicators: Omit<
      SvelteMap<string, AttachmentIndicatorModel>,
      "delete"
    > = new SvelteMap();

    constructor(
      initial?: Expand<
        {
          mode?: Mode;
        } & renderable.Initial<Model>
      >,
    ) {
      super();
      this.mode = initial?.mode ?? mode.send;
      renderable.init<Model>(this, initial);
    }

    removeAttachmentIndicator(key: string, skipUnsubscribe = false) {
      if (!skipUnsubscribe) this.attachmentIndicators.get(key)?.clear();
      (this.attachmentIndicators as SvelteMap<string, any>).delete(key);
    }
  }
</script>

<script lang="ts">
  import Button from "../styled/Button.svelte";

  type Props = {
    model: Model;
  };

  let { model }: Props = $props();

  const content = Reactive.Make("");

  const sendDisabled = $derived(
    model.mode === mode.send &&
      (!content.value || !hasNonWhiteSpace(content.value)),
  );

  const textDisabled = $derived(
    Boolean(model.inputOverlay.current) || model.mode === mode.cancel,
  );

  const send = () => {
    content.value = content.value.trim();
    model.fire("send", content.value);
    content.value = "";
  };

  const onTextAreaKeydown = (event: KeyboardEvent) => {
    model.fire("keypress", event);
    const { key, shiftKey } = event;
    if (key === "Enter") {
      if (shiftKey) return;
      if (!sendDisabled) send();
      event.preventDefault();
    }
  };

  $effect(() => {
    if (model.mode === "cancel" && content.value !== "") content.value = "";
  });
</script>

<div>
  {@render renderer(model.above)}
  <div class="w-full px-2 pt-2">
    <div class="flex flex-col">
      <div class="join join-vertical bg-white rounded-t-lg rounded-b-lg">
        <div class="w-full flex flex-row relative join-item">
          <div class="flex-1 flex h-full relative border-none">
            {@render textArea(
              content,
              model,
              onTextAreaKeydown,
              textDisabled,
              model.inputOverlay,
            )}
          </div>
          <div class="absolute right-0 flex h-full">
            {#if model.mode === mode.send}
              {@render sendButton(send, sendDisabled)}
            {:else}
              {@render cancelButton(() => model.fire("cancel"))}
            {/if}
          </div>
        </div>
        <div class="w-full join-item indicator">
          <span
            class="indicator-item indicator-start text-xs badge border-none translate-x-2.5 -translate-y-2 pb-0"
            style:color="var(--neutral-medium)"
          >
            Attachments:
          </span>
          <div
            class="mt-0 w-full px-2 py-2 flex flex-row flex-wrap justify-center"
          >
            {#each model.attachmentIndicators as [key, indicator] (key)}
              <div class="mt-2 mb-0">
                <AttachmentIndicator model={indicator} />
              </div>
            {/each}
          </div>
        </div>
      </div>
      <div>
        {@render instructions()}
      </div>
    </div>
  </div>
</div>

{#snippet textArea(
  state: WithValue<string>,
  provider: { placeholder: string },
  onkeydown: KeyboardEventHandler<HTMLTextAreaElement>,
  disabled: boolean,
  overlay: renderable.Returns<"single", "optional">,
)}
  <textarea
    {onkeydown}
    {disabled}
    bind:value={state.value}
    use:textAreaUtility.resetOnContentClear={state}
    class="textarea pr-12 pl-1 w-full overflow-y-hidden border-none resize-none rounded-lg text-neutral-dark"
    placeholder={provider.placeholder}
    oninput={textAreaUtility.growOnInput}
  >
  </textarea>
  {#if overlay.current}
    <div
      in:fade
      out:fade
      class="absolute top-0 left-0 w-full h-full flex flex-col items-center place-content-center"
    >
      <div
        class="bg-yellow-200 p-2 rounded-lg shadow-md z-50"
        style:max-width="90%"
      >
        {@render renderer(overlay)}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet sendButton(onclick: () => void, disabled: boolean)}
  <Button class="h-full p-0 grow" primary {disabled} {onclick}>
    <center class="m-auto mr-2">
      {@render paperAirplane()}
    </center>
  </Button>
{/snippet}

{#snippet cancelButton(onclick: () => void)}
  <Button
    class="h-full p-0 bg-pink-300 border-pink-300 hover:bg-pink-400"
    {onclick}
  >
    <center class="m-auto text-white px-1">
      <Button circle class="w-8 h-8  fill-pink-300 bg-pink-200 hover:bg-white">
        {@render x({ width: "2rem", height: "2rem" })}
      </Button>
    </center>
  </Button>
{/snippet}

{#snippet instructions()}
  {@const spacing = "0.125rem"}
  <div
    class="relative py-2 text-center text-xs text-token-text-secondary text-neutral-dark"
  >
    <span class="whitespace-nowrap border-solid">
      <kbd class="kbd kbd-sm">Enter</kbd>
    </span>
    sends
    <div class="inline-block relative" style:margin-right={spacing}>
      <div
        class="absolute bg-base-content h-6 -my-4"
        style:width="0.075rem"
      ></div>
    </div>

    <span class="whitespace-nowrap ml-0">
      <kbd class="kbd kbd-sm">Shift</kbd>+<kbd
        class="kbd kbd-sm"
        style:margin-right={spacing}>Enter</kbd
      >creates new line
    </span>
  </div>
{/snippet}
