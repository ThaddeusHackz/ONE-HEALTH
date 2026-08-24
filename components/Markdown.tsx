"use client";

import type { ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Diagram } from "@/components/agent/Diagram";

const DIAGRAM_LANGUAGES = new Set(["mermaid", "mmd"]);

function languageOf(className?: string) {
  return /language-([\w-]+)/.exec(className || "")?.[1]?.toLowerCase();
}

/**
 * Markdown for agent answers.
 *
 * A ```mermaid fence is drawn instead of shown - the convention every major
 * assistant uses: the model writes the diagram as text and the reader sees the
 * picture. The `pre` override matters: react-markdown wraps every fence in a
 * <pre>, so without it the rendered SVG would be trapped inside preformatted
 * text with a scrollbar.
 */
export function Markdown({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className="prose-ghana space-y-3 text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // `node` is react-markdown's AST handle; it must not reach the DOM.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          pre({ children, node: _node, ...rest }) {
            const child = Array.isArray(children) ? children[0] : children;
            const props = (child as ReactElement<{ className?: string; children?: unknown }>)?.props;
            if (props && DIAGRAM_LANGUAGES.has(languageOf(props.className) || "")) {
              const raw = String(props.children ?? "").replace(/\n$/, "");
              return <Diagram spec={{ source: raw }} live={live} />;
            }
            return <pre {...rest}>{children}</pre>;
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          code({ className, children, node: _node, ...rest }) {
            const language = languageOf(className);
            if (language && DIAGRAM_LANGUAGES.has(language)) {
              return <Diagram spec={{ source: String(children ?? "").replace(/\n$/, "") }} live={live} />;
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
