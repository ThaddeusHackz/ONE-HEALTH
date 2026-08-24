import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agent",
  description:
    "ONE HEALTH AI Agent - reasoning, live web research, vision, image generation, an in-browser sandbox, charts and long-term memory for Ghana Health Service One Health work.",
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
