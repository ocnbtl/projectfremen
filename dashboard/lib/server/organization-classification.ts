import { organizationIndustryOptions } from "../modules/people/organization-industries";

/** Conservative category inference from an organization's own short description.
 * Deliberately excludes dates, counts and locations: service vocabulary cannot
 * establish those facts. Multiple business activities stay ambiguous.
 */
export function classifyOrganizationServices(description: string, knownType = ""): { organizationType: string; industry: string } | null {
  const text = description.replace(/\s+/g, " ").trim().slice(0, 1600);
  if (!text || /\b(?:not|never|no longer|formerly|used to|free|non[ -]?profit|charit\w*|government|municipal|public|university|church|volunteer|association|community group)\b/i.test(text)
    || /\b(?:blog|news|guide|directory|review|comparison|article|research on|research into|partners? with|our clients|our customers|supporting|support for|solutions for)\b/i.test(text)) return null;
  // These are descriptions of an actual offering, rather than broad keywords
  // such as "travel", "health", "technology" or "property".
  const vacation = /\b(?:(?:villa|vacation home|holiday home|vacation|holiday|short[ -]term) rentals?|(?:hotel|resort) (?:accommodations?|rooms?|stays)|tour operator|travel agency)\b/i;
  const rules: [RegExp, string][] = [
    [vacation, "Hospitality & travel"],
    [/\b(?:software development|web development|software platform|saas platform|cybersecurity services|cloud hosting)\b/i, "Technology"],
    [/\b(?:law firm|accounting firm|legal services|accounting services|management consulting)\b/i, "Professional services"],
    [/\b(?:dental clinic|medical clinic|dental practice|medical practice|physical therapy clinic)\b/i, "Healthcare"],
    [/\b(?:online store|online retailer|retail store|e[ -]?commerce store)\b/i, "Retail & consumer"],
    [/\b(?:freight forwarding|courier services|delivery services|logistics company|trucking company)\b/i, "Transportation & logistics"],
    [/\b(?:insurance brokerage|insurance agency|investment management|financial advisory services)\b/i, "Finance & insurance"],
    [/\b(?:manufactur(?:er|ing) of|industrial manufacturing)\b/i, "Manufacturing"],
    [/\b(?:property management|real estate brokerage|construction company|building contractor)\b/i, "Construction & real estate"],
  ];
  const industries = new Set(rules.filter(([pattern, industry]) => pattern.test(text)
    && !(industry === "Construction & real estate" && vacation.test(text))).map(([, industry]) => industry));
  if (industries.size !== 1) return null;
  const industry = [...industries][0];
  const organizationType = knownType || "Business";
  if (!organizationIndustryOptions(organizationType).includes(industry) || organizationType !== "Business") return null;
  return { organizationType, industry };
}
