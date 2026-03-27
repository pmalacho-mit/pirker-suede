import { mount } from "svelte";
import "./app.css";
import Gallery from "../suede/sweater-vest-suede/vite/Gallery.svelte";

const app = mount(Gallery, {
  target: document.getElementById("app")!,
  props: {
    globResult: import.meta.glob("/ui/**/*.test.svelte"),
  },
});

export default app;
