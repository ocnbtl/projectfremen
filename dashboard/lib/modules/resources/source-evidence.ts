import type {
  ResourceExactUrlMatch,
  ResourceRecord,
  ResourceSourceCandidate,
  ResourceSourceEvidenceItem,
  ResourceSourceEvidenceReport
} from "./types";

type StoredSourceValue = {
  value: string;
  provenance: ResourceSourceCandidate["provenance"];
  evidenceField: string;
  evidenceId?: string;
};

function redactedCredentialDisplay(url: URL): string {
  return `[credentials withheld] ${url.protocol}//${url.host}/`;
}

function hasExplicitUserInfo(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(value);
}

export function inspectResourceSourceValue({
  value,
  provenance,
  evidenceField,
  evidenceId
}: StoredSourceValue): ResourceSourceEvidenceItem {
  const trimmed = value.trim();
  const base = {
    id: evidenceId || `${provenance}:${evidenceField}`,
    provenance,
    evidenceField
  } as const;

  const explicitUserInfo = hasExplicitUserInfo(trimmed);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ...base,
      displayValue: explicitUserInfo ? "[credentials withheld]" : trimmed,
      navigationUrl: null,
      matchKey: null,
      normalizationVersion: "whatwg-http-v1",
      hadFragment: false,
      displayDomain: null,
      protocol: null,
      state: explicitUserInfo ? "credentials_withheld" : "invalid_url"
    };
  }

  const protocol = url.protocol.toLowerCase();
  // User information is a privacy boundary, not a URL-validity detail. Check
  // it before protocol and syntax classification so unsupported or malformed
  // credential-bearing values can never fall through to a raw display value.
  if (explicitUserInfo || url.username || url.password) {
    return {
      ...base,
      displayValue: url.host ? redactedCredentialDisplay(url) : "[credentials withheld]",
      navigationUrl: null,
      matchKey: null,
      normalizationVersion: "whatwg-http-v1",
      hadFragment: Boolean(url.hash),
      displayDomain: url.hostname || null,
      protocol,
      state: "credentials_withheld"
    };
  }

  if (protocol !== "http:" && protocol !== "https:") {
    return {
      ...base,
      displayValue: trimmed,
      navigationUrl: null,
      matchKey: null,
      normalizationVersion: "whatwg-http-v1",
      hadFragment: false,
      displayDomain: url.hostname || null,
      protocol,
      state: "unsupported_protocol"
    };
  }

  // WHATWG URL parsing intentionally repairs forms such as `https:example.com`
  // and backslash-separated hosts. They remain preserved legacy evidence, but
  // are not promoted into openable candidates without explicit HTTP(S) syntax.
  if (!/^https?:\/\//i.test(trimmed) || trimmed.includes("\\") || /\s/.test(trimmed)) {
    return {
      ...base,
      displayValue: trimmed,
      navigationUrl: null,
      matchKey: null,
      normalizationVersion: "whatwg-http-v1",
      hadFragment: false,
      displayDomain: url.hostname || null,
      protocol,
      state: "invalid_url"
    };
  }

  if (!url.hostname) {
    return {
      ...base,
      displayValue: trimmed,
      navigationUrl: null,
      matchKey: null,
      normalizationVersion: "whatwg-http-v1",
      hadFragment: false,
      displayDomain: null,
      protocol,
      state: "invalid_url"
    };
  }

  const navigationUrl = url.toString();
  const hadFragment = Boolean(url.hash);
  const matchUrl = new URL(navigationUrl);
  matchUrl.hash = "";
  const matchKey = matchUrl.toString();
  return {
    ...base,
    displayValue: navigationUrl,
    navigationUrl,
    matchKey,
    normalizationVersion: "whatwg-http-v1",
    hadFragment,
    displayDomain: url.hostname,
    protocol,
    state: "syntax_accepted"
  };
}

export function buildResourceSourceEvidenceItems(input: {
  recordId: string;
  url?: string | null;
  externalSources: readonly string[];
}): ResourceSourceEvidenceItem[] {
  const values: StoredSourceValue[] = [];
  if (input.url?.trim()) {
    values.push({
      value: input.url,
      provenance: "legacy_record_url",
      evidenceField: "url",
      evidenceId: `${input.recordId}:url`
    });
  }
  input.externalSources.forEach((value, index) => {
    if (!value.trim()) return;
    values.push({
      value,
      provenance: "legacy_external_source",
      evidenceField: `externalSources[${index}]`,
      evidenceId: `${input.recordId}:externalSources[${index}]`
    });
  });
  return values.map(inspectResourceSourceValue);
}

export function resourceSourceCandidatesFromEvidence(
  evidence: readonly ResourceSourceEvidenceItem[]
): ResourceSourceCandidate[] {
  const seen = new Set<string>();
  const candidates: ResourceSourceCandidate[] = [];

  for (const item of evidence) {
    if (!item.navigationUrl || !item.matchKey || item.state !== "syntax_accepted" || !item.displayDomain) continue;
    if (seen.has(item.matchKey)) continue;
    seen.add(item.matchKey);
    candidates.push({
      value: item.navigationUrl,
      matchKey: item.matchKey,
      normalizationVersion: item.normalizationVersion,
      hadFragment: item.hadFragment,
      provenance: item.provenance,
      evidenceField: item.evidenceField,
      displayDomain: item.displayDomain,
      state: "syntax_accepted"
    });
  }

  return candidates;
}

export function normalizeResourceExternalUrl(value: string): string | null {
  const evidence = inspectResourceSourceValue({
    value,
    provenance: "legacy_external_source",
    evidenceField: "normalization"
  });
  return evidence.matchKey;
}

function acceptedUrls(resource: ResourceRecord): Set<string> {
  return new Set(resource.source.candidates.map((candidate) => candidate.matchKey));
}

export function buildResourceSourceEvidenceReport(
  resource: ResourceRecord,
  resources: readonly ResourceRecord[]
): ResourceSourceEvidenceReport {
  const selectedUrls = acceptedUrls(resource);
  const exactResourceMatches: ResourceExactUrlMatch[] = [];

  for (const candidateResource of resources) {
    if (candidateResource.id === resource.id) continue;
    const normalizedUrls = Array.from(acceptedUrls(candidateResource))
      .filter((value) => selectedUrls.has(value))
      .sort();
    if (!normalizedUrls.length) continue;
    exactResourceMatches.push({
      target: candidateResource.nativeRef,
      normalizedUrls
    });
  }

  exactResourceMatches.sort((left, right) =>
    (left.target.label || left.target.objectId).localeCompare(
      right.target.label || right.target.objectId,
      undefined,
      { sensitivity: "base" }
    )
  );

  const acceptedCount = resource.source.evidence.filter(
    (item) => item.state === "syntax_accepted"
  ).length;
  return {
    entries: resource.source.evidence,
    acceptedCount,
    withheldCount: resource.source.evidence.length - acceptedCount,
    exactResourceMatches
  };
}
