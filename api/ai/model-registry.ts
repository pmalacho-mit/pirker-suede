import { getEnvApiKey, getApiProviders } from "@mariozechner/pi-ai";
import {
  getModel,
  complete,
  completeSimple,
  GoogleOptions,
  streamGoogle,
} from "@mariozechner/pi-ai";

const openaiModel = getModel("openai", "gpt-4o");

await complete(
  openaiModel,
  { messages: [] },
  {
    temperature: 0.7,
    reasoningEffort: "medium",
    reasoningSummary: "detailed", // OpenAI Responses API only
  },
);
