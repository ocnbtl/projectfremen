"use client";
import Markdown from "react-markdown";
import { writingDestination } from "../../lib/writing/tokens";
import { WritingMark } from "../writing/WritingText";

/** Authored Markdown is rendered as React nodes; raw HTML is never executed. */
export default function NoteProse({ children }: { children: string }) {
  return (
    <div className="work-prose">
      <Markdown
        skipHtml
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          a: ({ children: label, href, node }) => {
            const part = typeof label === "string" && href ? writingDestination(label, href, "", node?.position?.start.offset ?? 0) : null;
            return part ? <WritingMark part={part} source={children} /> : <a href={href} rel="noreferrer">{label}</a>;
          },
          img: ({ alt, src }) => (
            <a
              href={typeof src === "string" ? src : undefined}
              rel="noreferrer"
            >
              {alt || "Open attached image"}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
