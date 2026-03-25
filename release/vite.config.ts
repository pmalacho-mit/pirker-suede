import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defaults, parsePort } from "./globals";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    port: parsePort(process.env.WEB_PORT, defaults.ports.web),
    host: true,
    proxy: {
      "/api": {
        target: `http://localhost:${parsePort(
          process.env.API_PORT,
          defaults.ports.api,
        )}`,
        changeOrigin: true,
      },
    },
  },
});
