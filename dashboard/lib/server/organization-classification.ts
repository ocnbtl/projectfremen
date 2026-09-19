import { organizationIndustryOptions } from "../modules/people/organization-industries";

/** Conservative category inference from an organization's own short description.
 * Deliberately excludes dates, counts and locations: service vocabulary cannot
 * establish those facts. Multiple business activities stay ambiguous.
 */
export function classifyOrganizationServices(description: string, knownType = ""): { organizationType: string; industry: string } | null {
  const text = description.replace(/\s+/g, " ").trim().slice(0, 1600);
  const guarded = text.replace(/\b(?:not just|not only|free (?:cancellation|shipping|delivery|consultation)|public (?:boat )?charters?)\b/gi, "");
  if (!text || /\b(?:not|never|no longer|formerly|used to)\b/i.test(guarded)
    || (!knownType && /\b(?:free|non[ -]?profit|charit\w*|government|municipal|public|university|church|volunteer|association|community group)\b/i.test(guarded))
    || /\b(?:blog|news|guide|directory|review|comparison|article|research on|research into|partners? with|our clients|our customers|supporting|support for|solutions for)\b/i.test(text)) return null;
  // These are descriptions of an actual offering, rather than broad keywords
  // such as "travel", "health", "technology" or "property".
  const vacation = /\b(?:(?:villa|vacation home|holiday home|vacation|holiday|short[ -]term) rentals?|(?:hotel|resort) (?:accommodations?|rooms?|stays)|tour operators?|travel agency|(?:private |luxury |customized |crewed |sailing |fishing )*(?:boat|yacht|catamaran|sailboat|speedboat) (?:charters?|tours?|rentals?|cruises)|(?:sailing|snorkell?ing|sightseeing|fishing|guided|walking) (?:tours?|excursions?|trips)|(?:private|customized) tours?|bed and breakfast|guest ?house)\b/i;
  const rules: [RegExp, string][] = [
    [vacation, "Hospitality & travel"],
    [/\b(?:software development|web development|software (?:platform|company)|saas platform|cybersecurity services|cloud hosting|IT (?:support|services|consulting)|managed IT)\b/i, "Technology"],
    [/\b(?:law firm|accounting firm|legal services|accounting services|management consulting|architectural (?:firm|services)|architecture (?:firm|studio)|engineering (?:firm|consultancy)|marketing agency|design studio|advertising agency|recruitment agency)\b/i, "Professional services"],
    [/\b(?:dental clinic|medical clinic|dental practice|medical practice|physical therapy clinic|veterinary (?:clinic|hospital|practice)|healthcare provider|hospital|pharmacy|optometry practice)\b/i, "Healthcare"],
    [/\b(?:online store|online retailer|retail store|e[ -]?commerce store|grocery store|supermarket|bookstore|furniture store|hardware store|beauty salon|hair salon|barber ?shop)\b/i, "Retail & consumer"],
    [/^(?=[\s\S]*\b(?:order|shop|buy)\b)(?=[\s\S]*\b(?:snacks|groceries|everyday essentials)\b)[\s\S]*\b(?:deliver\w*|our (?:app|store))\b/i, "Retail & consumer"],
    [/\b(?:freight forwarding|courier services|delivery services|logistics company|trucking company|cargo (?:shipping|transport)|airport transfers?|taxi service|moving company|freight (?:transport|shipping))\b/i, "Transportation & logistics"],
    [/\b(?:insurance brokerage|insurance agency|investment management|financial advisory services|mortgage (?:broker|lender)|credit union|retail bank)\b/i, "Finance & insurance"],
    [/\b(?:manufactur(?:er|ing) of|industrial manufacturing)\b/i, "Manufacturing"],
    [/\b(?:property management|real estate brokerage|construction company|building contractor|plumbing (?:company|services)|roofing (?:company|contractor)|electrical contractor|landscaping services)\b/i, "Construction & real estate"],
    [/\b(?:film production|video production|music (?:label|production)|record label|animation studio|game studio|book publisher|newspaper publisher|television network)\b/i, "Media & entertainment"],
    [/\b(?:restaurant|coffee shop|catering (?:company|services))\b/i, "Hospitality & travel"],
    [/\b(?:bakery|brewery|winery|organic farm|dairy farm|food producer)\b/i, "Agriculture & food"],
    [/\b(?:solar (?:panel )?(?:installation|installer)|renewable energy (?:company|developer)|electric utility|electricity (?:supplier|provider)|water utility)\b/i, "Energy & utilities"],
    [/\b(?:clothing brand|fashion (?:brand|label)|apparel (?:brand|manufacturer)|footwear brand|clothing boutique)\b/i, "Fashion & apparel"],
  ];
  const industries = new Set(rules.filter(([pattern, industry]) => pattern.test(text)
    && !(industry === "Construction & real estate" && vacation.test(text))).map(([, industry]) => industry));
  // A shop delivering its own groceries remains retail; generic delivery
  // vocabulary alone should not turn it into a freight/logistics business.
  if (industries.has("Retail & consumer") && !/\b(?:freight|cargo|courier|trucking)\b/i.test(text)) industries.delete("Transportation & logistics");
  // Known types use their own curated taxonomy; never force a nonprofit, school
  // or public body into Business just because its services overlap.
  const organizationType = knownType || "Business";
  const typedRules: Record<string, [RegExp, string][]> = {
    Nonprofit: [[/\b(?:animal (?:rescue|welfare|shelter)|(?:cat|dog|wildlife) rescue)\b/i, "Animal welfare"], [/\b(?:medical clinic|healthcare|public health|hospital)\b/i, "Health"], [/\b(?:food bank|homeless shelter|housing assistance)\b/i, "Human services"], [/\b(?:environmental conservation|wildlife conservation|reforestation)\b/i, "Environment"], [/\b(?:education|literacy|scholarships)\b/i, "Education"]],
    "University / School": [[/\b(?:university|college|higher education)\b/i, "College / university"], [/\b(?:primary school|secondary school|high school|elementary school)\b/i, "Primary / secondary education"], [/\b(?:vocational|technical school|trade school)\b/i, "Vocational / technical"], [/\b(?:online education|online courses)\b/i, "Online education"]],
    Agency: [[/\b(?:marketing|advertising)\b/i, "Marketing / advertising"], [/\b(?:design studio|creative agency)\b/i, "Creative / design"], [/\b(?:recruitment|recruiting|staffing)\b/i, "Staffing / recruiting"], [/\bpublic relations\b/i, "Public relations"], [/\b(?:film production|video production)\b/i, "Media / production"], [/\b(?:software development|web development)\b/i, "Digital / product"]],
    Government: [[/\b(?:court|judicial|tribunal)\b/i, "Judicial / legal"], [/\b(?:police|fire department|emergency management)\b/i, "Public safety"], [/\bpublic health\b/i, "Public health"], [/\b(?:municipal government|city council|town council)\b/i, "Local / municipal"]],
  };
  const matches = organizationType === "Business" ? industries : new Set((typedRules[organizationType] || []).filter(([pattern]) => pattern.test(text)).map(([, industry]) => industry));
  if (matches.size !== 1) return null;
  const industry = [...matches][0];
  if (!organizationIndustryOptions(organizationType).includes(industry)) return null;
  return { organizationType, industry };
}

/** Reconcile independent, attributable snippets instead of concatenating a whole
 * page (where footer wording or a partner's business can contaminate the result). */
export function classifyOrganizationEvidence(evidence: string[], knownType = "") {
  const supported = [...new Set(evidence)].slice(0, 20).flatMap((text) => {
    const classification = classifyOrganizationServices(text, knownType);
    return classification ? [{ ...classification, evidence: text }] : [];
  });
  if (!supported.length) return null;
  const industries = new Set(supported.map((item) => item.industry));
  return { organizationType: supported[0].organizationType, industry: industries.size === 1 ? supported[0].industry : "", evidence: supported.map((item) => item.evidence).slice(0, 3).join("; ") };
}
