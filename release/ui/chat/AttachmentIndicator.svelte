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
  import { edit } from "./Icons.svelte";
  import { scale } from "svelte/transition";

  type Props = {
    model: Model;
  };

  let { model }: Props = $props();
</script>

<div
  class="indicator mx-1 will-change-transform origin-center z-2"
  transition:scale
>
  <span class="indicator-item badge h-4 border-none p-0">
    <input
      type="checkbox"
      class="checkbox checkbox-xs text-white checked:bg-primary-medium"
      checked={model.checked}
      oninput={() => {
        model.checked = !model.checked;
        model.fire("checked", model.checked);
      }}
    />
  </span>
  <span
    class:opacity-50={!model.checked}
    class="content badge px-0 py-3 bg-primary-medium border-none text-white rounded-md shadow-md"
  >
    <button
      class="btn btn-xs rounded-l-md text-white px-0 bg-inherit border-none hover:shadow-md hover:bg-primary-dark"
      onclick={() => model.fire("edit")}
    >
      {@render edit({ height: 16 })}
    </button>
    <div class="mr-1.5 -ml-1.5">
      {@render renderer(model.label)}
    </div>
  </span>
</div>

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
