"use client";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { findCompletion, type Completion } from "../writing/composer-field";
import { parseWriting, skillToken, writingContext } from "../../lib/writing/tokens";
import { WritingCopy } from "../writing/WritingText";
import type { WritingPreferences } from "../../lib/writing/model";
import type { RecordSummary } from "./workspace-record-client";
export function AccountWritingField({
  initial = "",
  prefs,
  records,
  exclude,
}: {
  initial?: string;
  prefs: WritingPreferences;
  records: RecordSummary[];
  exclude?: string;
}) {
  const [value, setValue] = useState(initial),
    [match, setMatch] = useState<Completion | null>(null),
    [targets, setTargets] = useState<string[]>([]),
    [index, setIndex] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null),
    pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !field.current) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    field.current.focus();
    field.current.setSelectionRange(caret, caret);
  }, [value, match]);
  function check(text: string, caret: number) {
    setMatch(findCompletion(text, caret, prefs));
    setIndex(0);
  }
  const query = match?.query.toLowerCase() || "";
  const choices = !match
    ? []
    : match.kind === "object"
      ? records
          .filter(
            (r) => r.key !== exclude && !targets.includes(r.key) && r.title.toLowerCase().includes(query),
          )
          .slice(0, 8)
          .map((r) => ({ id: r.key, name: r.title, text: "" }))
      : prefs.skills
          .filter((s) => s.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map((s) => ({
            id: s.id,
            name: s.name,
            text: s.behavior === "snippet" ? s.snippet : skillToken(s) + " ",
          }));
  function choose(i: number) {
    const chosen = choices[i];
    if (!match || !chosen) return;
    if (match.kind === "object") setTargets((old) => [...new Set([...old, chosen.id])]);
    const next = value.slice(0, match.start) + chosen.text + value.slice(match.end),
      caret = match.start + chosen.text.length;
    pendingCaret.current = caret;
    setValue(next);
    setMatch(null);
  }
  return (
    <>
      <label>
        Notes
        <textarea
          ref={field}
          aria-label="Notes"
          value={value}
          name="body"
          rows={4}
          maxLength={100000}
          onChange={(e) => {
            setValue(e.target.value);
            check(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (!choices.length) return;
            if (e.key === "Escape") {
              e.preventDefault();
              setMatch(null);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((n) => (n + (e.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              choose(index);
            }
          }}
        />
      </label>
      {!!choices.length && (
        <div
          role="group"
          aria-label={match?.kind === "skill" ? "Choose writing skill" : "Choose linked record"}
        >
          {choices.map((v, i) => (
            <button type="button" key={v.id} aria-pressed={i === index} onClick={() => choose(i)}>
              {v.name}
            </button>
          ))}
        </div>
      )}
      {targets.map((key) => (
        <div key={key}>
          <input type="hidden" name="newLinks" value={key} />
          <span>{records.find((r) => r.key === key)?.title}</span>{" "}
          <button type="button" onClick={() => setTargets((t) => t.filter((v) => v !== key))}>
            Remove pending link
          </button>
        </div>
      ))}
    </>
  );
}
export function AccountWritingText({
  text,
  prefs,
  id,
}: {
  text: string;
  prefs: WritingPreferences;
  id: string;
}) {
  return (
    <>
      {parseWriting(text).map((part, i) => {
        if (part.kind !== "skill")
          return <Fragment key={i}>{part.kind === "text" ? part.text : part.label}</Fragment>;
        const skill = prefs.skills.find((s) => s.id === part.id);
        if (
          (skill?.behavior ?? part.action ?? (part.id === "copy-prompt" ? "copy" : "collection")) === "copy"
        )
          return (
            <WritingCopy
              key={i}
              label={part.label}
              text={writingContext(
                text,
                part.offset,
                prefs.skills.filter((s) => s.behavior === "collection").map((s) => s.id),
              )}
            />
          );
        return (
          <Link
            key={i}
            href={
              "/account/preferences/writing?workspace=" +
              encodeURIComponent(id) +
              "&skill=" +
              encodeURIComponent(part.id)
            }
          >
            {part.label}
          </Link>
        );
      })}
    </>
  );
}
type Source = { key: string; title: string; passage: string };
export function AccountWritingUses({ workspace, skill }: { workspace: string; skill: string }) {
  const [data, setData] = useState<Source[]>([]),
    [error, setError] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [cursor, setCursor] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void fetch(
      "/api/account/workspaces/" + workspace + "/writing-uses?" + new URLSearchParams({ skill, cursor }),
      { signal: request.signal, cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not open the saved uses.");
        const value = await r.json();
        if (!request.signal.aborted) {
          setData((d) => (cursor ? [...d, ...value.items] : value.items));
          setNext(value.next);
        }
      })
      .catch((e) => {
        if (!request.signal.aborted) {
          setData([]);
          setNext(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [workspace, skill, cursor]);
  return (
    <section aria-label="Saved uses">
      <h3>Saved uses</h3>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading passages…</p>}
      {!error && !loading && !data.length && <p>No matching passages in your visible workspace records.</p>}
      <ul>
        {data.map((source, i) => (
          <li key={source.key + i}>
            <Link href={"/account/workspaces/" + workspace + "?item=" + source.key}>{source.title}</Link>
            <p>{source.passage}</p>
          </li>
        ))}
      </ul>
      {next && (
        <button type="button" disabled={loading} onClick={() => setCursor(next)}>
          Load more
        </button>
      )}
    </section>
  );
}
