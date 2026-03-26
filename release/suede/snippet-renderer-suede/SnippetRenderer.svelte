<script lang="ts" module>
  import type { Snippet } from "svelte";
  import type {
    ExtractSnippetArgs,
    ArrayElement,
    Expand,
    MakeOptionalIfNullable,
    Maybe,
    RequiredKeys,
    SingleOrArray,
    IfMaybe,
  } from "./utils.js";

  /**
   * A record that includes a snippet and, if that snippet requires a prop,
   * the prop to provide to it upon rendering.
   *
   * Ensures type safety when rendering snippets that may or may not require props.
   */
  export type RenderableSnippet<Prop extends unknown | undefined> =
    Prop extends undefined
      ? { snippet: Snippet<[]>; prop?: never }
      : { snippet: Snippet<[Prop]>; prop: Prop };

  /**
   * Create a renderable snippet from a snippet that does not require any props.
   * @overload
   * @param snippet
   */
  export function renderableSnippet<TSnippet extends Snippet<[]>>(
    snippet: TSnippet,
  ): RenderableSnippet<undefined>;
  /**
   * Create a renderable snippet from a snippet that requires a prop.
   * @overload
   * @param snippet
   * @param prop
   */
  export function renderableSnippet<TSnippet extends Snippet<[any]>>(
    snippet: TSnippet,
    prop: ExtractSnippetArgs<TSnippet>[0],
  ): RenderableSnippet<ExtractSnippetArgs<TSnippet>[0]>;
  /**
   * Convenience overload to create a renderable snippet from raw HTML content.
   * @overload
   * @param snippet
   * @param prop
   */
  export function renderableSnippet(html: string): RenderableSnippet<any>;
  /** Implementation */
  export function renderableSnippet<TSnippet extends Snippet<any>>(
    snippet: TSnippet | string,
    prop?: ExtractSnippetArgs<TSnippet> extends []
      ? undefined
      : ExtractSnippetArgs<TSnippet>[0],
  ): RenderableSnippet<any> {
    return typeof snippet === "string"
      ? { snippet: html, prop: snippet }
      : prop === undefined
        ? { snippet }
        : { snippet, prop };
  }

  export type Renderable<
    K extends "single" | "multi",
    T extends K extends "multi"
      ? Maybe<Record<string, any>[]>
      : Maybe<Record<string, any>>,
  > = {
    /**
     * Discriminator indicating whether this renderable holds a single value (`"single"`)
     * or multiple values (`"multi"`).
     *
     * This determines the type of the `current` property and available methods
     * (i.e., whether or not `current` behaves as an array).
     */
    readonly kind: K;
    /**
     * The current value of the renderable.
     *
     * For `"single"` renderables, this is either a `T` or `undefined` (if optional).
     * For `"multi"` renderables, this is either an array of `T`s or `undefined` (if optional).
     */
    get current(): T;
  } & (K extends "multi"
    ? {
        /**
         * Set the current value of the renderable. This will replace the current value with the new value.
         *
         *
         * @param get A callback that accepts a `render` function as an argument, which can then be used to render a snippet in a type-safe manner.
         * For convenience, when setting a multi renderable, you can return either an array of values or a single value (which will then be automatically wrapped into an array).
         *
         * @example
         * ```ts
         * // Setting a single value
         * renderable.set((render) => render(text, "Hello, world!"));
         * ```
         *
         * @example
         * ```ts
         * // Setting an array of values
         * renderable.set((render) => [render(text, "Hello, world!"), render(text, "Hello, world!")]);
         * ```
         */
        set: (
          get: (
            render: typeof renderableSnippet,
          ) =>
            | SingleOrArray<
                Exclude<T, undefined> extends readonly unknown[]
                  ? ArrayElement<Exclude<T, undefined>>
                  : any
              >
            | IfMaybe<T, undefined, never>,
        ) => void;
        /**
         * Append one or more values to the current array of renderables.
         *
         * @param get A callback that accepts a `render` function and returns either a single value
         * or an array of values to append. The value(s) will be added to the end of the current array.
         *
         * @example
         * ```ts
         * // Append a single value
         * renderable.append((render) => render(text, "New item"));
         *
         * // Append multiple values
         * renderable.append((render) => [render(text, "Item 1"), render(text, "Item 2")]);
         * ```
         */
        append: (
          get: (
            render: typeof renderableSnippet,
          ) => SingleOrArray<
            Exclude<T, undefined> extends readonly unknown[]
              ? ArrayElement<Exclude<T, undefined>>
              : any
          >,
        ) => void;
        /**
         * Unset the current value of the renderable,
         * setting it to `undefined` for optional multi renderables,
         * or to an empty array for required multi renderables.
         */
        unset: () => void;
      }
    : {
        /**
         * Set the current value of the renderable. This will replace the current value with the new value.
         *
         * @param get A callback that accepts a `render` function as an argument, which can then be used
         * to create a renderable snippet in a type-safe manner.
         *
         * @example
         * ```ts
         * renderable.set((render) => render(mySnippet, "Hello"));
         * ```
         */
        set: (
          get: (
            render: typeof renderableSnippet,
          ) => T | IfMaybe<T, undefined, never>,
        ) => void;
      } & (undefined extends T
        ? {
            /**
             * Unset the current value of the renderable, setting it to `undefined`.
             * Only available for optional single renderables.
             */
            unset: () => void;
          }
        : {}));

  export type Constraint = Record<string, any>;
  export type DefaultConstraint = RenderableSnippet<any>;

  const valueFromMulti = <T extends Maybe<SingleOrArray<any>>>(value: T) =>
    Array.isArray(value) ? value : value !== undefined ? [value] : undefined;

  /**
   * Create a `"single"` renderable that is optional (meaning the underlying`current` property can be `undefined`)
   * @overload
   * @param kind specify that this is a `"single"` renderable
   */
  function _renderable<T extends Constraint = DefaultConstraint>(
    kind: "single",
  ): Expand<Renderable<"single", Maybe<T>>>;
  /**
   * Create a `"single"` renderable that cis required (meaning the underlying`current` property will always have a value)
   * @overload
   * @param kind specify that this is a `"single"` renderable
   * @param initial A callback that returns the initial value of the renderable
   */
  function _renderable<T extends Constraint = DefaultConstraint>(
    kind: "single",
    initial: (render: typeof renderableSnippet) => T,
  ): Expand<Renderable<"single", T>>;
  /**
   * Create a `"multi"` renderable that is optional (meaning the underlying`current` property can be `undefined`)
   * @overload
   * @param kind specify that this is a `"multi"` renderable
   */
  function _renderable<T extends Constraint = DefaultConstraint>(
    kind: "multi",
  ): Expand<Renderable<"multi", Maybe<T[]>>>;
  /**
   * Create a `"multi"` renderable that is required
   * (meaning the underlying`current` property will always have a value, and is initialized to an empty array)
   * @overload
   * @param kind specify that this is a `"multi"` renderable
   * @param initial A callback that returns the initial value of the renderable
   */
  function _renderable<T extends Constraint = DefaultConstraint>(
    kind: "multi",
    initial: (render: typeof renderableSnippet) => SingleOrArray<T>,
  ): Expand<Renderable<"multi", T[]>>;
  /** Implementation */
  function _renderable<K extends "single" | "multi">(
    kind: K,
    initial?: (
      render: typeof renderableSnippet,
    ) => SingleOrArray<ReturnType<typeof renderableSnippet>>,
  ) {
    type Single = Maybe<RenderableSnippet<any>>;
    type Multi = Maybe<RenderableSnippet<any>[]>;
    type Return = Renderable<K, K extends "multi" ? Multi : Single>;

    const required = initial !== undefined;
    const value = initial?.(renderableSnippet);
    let state = $state(kind === "multi" ? valueFromMulti(value) : value);

    switch (kind) {
      case "single":
        const single: Renderable<"single", Single> = {
          kind,
          get current() {
            return state as Single;
          },
          set: (get) => {
            state = get(renderableSnippet);
          },
          unset: () => {
            if (!required) state = undefined;
            else console.error("Cannot unset a required renderable");
          },
        };
        return single as unknown as Return;
      case "multi":
        const multi: Renderable<"multi", Multi> = {
          kind,
          get current() {
            return state as Multi;
          },
          set(get) {
            const value = get(renderableSnippet);
            state = valueFromMulti(value) as Multi;
          },
          append(get) {
            state ??= [];
            const value = get(renderableSnippet);
            if (value === undefined) throw new Error("Cannot append undefined");
            Array.isArray(value)
              ? (state as Exclude<Multi, undefined>).push(...value)
              : (state as Exclude<Multi, undefined>).push(
                  value as RenderableSnippet<any>,
                );
          },
          unset() {
            state = required ? [] : undefined;
          },
        };
        return multi as unknown as Return;
    }
  }

  /**
   * When given a Renderable<_,_>, extracts the type of entry it contains
   * (e.g. what it's value of `current` would be),
   * with the addition that `multi` renderables are expanded to
   * either a single item or an array of items.
   *
   * Optional renderables will have `undefined` included in the type.
   */
  export type ExtractRenderableEntry<MaybeRenderable> =
    MaybeRenderable extends Renderable<infer K, infer T>
      ? K extends "single"
        ? T
        : undefined extends MaybeRenderable["current"]
          ? T extends (infer Item)[]
            ? Maybe<SingleOrArray<Item>>
            : never
          : T extends (infer Item)[]
            ? SingleOrArray<Item>
            : never
      : never;

  export type ExtractRenderableEntries<T> = MakeOptionalIfNullable<{
    [k in keyof T as T[k] extends Renderable<infer _, infer __>
      ? k
      : never]: ExtractRenderableEntry<T[k]>;
  }>;

  export type RenderablesFactory<
    T,
    Picked extends
      keyof ExtractRenderableEntries<T> = keyof ExtractRenderableEntries<T>,
  > = (
    render: typeof renderableSnippet,
  ) => Expand<Pick<ExtractRenderableEntries<T>, Picked>>;

  type WithRenderables<T> = Expand<{
    renderables: RenderablesFactory<T>;
  }>;

  export type InitialRenderables<T> =
    RequiredKeys<ExtractRenderableEntries<T>> extends never
      ? Maybe<WithRenderables<T>>
      : WithRenderables<T>;

  const init = <T,>(target: T, source: InitialRenderables<T>) => {
    const values = source?.renderables?.(renderableSnippet);
    if (!values) return;
    for (const key in values) {
      const entry = target[key as keyof T] as Renderable<any, any>;
      const value = values[
        key as keyof typeof values
      ] as RenderableSnippet<any>;
      entry.set(() => value);
    }
  };

  const required = <T = RenderableSnippet<any>,>(
    render: typeof renderableSnippet<any>,
  ) =>
    render({
      snippet: requiredPlaceholder,
    }) as T;

  export const renderable = Object.assign(_renderable, {
    /**
     * Initialize the renderables on a target object using the provided initial renderables.
     * @param target The target object containing renderable properties to initialize.
     * @param source An object containing a `renderables` property,
     * which is a function that returns the initial values for the renderables of the target.
     */
    init,
    /**
     * A sentinel value that can be passed as the second argument to `renderable`
     * when it initializes a class property, to indicate that the renderable is required
     * and must be `set` via the constructor (see `renderable.init`).
     * @param render
     */
    required,
  });

  export type RenderableContent =
    | RenderableSnippet<any>
    | Snippet<[]>
    | string
    | Pick<Renderable<any, any>, "current">
    | RenderableContent[];

  export { renderer };

  const noProp = <TProp extends unknown | undefined>(
    snippet: Snippet<[TProp]> | Snippet<[]>,
    prop: TProp,
  ): snippet is Snippet<[]> => prop === undefined;
</script>

<script lang="ts" generics="TSnippetProp extends unknown | undefined">
  import Self from "./SnippetRenderer.svelte";
  let { snippet, prop }: RenderableSnippet<TSnippetProp> = $props();
</script>

{#if noProp(snippet, prop)}
  {@render snippet()}
{:else}
  {@render snippet(prop)}
{/if}

{#snippet html(content: string)}
  {@html content}
{/snippet}

{#snippet requiredPlaceholder()}
  {console.error(
    "A required snippet was rendered without first being `set` on the renderable.",
  )}
  Error: Required snippet not provided
{/snippet}

{#snippet renderer(content: RenderableContent)}
  {#if typeof content === "string"}
    {content}
  {:else if typeof content === "function"}
    {@render content()}
  {:else if Array.isArray(content)}
    {#each content as item}
      {@render renderer(item)}
    {/each}
  {:else if "current" in content}
    {#if content.current !== undefined}
      {@render renderer(content.current)}
    {/if}
  {:else}
    <Self {...content} />
  {/if}
{/snippet}
