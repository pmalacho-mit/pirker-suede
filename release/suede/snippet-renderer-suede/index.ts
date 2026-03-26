export {
  default as SnippetRenderer,
  renderable,
  renderer,
} from "./SnippetRenderer.svelte";

import type {
  Constraint,
  DefaultConstraint,
  InitialRenderables,
  Renderable,
  RenderableContent,
  RenderableSnippet,
} from "./SnippetRenderer.svelte";
import type { Maybe, Expand } from "./utils.js";

/** A snippet that can render:
 * - raw HTML content
 * - a renderable snippet with or without a prop (see `renderable.Snippet`)
 * - an array of the above renderable contents
 */
export namespace renderer {
  /**
   * The type of the content that can be rendered by the `renderer` snippet.
   */
  export type Content = RenderableContent;
}

/**
 * `renderable` can be:
 * - invoked as a function (to create a `Renderable`, a reactive container for things that can be dynamically rendered by the `renderer` snippet or `SnippetRenderer` component)
 * - used as an object with utility methods (`init` and `required`)
 * - used as a namespace for types (`Initial`, `Snippet`, and `Example`)
 */
export namespace renderable {
  export type Returns<
    Kind extends "single" | "multi",
    Condition extends "required" | "optional",
    T extends Constraint = DefaultConstraint,
  > = Kind extends "multi"
    ? Condition extends "required"
      ? Expand<Renderable<"multi", T[]>>
      : Expand<Renderable<"multi", Maybe<T[]>>>
    : Condition extends "required"
      ? Expand<Renderable<"single", T>>
      : Expand<Renderable<"single", Maybe<T>>>;
  /**
   * Type describing an object with a `renderables` factory function that produces initial values
   * for a class's (or object's, more generally) `renderable` properties.
   *
   * Primarily used to ensure type safety when utilizing `renderable.init()`
   * (e.g. `renderable.init(target, initial)` where `initial` is of type `renderable.Initial<typeof target>`).
   *
   * The factory function receives a `render` helper and returns an object mapping renderable property
   * names to renderable snippet values (see `renderable.Snippet`). `renderable.init()` will then internally
   * use this factory to initialize the renderable properties of the target object.
   *
   * If all renderables are optional, the entire `Initial`
   * object becomes optional; if any renderable is required, `Initial` cannot be undefined.
   *
   * @example
   * ```ts
   * class Model {
   *   item = renderable("single", renderable.required);
   *
   *   constructor(initial: renderable.Initial<Model>) {
   *     renderable.init(this, initial);
   *   }
   * }
   *
   * const model = new Model({
   *   renderables: render => ({
   *     item: render(...)
   *   })
   * });
   * ```
   */
  export type Initial<T> = InitialRenderables<T>;

  /**
   * A record containing a Svelte snippet and its associated prop (if required).
   *
   * This type ensures type safety when working with snippets that may or may not require props.
   * If `Prop` is `undefined`, the snippet requires no prop. Otherwise, the snippet requires
   * the specified `Prop` type to be provided when rendering.
   *
   * Used as the props type for `SnippetRenderer` component and when `set`ting `renderable` properties.
   *
   * @example
   * ```ts
   * const noProps: renderable.Snippet<undefined> = {
   *   snippet: mySnippet,
   * };
   *
   * const withProp: renderable.Snippet<string> = {
   *   snippet: mySnippet,
   *   prop: "hello"
   * };
   * ```
   */
  export type Snippet<Prop extends unknown | undefined = any> =
    RenderableSnippet<Prop>;

  /**
   * @example
   * ```svelte
   * <script lang="ts" module>
   *   import { renderer, renderable, type InitialRenderables } from "snippet-renderer-suede";
   *
   *   export class Model {
   *     requiredItem = renderable("single", renderable.required);
   *     optionalItem = renderable("single");
   *
   *     requiredItems = renderable("multi", renderable.required);
   *     optionalItems = renderable("multi");
   *
   *     constructor(initial?: InitialRenderables<Model>) {
   *       renderable.init(this, initial);
   *     }
   *   }
   * </script>
   *
   * <script lang="ts">
   *   let { model }: { model: Model } = $props();
   * </script>
   *
   * {@render renderer(model.requiredItem.current)}
   *
   * {#if model.optionalItem.current}
   *   {@render renderer(model.optionalItem.current)}
   * {/if}
   *
   * {@render renderer(model.requiredItems.current)}
   *
   * {#each model.requiredItems.current as item}
   *   <!-- with custom markup -->
   *   <div>
   *     {@render renderer(item) }
   *   </div>
   * {/each}
   *
   * {#if model.optionalItems.current}
   *   {@render renderer(model.optionalItems.current)}
   *   <!-- or with custom markup, see above -->
   * {/if}
   *
   * ```
   */
  export type Example = "for documentation purposes only";
}
