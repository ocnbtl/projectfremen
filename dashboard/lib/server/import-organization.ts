import { fetchPublicPage } from "./public-page";
import { discoverOrganization } from "./organization-discovery";
import { transferNameKey } from "../modules/people/transfer";
import type { OrganizationAutofillResult } from "../modules/people/organization-autofill";

/** Name-only imports use a unique exact label/alias plus an official website claim.
 * Ambiguous entities are left for a user-supplied website; never synthesize a domain. */
export async function discoverImportedEmployer(
  name: string,
  website: string,
): Promise<OrganizationAutofillResult> {
  if (!website) {
    const request = async (params: Record<string, string>) =>
      JSON.parse(
        (
          await fetchPublicPage(
            `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: "json", maxlag: "5" })}`,
            { timeoutMs: 2500, maxBytes: 1_000_000, format: "json" },
          )
        ).html,
      );
    const result = await request({
      action: "wbsearchentities",
      search: name,
      language: "en",
      type: "item",
      limit: "5",
    });
    const candidates = (result.search || []).filter(
      (item: { label?: string; match?: { text?: string }; id?: string }) =>
        /^Q\d+$/.test(item.id || "") &&
        [item.label, item.match?.text].some(
          (label) => label && transferNameKey(label) === transferNameKey(name),
        ),
    );
    if (candidates.length) {
      const entities = await request({
        action: "wbgetentities",
        ids: candidates.map((item: { id: string }) => item.id).join("|"),
        props: "claims",
      });
      const matches = Object.values(entities.entities || {}).flatMap(
        (entity: unknown) => {
          const claims =
            (
              entity as {
                claims?: Record<
                  string,
                  {
                    rank?: string;
                    mainsnak?: { datavalue?: { value?: unknown } };
                  }[]
                >;
              }
            ).claims || {};
          // Exclude humans and entities without evidence of organizational activity.
          if (
            (claims.P31 || []).some(
              (claim) =>
                (claim.mainsnak?.datavalue?.value as { id?: string })?.id ===
                "Q5",
            ) ||
            !(claims.P159 || claims.P112 || claims.P1128 || claims.P452)
          )
            return [];
          const urls = [
            ...new Set(
              (claims.P856 || [])
                .filter((claim) => claim.rank !== "deprecated")
                .map((claim) => claim.mainsnak?.datavalue?.value)
                .filter(
                  (url): url is string =>
                    typeof url === "string" && /^https?:\/\//.test(url),
                ),
            ),
          ];
          // Regional official sites are still one organization. Ambiguity is
          // decided across matching entities, not across one entity's domains.
          return urls.length ? [urls[0]] : [];
        },
      );
      if (matches.length === 1) website = matches[0];
    }
  }
  if (!website)
    return {
      suggestions: [],
      sourceUrl: "",
      fetchedAt: new Date().toISOString(),
      message:
        "No unique public match. The organization can still be created from the imported name; add its website to try again.",
    };
  return discoverOrganization(name, [website], { timeoutMs: 18_000 });
}
