import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../../lib/audit-log";
import {
  importPeopleContacts,
  undoPeopleImport,
  readPersonalRecords,
} from "../../../../lib/personal-records-store";
import {
  contactsCsv,
  contactsVcard,
  exportContactData,
  type ExportOptions,
} from "../../../../lib/modules/people/transfer";
import { readNativeObjectLinks } from "../../../../lib/native-objects/link-store";
import { readPeopleProfilePhoto } from "../../../../lib/modules/people/profile-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
async function bodyJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Choose contacts first.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timer = setTimeout(() => void reader.cancel(), 10_000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_800_000) {
        await reader.cancel();
        throw new Error(
          "This selection is too large. Import fewer contacts or remove pictures.",
        );
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(request: Request) {
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request))
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const body = await bodyJson(request);
    if (body.action === "import") {
      if (
        !Array.isArray(body.contacts) ||
        !Array.isArray(body.companies) ||
        body.companies.length > 500 ||
        typeof body.batch !== "string"
      )
        throw new Error("Invalid contact selection.");
      const result = await importPeopleContacts(
        body.contacts,
        body.companies,
        body.batch,
      );
      await appendAuditEvent({
        at: new Date().toISOString(),
        action: "people.import.success",
        path: new URL(request.url).pathname,
        method: "POST",
        ip: getRequestIp(request),
        status: "ok",
        detail: `${result.createdIds.length} created; ${result.skipped} skipped; batch ${body.batch}`,
      }).catch(() => {});
      return json({ ok: true, ...result });
    }
    if (body.action === "undo")
      return json({
        ok: true,
        items: await undoPeopleImport(String(body.batch || "")),
      });
    if (
      body.action !== "export" ||
      !Array.isArray(body.ids) ||
      body.ids.length > 500 ||
      !body.ids.length ||
      !["vcf", "csv", "json"].includes(body.format)
    )
      throw new Error("Choose up to 500 profiles and an export format.");
    const records = await readPersonalRecords(),
      ids = new Set<string>(body.ids);
    const selected = records.filter(
      (record) =>
        ids.has(record.id) &&
        ["person", "org"].includes(record.className) &&
        !record.archivedAt,
    );
    if (selected.length !== ids.size)
      throw new Error(
        "Some selected profiles are no longer available. Refresh and try again.",
      );
    const options = Object.fromEntries(
      ["notes", "dreams", "interactions", "objects", "extras"].map((key) => [
        key,
        body.options?.[key] === true,
      ]),
    ) as ExportOptions;
    const contacts = selected.map((record) =>
      exportContactData(record, options),
    );
    const extras: Record<string, unknown> = {};
    if (options.interactions)
      extras.interactions = records
        .filter(
          (record) =>
            record.className === "interaction" &&
            !record.archivedAt &&
            record.interaction?.participantIds.some((id) => ids.has(id)),
        )
        .map((record) => ({
          title: record.title,
          description: record.body,
          ...record.interaction,
          participants: record.interaction!.participantIds,
          participantNames: record.interaction!.participantIds.map(
            (id) =>
              records.find((r) => r.id === id)?.title || "Unavailable profile",
          ),
        }));
    if (options.objects)
      extras.objectLinks = (await readNativeObjectLinks())
        .filter(
          (link) =>
            link.status === "active" &&
            (ids.has(link.source.objectId) || ids.has(link.target.objectId)),
        )
        .map(({ source, target, relationship }) => ({
          source,
          target,
          relationship,
        }));
    if (body.pictures === true && body.format !== "csv") {
      const photos: Record<string, string> = {};
      let bytes = 0;
      for (const record of selected.filter((r) => r.profile?.photoUrl)) {
        const photo = await readPeopleProfilePhoto(record.id);
        if (photo) {
          bytes += photo.bytesBase64.length;
          if (bytes > 2_500_000)
            throw new Error(
              "Pictures make this selection too large. Turn off Pictures or export fewer contacts.",
            );
          photos[record.id] =
            `data:${photo.mimeType};base64,${photo.bytesBase64}`;
        }
      }
      extras.photos = photos;
    }
    const output =
      body.format === "vcf"
        ? contactsVcard(contacts, extras)
        : body.format === "csv"
          ? contactsCsv(contacts, extras)
          : JSON.stringify(
              {
                format: "unigentamos-contacts",
                version: 1,
                exportedAt: new Date().toISOString(),
                contacts,
                ...extras,
              },
              null,
              2,
            );
    if (Buffer.byteLength(output) > 3_800_000)
      throw new Error(
        "This export is too large. Choose fewer contacts or fewer optional fields.",
      );
    return new Response(output, {
      headers: {
        ...headers,
        "Content-Type":
          body.format === "vcf"
            ? "text/vcard; charset=utf-8"
            : body.format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="unigentamos-contacts.${body.format}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The transfer could not finish. Your selection is still available.",
      },
      400,
    );
  }
}
