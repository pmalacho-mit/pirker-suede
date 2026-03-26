import { mount } from "svelte";
import "./app.css";
import Gallery from "../suede/sweater-vest-suede/vite/Gallery.svelte";

const target = document.getElementById("app")!;

const app = mount(Gallery, {
  target,
  props: {
    globResult: import.meta.glob("/ui/**/*.test.svelte"),
  },
});

target.style.color = "white";

export default app;
