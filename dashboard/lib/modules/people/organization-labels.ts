import { ORGANIZATION_INDUSTRY_OPTIONS } from "./organization-industries";

/** Classification comes from Properties, never from unrelated relationship/place tags. */
export function organizationLabels(profile?: { organizationType?: string; industry?: string }) {
  const type = profile?.organizationType?.trim() || "";
  const options = Object.hasOwn(ORGANIZATION_INDUSTRY_OPTIONS, type)
    ? ORGANIZATION_INDUSTRY_OPTIONS[type as keyof typeof ORGANIZATION_INDUSTRY_OPTIONS] : undefined;
  return {
    type: options ? type : "",
    industry: options?.includes(profile?.industry || "") && profile?.industry !== "Other" ? profile!.industry! : "",
  };
}
