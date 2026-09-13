import { applyPersonAutofill, personNameKey, type PersonAutofillResult, type PersonAutofillValues, type PersonOrganizationEnrichment } from "./person-autofill";
import { normalizeOrganizationUrl, type OrganizationAutofillResult } from "./organization-autofill";

/** One user action enriches each distinct employer/school once, two requests at a time.
 * The result remains a draft; organization creation and updates happen on person Save. */
export async function enrichPersonOrganizations(values: PersonAutofillValues, result: PersonAutofillResult, lookup: (name: string, website: string, organizationId?: string) => Promise<OrganizationAutofillResult>, signal: AbortSignal, progress?: (done: number, total: number) => void): Promise<PersonAutofillResult> {
  const plans = applyPersonAutofill(values, result).autofill.organizations;
  const unique = [...new Map(plans.map((plan) => [`${personNameKey(plan.name)}:${plan.organizationId || ""}:${plan.website ? normalizeOrganizationUrl(plan.website) : ""}`, plan])).values()];
  const organizations: PersonOrganizationEnrichment[] = [];
  let index = 0, done = 0;
  progress?.(0, unique.length);
  const worker = async () => {
    while (index < unique.length && !signal.aborted) {
      const plan = unique[index++];
      let suggestions: PersonOrganizationEnrichment["suggestions"] = [], message = "Public details were unavailable. Add the organization's website and run its autofill to try again.";
      try {
        const found = await lookup(plan.name, plan.website || "", plan.organizationId);
        suggestions = found.suggestions; message = found.message;
      } catch { /* A failed organization lookup must not discard the person's details. */ }
      if (signal.aborted) break;
      organizations.push({ name: plan.name, website: plan.website, organizationId: plan.organizationId, suggestions, message });
      progress?.(++done, unique.length);
    }
  };
  await Promise.all([worker(), worker()]);
  signal.throwIfAborted();
  return { ...result, organizations };
}
