"use client";

import { useEffect, useRef, useState } from "react";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import { readCanonicalMetadata } from "../../lib/local-first/canonical-record";
import { vaultRecordLabel } from "../../lib/local-first/vault-record-tools";

const vaultTypes: Record<string, [ModuleId, string]> = {
  note: ["notes", "note"], resource: ["resources", "resource"], file: ["media", "media_asset"],
  person: ["people", "person"], org: ["people", "organization"],
};

async function openVaultRefs(): Promise<NativeObjectRef[]> {
  const { browserVault } = await import("../../lib/local-first/browser-engine");
  if (!browserVault.isUnlocked()) return [];
  const objects = await browserVault.listObjects(["note", "resource", "media", "contact"]);
  if (!browserVault.isUnlocked()) return [];
  return objects.flatMap(row => {
    const meta = readCanonicalMetadata(row.fields);
    if (meta?.module !== "personal-records" || row.tombstone || row.fields.archivedAt || row.fields.deletedAt ||
        row.fields["mediaProfile.archivedAt"] || row.fields["resourceProfile.deletedAt"]) return [];
    const identity = Object.hasOwn(vaultTypes, meta.collection) && vaultTypes[meta.collection];
    if (!identity) return [];
    const [module, objectType] = identity;
    const ref = createNativeObjectRef({ module, objectType, objectId: meta.recordId, label: vaultRecordLabel(row) });
    return ref.route === meta.route ? [ref] : [];
  });
}

type Catalog = { rows: NativeObjectRef[]; incomplete: boolean };

export function useWritingCatalog(open: boolean, retry: number) {
  const cache = useRef<{ at: number; catalog: Catalog } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [vault, setVault] = useState<NativeObjectRef[]>([]);
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    if (!open) { setCatalog(null); return; }
    if (cache.current && Date.now() - cache.current.at < 120_000) {
      setCatalog(cache.current.catalog);
      return;
    }
    const controller = new AbortController();
    setCatalog(null);
    void fetch("/api/admin/writing-objects", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.status === 401 && !controller.signal.aborted) {
        cache.current = null;
        setSignedOut(true);
      }
      if (!response.ok) throw new Error("Objects unavailable");
      const result = await response.json() as { items: NativeObjectRef[]; incomplete: boolean };
      if (controller.signal.aborted) return;
      setSignedOut(false);
      const next = { rows: result.items, incomplete: result.incomplete };
      if (!next.incomplete) cache.current = { at: Date.now(), catalog: next };
      setCatalog(next);
    }).catch(() => {
      if (!controller.signal.aborted) setCatalog({ rows: [], incomplete: true });
    });
    return () => controller.abort();
  }, [open, retry]);

  useEffect(() => {
    if (!open) { setVault([]); return; }
    let cancelled = false;
    const clear = () => { cancelled = true; setVault([]); };
    window.addEventListener("unigentamos-vault-locked", clear);
    void openVaultRefs().then(rows => { if (!cancelled) setVault(rows); }).catch(() => {});
    return () => { cancelled = true; window.removeEventListener("unigentamos-vault-locked", clear); };
  }, [open]);

  return { catalog, vault: signedOut ? [] : vault };
}
