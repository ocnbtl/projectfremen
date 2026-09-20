/** Editorial prose is separate from extraction: never use a rewritten summary as
 * evidence for another field. No facts, locations or legal status are invented. */
const verbs: Record<string, string> = {
  are: "is", have: "has", offer: "offers", provide: "provides", deliver: "delivers", create: "creates",
  design: "designs", build: "builds", develop: "develops", manufacture: "manufactures", sell: "sells",
  serve: "serves", support: "supports", operate: "operates", manage: "manages", represent: "represents",
  publish: "publishes", produce: "produces", connect: "connects", help: "helps", specialize: "specializes",
  focus: "focuses", rescue: "rescues", distribute: "distributes", teach: "teaches", supply: "supplies",
};
const participles: Record<string, string> = { offering: "offers", providing: "provides", delivering: "delivers", creating: "creates", designing: "designs", building: "builds", developing: "develops", manufacturing: "manufactures", selling: "sells", serving: "serves", supporting: "supports", operating: "operates", managing: "manages", representing: "represents", publishing: "publishes", specializing: "specializes" };
// Lowercase known prose words only. Whole-string lowercasing damages names,
// products, locations and acronyms (Workday, URBN, Ohio State, IT, J.D.).
const proseWords = new Set(("a an the and or in of for to with through across from by at as on into including " +
  "private public customized guided boat yacht charters tours charter rental rentals villa villas beachfront property management " +
  "software development cloud hosting tools field research consulting firm services service technology business company " +
  "nonprofit non-profit animal rescue school university college hospital clinic healthcare legal counsel agency studio " +
  "fashion brand clothing apparel retail consumer products snacks drinks essentials delivery grocery groceries " +
  "offering providing specializing creating serving operating representing designing manufacturing publishing " +
  "design construction residential commercial industrial engineering architecture accounting insurance finance " +
  "education training primary secondary medical patient care professional team people community local mobile massage reflexology body scrub exfoliation chain hotels resorts " +
  "international global independent online digital marketing talent modeling entertainment media restaurant hotel " +
  "chef concierge pools beaches transport transportation logistics shipping freight veterinary dental solar energy " +
  "real estate lender law school degree programs graduate undergraduate doctoral sales support strategy " +
  "is are offers provides delivers creates designs builds develops manufactures sells serves supports operates manages " +
  "represents publishes produces connects helps specializes focuses supplies").split(/\s+/));
const roles = /\b(?:company|firm|agency|organization|organisation|university|school|college|hospital|clinic|rescue|charity|foundation|association|network|manufacturer|retailer|lender|bank|credit union|studio|practice|bakery|country club|brand|health system|chain of (?:hotels|resorts))\b/i;
const offerings = /\b(?:charters?|tours?|rentals?|management|services?|software|hosting|tools|counsel|delivery|financing|construction|engineering|training|education|research|care|clothing|apparel|products|snacks|groceries|drinks|essentials|consulting|transport|shipping|manufacturing|installation|catering|pastries|cakes|massage|reflexology|body scrub|exfoliation)\b/i;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const article = (phrase: string) => /^(?:uni(?:vers|que|t)|euro|one\b|US\b)/i.test(phrase) ? "a" : /^(?:[aeiou]|honest|hour|MBA\b)/i.test(phrase) ? "an" : "a";
function clean(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|nbsp|quot|apos|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi,
    entity => ({ amp: "&", nbsp: " ", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: '"', ldquo: '"', ndash: "–", mdash: "—" })[entity.slice(1, -1).toLowerCase()] || " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
function sentenceCase(value: string, name: string): string {
  // Protect the full supplied name before changing common words inside prose.
  const parts = value.split(new RegExp(`(${escape(name)})`, "gi"));
  const words = parts.filter(part => part.toLowerCase() !== name.toLowerCase()).join(" ").match(/[\p{L}-]+/gu) || [];
  const sentenceVerb = /\b(?:is|was|has|offers|provides|delivers|creates|designs|builds|develops|manufactures|sells|serves|operates|manages|represents|publishes|specializes)\b/.test(value);
  const heading = !sentenceVerb && words.length > 1 && words.filter(word => /^[\p{Lu}]/u.test(word)).length / words.length > 0.65;
  return parts.map(part => part.toLowerCase() === name.toLowerCase() ? name : heading
    ? part.replace(/[\p{L}-]+/gu, word => proseWords.has(word.toLowerCase()) ? word.toLowerCase() : word)
    : part.replace(/^[\p{L}-]+/u, word => proseWords.has(word.toLowerCase()) ? word.toLowerCase() : word)).join("");
}
function neutralSentence(raw: string, name: string): string {
  let value = clean(raw);
  if (!value || /(?:\.{2,}|…|[?])\s*$/.test(value)) return "";
  // Reject slogans, instructions and uncertain/negative claims rather than
  // accidentally turning them into affirmative statements of services.
  if (/\b(?:no longer|do not|don't|does not|doesn't|used to|may offer|might offer|our clients|our partners|our vision|our mission|we believe|we aspire|we strive)\b/i.test(value)
    || /^(?:welcome|contact|learn|read|click|sign|subscribe|follow|book|order|shop|find out|get in touch)\b/i.test(value)) return "";
  value = value.replace(/[.!]+$/, "").replace(/\b(?:(a|an)\s+)?(?:award-winning|world-class|industry-leading|market-leading|best-in-class|unforgettable|innovative|premium|luxury|sophisticated|thoughtfully designed|leading|premier)\s+/gi,
    (_match, determiner: string | undefined, offset: number, input: string) => determiner ? article(input.slice(offset + _match.length)) + " " : "");
  // Convert a promotional invitation only when it names an actual offering.
  if (/^(?:discover|explore)\s/i.test(value)) {
    value = value.replace(/^(?:discover|explore)\s+/i, "");
    value = value.replace(new RegExp(`\\s+with\\s+${escape(name.replace(/\s+Antigua$/i, ""))}$`, "i"), "");
    if (!offerings.test(value)) return "";
    value = `${name} offers ${sentenceCase(value, name)}`;
  } else if (/^we(?:['’]re| are)\s+/i.test(value)) {
    value = `${name} is ${value.replace(/^we(?:['’]re| are)\s+/i, "")}`;
  } else if (/^we\s+/i.test(value)) {
    const match = value.match(/^we\s+(?:also\s+)?(\w+)\s+(.+)$/i);
    if (!match || !verbs[match[1].toLowerCase()]) return "";
    value = `${name} ${verbs[match[1].toLowerCase()]} ${match[2]}`;
  } else if (/^our\s/i.test(value)) return "";
  const participle = value.match(/^(\w+)\s+(.+)$/);
  if (participle && participles[participle[1].toLowerCase()]) value = `${name} ${participles[participle[1].toLowerCase()]} ${participle[2]}`;
  value = sentenceCase(value, name);
  const subject = value.match(new RegExp(`^(?:${escape(name)}|it|the (?:company|business|organization|university|school|hospital))\\s+(.+)$`, "i"));
  const predicate = /^(?:is|has|was|offers|provides|delivers|creates|designs|builds|develops|manufactures|sells|serves|supports|operates|manages|represents|publishes|produces|connects|helps|specializes|focuses|supplies|rescues|distributes|teaches)\s+\S/i;
  if (!subject || !predicate.test(subject[1])) {
    // Recognize noun phrases, not arbitrary headings such as "Our story".
    if (/\b(?:is|are|was|were|offers|provides|delivers|creates|sells|serves|operates)\b/i.test(value)) {
      // A published full legal name can be longer than the supplied short name.
      const named = value.match(/^(.+?)\s+(?:is|was|offers|provides|delivers|creates|sells|serves|operates)\s+\S/i);
      if (!named) return "";
      if (named[1].length >= 3 && name.toLowerCase().startsWith(named[1].toLowerCase() + " ")) value = name + value.slice(named[1].length);
      else if (!named[1].toLowerCase().startsWith(name.toLowerCase())) return "";
    } else if (roles.test(value)) {
      const phrase = value.replace(/^(?:a|an|the)\s+/i, "");
      value = `${name} is ${article(phrase)} ${phrase}`;
    } else if (offerings.test(value) && !/^(?:not|a guide|guide|options|about)\b|\boptions$/i.test(value)) {
      value = `${name} offers ${value.replace(/\s+offering\s+/i, ", including ")}`;
    } else return "";
  }
  if (/\b(?:we|our|us|you|your)\b/i.test(value) || /\b(?:best|greatest|unmatched|unrivalled|unrivaled|dream|spotlight)\b/i.test(value)) return "";
  if (/(?:\b(?:and|or|with|for|to|of|including|into|across)|[,;:–—-])\s*$/.test(value) || value.length > 800) return "";
  return value.replace(/^it\b/i, "It").replace(/^the\b/, "The") + ".";
}

/** Up to two complete, evidence-backed English sentences, or no suggestion when
 * the source only supplies a slogan. Names and meaningful casing are retained. */
export function writeOrganizationDescription(raw: string, organizationName: string): string {
  const name = clean(organizationName);
  if (!name) return "";
  const result: string[] = [];
  // Social bios use emoji and bullets instead of sentence boundaries. Keep only
  // independently meaningful service phrases; experience is not a founding year.
  const chunks = raw.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]+/gu, "\n").split(/[\n\r•|]+/).map(clean).filter(Boolean);
  const segments = chunks.flatMap(chunk => [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(chunk)].map(part => part.segment));
  for (const part of segments) {
    let sentence = neutralSentence(part, name);
    if (!sentence || result.includes(sentence)) continue;
    if (!result.length && /^(?:It|The (?:company|business|organization))\b/.test(sentence)) sentence = sentence.replace(/^(?:It|The (?:company|business|organization))\b/, name);
    if (result.length && sentence.startsWith(name + " ")) sentence = "It " + sentence.slice(name.length + 1);
    if ([...result, sentence].join(" ").length > 800) break;
    result.push(sentence);
    if (result.length === 2) break;
  }
  return result.join(" ");
}
