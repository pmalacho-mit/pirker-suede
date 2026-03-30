<script lang="ts" module>
  import { WithEvents } from "../../suede/with-events-suede";
  import { renderer, renderable } from "../../suede/snippet-renderer-suede";

  export class Model extends WithEvents<{
    checked: [condition: boolean];
    edit: [];
  }> {
    checked = $state(true);
    label = renderable("single", renderable.required);

    constructor(initial: renderable.Initial<Model> & { checked?: boolean }) {
      super();
      this.checked = initial.checked ?? true;
      renderable.init<Model>(this, initial);
    }
  }

  export { inlineIndicatorIcon, indicatorIconWithText };
</script>

<script lang="ts">
  import WithIndicator from "../../suede/svelte-styled-suede/WithIndicator.svelte";
  import { edit } from "./Icons.svelte";
  import { scale } from "svelte/transition";
  import Checkbox from "../../suede/svelte-styled-suede/Checkbox.svelte";
  import Badge from "../../suede/svelte-styled-suede/Badge.svelte";
  import Button from "../../suede/svelte-styled-suede/Button.svelte";

  type Props = {
    model: Model;
  };

  let { model }: Props = $props();
</script>

<WithIndicator>
  {#snippet indicator()}
    <Checkbox
      xs
      class="text-white checked:bg-blue-600 rounded-full"
      checked={model.checked}
      oninput={() => {
        model.checked = !model.checked;
        model.fire("checked", model.checked);
      }}
    />
  {/snippet}
  {@const opacity = model.checked ? "" : /* tw: */ "opacity-50"}
  <Badge
    class="px-0 py-3 bg-blue-600 border-none text-white rounded-md shadow-md {opacity}"
  >
    <Button
      xs
      onclick={() => model.fire("edit")}
      class="rounded-l-md text-white px-0 bg-inherit border-none hover:shadow-md hover:bg-blue-800"
    >
      {@render edit({ height: 16 })}
    </Button>
    <div class="mr-1.5 -ml-1.5">
      {@render renderer(model.label)}
    </div>
  </Badge>
</WithIndicator>

{#snippet inlineIndicatorIcon(src: string, alt = "attachment indicator icon")}
  <img {src} {alt} class="w-4 h-4 mr-1" />
{/snippet}

{#snippet indicatorIconWithText({
  text,
  src,
  alt,
}: {
  text: string;
  src: string;
  alt?: string;
})}
  <div class="flex flex-row items-center">
    {@render inlineIndicatorIcon(src, alt)}
    {text}
  </div>
{/snippet}
