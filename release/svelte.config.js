import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
const config = {
  // Note the additional `{ script: true }`
  preprocess: vitePreprocess(),
};

export default config;
