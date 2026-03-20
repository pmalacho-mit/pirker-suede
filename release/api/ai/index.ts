import { getModel, stream } from "@mariozechner/pi-ai";

const x = getModel("opencode", "gemini-3-flash");

stream(x, { messages: [] }, { temperature: 0.7 });
