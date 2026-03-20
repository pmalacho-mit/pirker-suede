import type { ImageContent } from "@mariozechner/pi-ai";
import type { AgentMessage } from "./types";

export const user = (text: string, images?: ImageContent[]): AgentMessage => ({
  role: "user",
  content: images
    ? [{ type: "text", text }, ...images]
    : [{ type: "text", text }],
  timestamp: Date.now(),
});
