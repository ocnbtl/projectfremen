"use client";
import LogoLoader from "../operational/LogoLoader";
import { useEffect, useState } from "react";
import Link from "next/link";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";
import { EventObjectIdentity } from "./EventObjects";
export type RelatedItem = { ref: NativeObjectRef & { preview?: { imageUrl?: string; imageUpdatedAt?: string } }; detail: string };
export function useRelatedRecords(module: ModuleId, type: string, id: string) {
  const [items, setItems] = useState<RelatedItem[]>([]),
    [error, setError] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setError(false);
    setItems([]);
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
  return { items, error, loaded };
}
export function RelatedRecordsView({ items, error, loaded, hideEmpty = false, compact = false }: {
  items: RelatedItem[]; error: boolean; loaded: boolean; hideEmpty?: boolean; compact?: boolean;
}) {
  if (hideEmpty && !error && (!loaded || !items.length)) return null;
  return (
    <section className="work-related" data-compact={compact || undefined}>
      <h3 style={{display:"flex",alignItems:"center",gap:6}}><UnigentamosIcon role="object" size={16}/>Linked objects</h3>
      {error ? (
        <p>Related records could not load. Your links are preserved.</p>
      ) : !loaded ? (
        <LogoLoader label="Loading related records" />
      ) : items.length ? (
        <div>
          {items.map(({ ref, detail }) => (
            <Link
              className="work-row"
              key={`${ref.module}:${ref.objectType}:${ref.objectId}`}
              href={ref.route}
              title={compact ? `${ref.label}${detail ? ` · ${detail}` : ""}` : undefined}
            >
              {compact ? <EventObjectIdentity record={ref} /> : <UnigentamosIcon
                role={`module-${ref.module === "personal_ops" ? "personal" : ref.module}`}
                size={20}
              />}
              <span>
                <strong>{ref.label}</strong>
                {!compact && <small>{detail}</small>}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="work-muted">No linked objects yet.</p>
      )}
    </section>
  );
}
export default function RelatedRecords({ module, type, id, hideEmpty = false }: { module: ModuleId; type: string; id: string; hideEmpty?: boolean }) {
  return <RelatedRecordsView {...useRelatedRecords(module, type, id)} hideEmpty={hideEmpty} />;
}
