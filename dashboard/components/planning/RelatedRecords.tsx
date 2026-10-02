"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";
export default function RelatedRecords({
  module,
  type,
  id,
  hideEmpty = false,
}: {
  module: ModuleId;
  type: string;
  id: string;
  hideEmpty?: boolean;
}) {
  const [items, setItems] = useState<
      { ref: NativeObjectRef; detail: string }[]
    >([]),
    [error, setError] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setError(false);
    void fetch(
      `/api/planning/related?${new URLSearchParams({ module, type, id })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setItems(data.items);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [module, type, id]);
  if (hideEmpty && !error && (!loaded || !items.length)) return null;
  return (
    <section className="work-related">
      <h3>Places, events and media</h3>
      {error ? (
        <p>Related records could not load. Your links are preserved.</p>
      ) : !loaded ? (
        <p role="status">Loading related records…</p>
      ) : items.length ? (
        <div>
          {items.map(({ ref, detail }) => (
            <Link
              className="work-row"
              key={`${ref.module}:${ref.objectId}`}
              href={ref.route}
            >
              <UnigentamosIcon
                role={`module-${ref.module === "personal_ops" ? "personal" : ref.module}`}
                size={20}
              />
              <span>
                <strong>{ref.label}</strong>
                <small>{detail}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="work-muted">No places, events or media linked yet.</p>
      )}
    </section>
  );
}
