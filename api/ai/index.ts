import { getModel, stream } from "@mariozechner/pi-ai";

const x = getModel("kimi-coding", "kimi-k2-thinking");

stream(x, { messages: [] }, { temperature: 0.7 });
