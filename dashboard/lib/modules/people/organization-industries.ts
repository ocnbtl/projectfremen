import type { ORGANIZATION_TYPES } from "./organization-autofill";
type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_INDUSTRY_OPTIONS: Record<OrganizationType, readonly string[]> = {
  Business: [
    "Technology",
    "Professional services",
    "Retail & consumer",
    "Finance & insurance",
    "Healthcare",
    "Media & entertainment",
    "Manufacturing",
    "Construction & real estate",
    "Hospitality & travel",
    "Transportation & logistics",
    "Agriculture & food",
    "Energy & utilities",
    "Fashion & apparel",
    "Other"
  ],
  Nonprofit: [
    "Arts & culture",
    "Education",
    "Environment",
    "Health",
    "Human services",
    "Civil rights & advocacy",
    "Community development",
    "International development",
    "Religion & faith",
    "Research",
    "Animal welfare",
    "Other"
  ],
  "University / School": [
    "Primary / secondary education",
    "College / university",
    "Vocational / technical",
    "Research institute",
    "Online education",
    "Student organization",
    "Alumni organization",
    "Other"
  ],
  Government: [
    "Federal",
    "State / provincial",
    "Local / municipal",
    "Judicial / legal",
    "Public safety",
    "Public health",
    "Transportation",
    "Economic development",
    "Education",
    "International / diplomatic",
    "Other"
  ],
  Agency: [
    "Creative / design",
    "Marketing / advertising",
    "Talent / modeling",
    "Public relations",
    "Consulting",
    "Staffing / recruiting",
    "Digital / product",
    "Media / production",
    "Real estate",
    "Government / regulatory",
    "Other"
  ],
  Community: [
    "Neighborhood",
    "Professional network",
    "Cultural",
    "Religious / faith",
    "Sports / recreation",
    "Arts / creative",
    "Mutual aid",
    "Online community",
    "Social club",
    "Other"
  ],
  Association: [
    "Trade association",
    "Professional association",
    "Industry group",
    "Alumni association",
    "Standards body",
    "Labor / worker organization",
    "Membership organization",
    "Advocacy coalition",
    "Other"
  ],
  Other: [
    "Education",
    "Healthcare",
    "Technology",
    "Arts & culture",
    "Public service",
    "Research",
    "Media",
    "Community",
    "Professional services",
    "Other"
  ]
};

export function organizationIndustryOptions(type: string): readonly string[] {
  return ORGANIZATION_INDUSTRY_OPTIONS[type as OrganizationType] || ORGANIZATION_INDUSTRY_OPTIONS.Other;
}

/** Classify source vocabulary into the existing taxonomy; never invent an option. */
export function normalizeOrganizationIndustry(type: string, value: string): string {
  const clean = value.trim().replace(/\s*[·.]\s*current$/i, "");
  if (!clean) return "";
  const options = organizationIndustryOptions(type);
  const exact = options.find((option) => option.toLowerCase() === clean.toLowerCase());
  if (exact) return exact;
  const rules: [RegExp, string[]][] = [
    [/higher education|university|college/i, ["College / university", "Education"]],
    [/primary|secondary|k.?12/i, ["Primary / secondary education", "Education"]],
    [/retail|consumer/i, ["Retail & consumer"]],
    [/apparel|fashion|footwear|textile/i, ["Fashion & apparel", "Manufacturing"]],
    [/software|information technology|internet|computer|technology/i, ["Technology", "Digital / product"]],
    [/advertising|marketing/i, ["Marketing / advertising", "Professional services"]],
    [/modeling|talent/i, ["Talent / modeling"]],
    [/design|creative/i, ["Creative / design", "Arts / creative", "Professional services"]],
    [/consult|professional services|business services/i, ["Consulting", "Professional services"]],
    [/research/i, ["Research institute", "Research", "Professional services"]],
    [/\bhospitals?\b|health|medical/i, ["Healthcare", "Health", "Public health"]],
    [/bank|financial|finance|insurance|investment/i, ["Finance & insurance"]],
    [/sport|entertainment|media|music|broadcast|film/i, ["Media & entertainment", "Media / production", "Sports / recreation", "Arts & culture", "Media"]],
    [/manufactur|industrial/i, ["Manufacturing"]],
    [/real estate|construction|architecture/i, ["Construction & real estate", "Real estate"]],
    [/transport|logistics|airline|automotive/i, ["Transportation & logistics", "Transportation"]],
    [/hospitality|travel|hotel|restaurant/i, ["Hospitality & travel"]],
    [/agricult|food/i, ["Agriculture & food"]],
    [/\b(?:energy|utilities|oil|gas)\b/i, ["Energy & utilities"]],
    [/education/i, ["Education"]],
    [/non.?profit|civic|social organization/i, ["Human services", "Community development", "Community"]]
  ];
  for (const [pattern, choices] of rules) if (pattern.test(clean)) {
    const mapped = choices.find((choice) => options.includes(choice));
    if (mapped) return mapped;
  }
  return "Other";
}
