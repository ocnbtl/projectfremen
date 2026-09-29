"use client";
import {
  decodeStyleGuideComponent,
  isStyleGuideComponent,
} from "../../lib/modules/style-guide/component-resource";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import NoteProse from "../operational/NoteProse";
import { ResourceMark } from "./ResourceVisual";
export default function ResourcePreview({
  resource,
}: {
  resource: ResourceRecord;
}) {
  if (!isStyleGuideComponent(resource))
    return (
      <NoteProse>
        {resource.body ||
          resource.metadata.description ||
          "No description yet."}
      </NoteProse>
    );
  const content = decodeStyleGuideComponent(resource.body),
    icon = resource.provenance.subjects.some(
      (t) => t.startsWith("Icon:") || t.startsWith("Icon role:"),
    );
  const html =
    /^<(?:!doctype|html|div|button|section|article|svg|input|form|label|span|p|a|style)\b/i.test(
      content.code.trim(),
    )
      ? content.code
      : "";
  const preview = html
    ? `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{margin:24px;color:#102026;font:14px/1.5 system-ui;overflow-wrap:anywhere}button,input{font:inherit}</style>${html}`
    : "";
  return (
    <section
      className="work-resource-specimen"
      aria-label="Saved component preview"
    >
      {icon && (
        <ResourceMark
          resource={resource}
          gradient={resource.gradient}
          label={resource.title}
        />
      )}{" "}
      {preview && (
        <iframe
          title={`${resource.title} saved preview`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={preview}
        />
      )}
      <NoteProse>{content.visual || ""}</NoteProse>
      {content.code && (
        <details>
          <summary>Saved code</summary>
          <pre>
            <code>{content.code}</code>
          </pre>
        </details>
      )}
      {content.animation && (
        <details>
          <summary>Motion notes</summary>
          <NoteProse>{content.animation}</NoteProse>
        </details>
      )}
    </section>
  );
}
