<script lang="ts" module>
  import Message, { Model as MessageModel } from "./Message.svelte";
  import Input, { Model as InputModel } from "./Input.svelte";

  export class Model {
    input: InputModel;
    messages = $state<MessageModel[]>([]);

    constructor(
      initial?: Partial<{ input: InputModel; messages: MessageModel[] }>
    ) {
      this.input = initial?.input ?? new InputModel({ mode: "send" });
      if (initial?.messages) this.messages.push(...initial.messages);
    }
  }
</script>

<script lang="ts">
  import { scrollDown } from "$lib/utils";

  type Props = {
    model: Model;
    classes?: string;
  };

  let { model, classes }: Props = $props();

  let container = $state<HTMLDivElement>();

  const autoScroll = () => container && scrollDown(container);

  const lastMessage = $derived(model.messages[model.messages.length - 1]);

  $effect(() => {
    if (lastMessage?.renderedHeight > 0) autoScroll();
  });

  console.log("Window!");
</script>

<div
  class={`flex flex-col h-full relative bg-neutral-light text-neutral-dark ${classes ?? ""}`}
  style:padding-left="2px"
  style:padding-right="2px"
>
  <div
    class="flex-grow max-h-full overflow-y-scroll bg-white rounded-b-lg border-none"
    bind:this={container}
  >
    {#each model.messages as message}
      <Message model={message} />
    {/each}
  </div>
  <Input model={model.input} />
</div>
