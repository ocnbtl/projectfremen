"use client";
import Link from "next/link";
import { useState } from "react";
import type { DailyPreferences } from "../../lib/settings/preferences";
import type { RecordSummary } from "./workspace-record-client";
export default function AccountRecordSearch({
  records,
  prefs,
  home,
}: {
  records: RecordSummary[];
  prefs: DailyPreferences;
  home: string;
}) {
  const [query, setQuery] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [all, setAll] = useState(false);
  const term = query.trim().toLowerCase();
  const matches = records.filter(
    (record) =>
      !term ||
      ((all || !prefs.recordKinds.length || prefs.recordKinds.includes(record.kind)) &&
        (record.title + " " + record.kind).toLowerCase().includes(term)),
  );
  return (
    <>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (prefs.recentSearches && term)
            setHistory((h) => [query.trim(), ...h.filter((v) => v !== query.trim())].slice(0, 8));
        }}
      >
        <label>
          Search records
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={300} />
        </label>
        {term && prefs.recordKinds.length > 0 && (
          <label>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Search every record type
          </label>
        )}
      </form>
      {prefs.recentSearches && history.length > 0 && (
        <div aria-label="Recent searches">
          {history.map((entry) => (
            <button type="button" key={entry} onClick={() => setQuery(entry)}>
              {entry}
            </button>
          ))}
          <button type="button" onClick={() => setHistory([])}>
            Clear history
          </button>
        </div>
      )}
      {matches.length ? (
        <ul>
          {matches.map((row) => (
            <li key={row.key}>
              <Link prefetch={false} href={home + "?item=" + encodeURIComponent(row.key)}>
                {row.title}
              </Link>
              <small>{row.kind}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>{term ? "No matching records." : "No records visible to you yet."}</p>
      )}
    </>
  );
}
