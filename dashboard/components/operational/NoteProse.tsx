"use client";
import Markdown from "react-markdown";

/** Authored Markdown is rendered as React nodes; raw HTML is never executed. */
export default function NoteProse({ children }: { children: string }) {
  return (
    <div className="work-prose">
      <Markdown
        skipHtml
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer">
              {children}
            </a>
          ),
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
