import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { defaults, parsePort } from "../globals";
import { providers } from "./routes/providers.js";

const app = new Hono();

app.get("/api/hello", (c) => c.json({ message: "Hello from Hono!" }));
app.route("/api/providers", providers);

const port = parsePort(process.env.API_PORT, defaults.ports.api);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Hono running on http://localhost:${info.port}`);
});
