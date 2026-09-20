import { extractOrganizationPage } from "./organization-metadata";
import { writeOrganizationDescription } from "./organization-description";
import type { OrganizationAutofillResult } from "../modules/people/organization-autofill";

/** Explicit fallback for public information the user's browser can display.
 * Text is data, never HTML. It does not authorize another network request. */
export function extractPastedOrganization(name: string, sourceUrl: string, input: string): OrganizationAutofillResult {
  if (!name.trim() || !input.trim() || input.length > 12000) throw new Error("Paste the organization name and its About or bio text (up to 12,000 characters).");
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!lines.slice(0, 3).some(line => key(line.split(/\s*[(@|]/)[0]) === key(name))) throw new Error("Include this organization's name at the start of the copied text so it can be matched.");
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const content = lines.filter(line => key(line) !== key(name) && !/^(?:about|bio|overview)$/i.test(line));
  const html = `<title>${escape(name)}</title><meta name="description" content="${escape(content.join(" "))}">${content.map(line => `<p>${escape(line)}</p>`).join("")}`;
  const parsed = extractOrganizationPage(html, sourceUrl, name);
  const suggestions = parsed.suggestions.filter(item => !["name", "website", "instagram", "linkedin", "x", "tiktok", "youtube"].includes(item.field)).map(item => ({ ...item,
    value: item.field === "context" ? writeOrganizationDescription(item.value, name) : item.value,
    evidence: "User-provided profile text; review against the linked source. Not independently retrieved" })).filter(item => item.value);
  return { suggestions, sourceUrl, sources: [sourceUrl], fetchedAt: new Date().toISOString(),
    message: "Filled from the profile text you supplied. Review against the original source before saving. No dates or employee counts were inferred." };
}
