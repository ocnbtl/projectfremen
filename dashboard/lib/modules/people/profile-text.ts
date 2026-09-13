import { normalizeBirthday } from "./birthday";
import { personNameKey, personProfileLink, type PersonAutofillResult, type PersonJobSuggestion, type PersonEducationSuggestion } from "./person-autofill";

export const MAX_PROFILE_TEXT_LENGTH = 60_000;
const sectionNames = /^(About|Experience|Education|Contact info|Activity|Skills|Licenses (?:&|and) certifications|Certifications|Volunteering|Volunteer experience|Recommendations|Interests|Languages|Honors (?:&|and) awards|Projects|Publications|Courses|Organizations|People also viewed|People you may know|More profiles for you|Other similar profiles|You might like|Featured|Services)$/i;
const employment = /^(?:Full[- ]time|Part[- ]time|Self-employed|Freelance|Contract|Internship|Apprenticeship|Seasonal|Temporary)(?:\s*[·•].*)?$/i;
const duration = /^(?:(?:Full[- ]time|Part[- ]time|Self-employed|Freelance|Contract)\s*[·•]\s*)?\d+\s+(?:yrs?|years?|mos?|months?)(?:\s+\d+\s+(?:mos?|months?))?$/i;
const dateRange = /^((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2})\s*[-–—]\s*(Present|Current|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2})(?:\s*[·•(].*)?$/i;
const noise = /^(?:.+ logo|Show all.*|Show more|See more|See less|…see more|\.\.\.see more|Skills:.*|On-site|Remote|Hybrid|Contact info|Message|Connect|Follow|More|Save|Pending|\d[\d,+]* (?:connections|followers)|(?:1st|2nd|3rd) degree connection)$/i;
const value = (line: string) => line.replace(/\s*[·•]\s*(?:Full[- ]time|Part[- ]time|Self-employed|Freelance|Contract|Internship|Apprenticeship|Seasonal|Temporary).*$/i, "").trim();
const label = (line: string) => line && line.length <= 200 && !noise.test(line) && !employment.test(line) && !duration.test(line) && !dateRange.test(line) && !/^https?:\/\//.test(line);

function timing(range: RegExpMatchArray): "current" | "past" | undefined {
  const start = Date.parse(range[1]);
  if (Number.isNaN(start) || start > Date.now()) return undefined;
  if (/^(?:Present|Current)$/i.test(range[2])) return "current";
  const end = Date.parse(range[2]);
  if (Number.isNaN(end) || end < start) return undefined;
  // A graduation year later this year is still in progress unless an end month says otherwise.
  return /^\d{4}$/.test(range[2]) ? (Number(range[2]) >= new Date().getFullYear() ? "current" : "past") : end > Date.now() ? "current" : "past";
}

function shortAbout(input: string, name: string): string {
  const thirdPerson = input.replace(/^I(?:['’]m| am)\b/i, `${name} is`).replace(/^I work\b/i, `${name} works`);
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(thirdPerson)].slice(0, 2).map((item) => item.segment.trim()
    .replace(/^I(?:['’]m| am)\b/i, "They are").replace(/^I was\b/i, "They were").replace(/^I['’]ve\b/i, "They have").replace(/^I['’]ll\b/i, "They will").replace(/^I\b/, "They").replace(/^My\b/, "Their")).join(" ");
  return sentences.length <= 500 ? sentences : `${sentences.slice(0, 497).replace(/\s+\S*$/, "")}…`;
}

/** Parse text deliberately supplied by the user. Runs locally; it never reads the clipboard or fetches LinkedIn. */
export function extractPastedPersonProfile(name: string, sourceUrl: string, profileText: string): PersonAutofillResult {
  if (!name.trim()) throw new Error("Enter the person's name first.");
  const source = personProfileLink(sourceUrl);
  if (source?.field !== "linkedin") throw new Error("Add the person's LinkedIn profile link first.");
  if (!profileText.trim()) throw new Error("Paste the profile name and the About, Experience, and Education sections.");
  if (profileText.length > MAX_PROFILE_TEXT_LENGTH) throw new Error("Paste just the profile name, About, Experience, Education, and contact links (up to 60,000 characters).");
  if (/<(?:script|html|body)\b/i.test(profileText)) throw new Error("Paste the visible profile text, not page HTML.");
  const lines = profileText.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").split("\n")
    .map((line) => line.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean)
    .filter((line, index, all) => index === 0 || line !== all[index - 1]);
  const boundary = lines.findIndex((line) => /^(About|Experience|Education|Activity|People also viewed|People you may know|More profiles for you)$/i.test(line));
  const identityLines = lines.slice(0, Math.min(boundary < 0 ? 80 : boundary, 80));
  const identityIndex = identityLines.findIndex((line) => personNameKey(line.replace(/\s*\([^)]*\)\s*$/, "").split(/\s+[·•]\s+/)[0]) === personNameKey(name));
  if (identityIndex < 0) throw new Error(`The pasted profile header must include ${name}. Copy the name along with the profile sections so another person's details aren't mixed in.`);
  const sections = new Map<string, string[]>();
  let section = "header";
  for (const line of lines.slice(identityIndex)) {
    if (sectionNames.test(line)) {
      section = line.toLowerCase();
      // Stop before recommendations for other people, including their biographies.
      if (/^(?:people also viewed|people you may know|more profiles for you|other similar profiles|you might like)$/.test(section)) break;
      if (!sections.has(section)) sections.set(section, []);
    } else {
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section)!.push(line);
    }
  }
  const result: PersonAutofillResult = { suggestions: [], occupations: [], education: [], sources: [source.url], fetchedAt: new Date().toISOString(), method: "pasted_text", message: "Read from the profile text you supplied. Review the fields before Save; the text was not independently verified with LinkedIn." };
  const evidence = (detail: string) => ({ sourceUrl: source.url, evidence: `${detail} in profile text supplied by you` });
  const work = sections.get("experience") || [];
  let previousDate = -1, groupEmployer = "", groupStart = -1;
  for (let index = 0; index < work.length; index++) {
    const logo = work[index].match(/^(.+) logo$/i);
    if (logo && personNameKey(logo[1]) !== personNameKey(groupEmployer)) { groupEmployer = ""; groupStart = -1; previousDate = index; }
    if (duration.test(work[index]) && index > 0 && label(work[index - 1])) {
      groupEmployer = value(work[index - 1]); groupStart = index; continue;
    }
    const range = work[index].match(dateRange);
    if (!range) continue;
    const status = timing(range);
    const candidates = work.slice(Math.max(previousDate + 1, groupStart + 1), index).filter((line) => label(line));
    previousDate = index;
    if (!status || !candidates.length) continue;
    let title = "", employer = "";
    const last = candidates.at(-1)!;
    if (candidates.length >= 2 && (/\s*[·•]\s*/.test(last) || !groupEmployer)) {
      title = candidates.at(-2)!; employer = value(last); groupEmployer = ""; groupStart = -1;
    } else if (groupEmployer) { title = last; employer = groupEmployer; }
    if (title && employer) result.occupations.push({ title, employer, status, ...evidence("Role, employer, and dates") });
  }
  // A clear headline is useful even when the Experience section wasn't copied.
  if (!result.occupations.length) {
    const headline = (sections.get("header") || []).slice(1, 5).find((line) => label(line) && /^.{2,100}\s+at\s+.{2,140}$/i.test(line));
    const match = headline?.match(/^(.{2,100}?)\s+at\s+(.{2,140})$/i);
    if (match && !/\b(?:student|studying|aspiring|seeking|former|previously)\b/i.test(match[1])) result.occupations.push({ title: match[1], employer: match[2], status: "current", ...evidence("Explicit profile headline") });
  }
  const education = sections.get("education") || [];
  previousDate = -1;
  for (let index = 0; index < education.length; index++) {
    const range = education[index].match(dateRange);
    if (!range) continue;
    const status = timing(range);
    const candidates = education.slice(previousDate + 1, index).filter((line) => label(line));
    previousDate = index;
    if (!status || !candidates.length) continue;
    const degree = candidates.at(-1)!;
    const hasDegree = /\b(?:bachelor|master|doctor|associate|diploma|certificate|degree|high school|secondary school|BS|BA|BSc|BBA|BFA|BTech|MS|MA|MSc|MBA|MFA|PhD|MD|JD)\b/i.test(degree) && candidates.length >= 2;
    const institution = hasDegree ? candidates.at(-2)! : degree;
    if (!hasDegree && !/\b(?:university|college|school|institute|academy|polytechnic)\b/i.test(institution)) continue;
    const [degreeName, ...study] = hasDegree ? degree.split(/\s*[·•,]\s*/) : [];
    result.education.push({ institution, ...(degreeName ? { degree: degreeName, fieldOfStudy: study.join(", ") || undefined } : {}), status, ...evidence("School, qualification when specified, and dates") });
  }
  // A named school plus an explicit qualification is useful even when no dates were copied.
  for (let index = 0; index < education.length - 1; index++) {
    const institution = education[index], qualification = education[index + 1];
    if (!label(institution) || !/\b(?:university|college|school|institute|academy|polytechnic)\b/i.test(institution) || !/^(?:Bachelor|Master|Doctor|Associate|Diploma|Certificate|High School Diploma|BS\b|BA\b|BSc\b|BBA\b|MS\b|MA\b|MSc\b|MBA\b|PhD\b|MD\b|JD\b)/i.test(qualification)) continue;
    if (result.education.some((entry) => personNameKey(entry.institution) === personNameKey(institution))) continue;
    const [degree, ...study] = qualification.split(/\s*[·•,]\s*/);
    result.education.push({ institution, degree, fieldOfStudy: study.join(", ") || undefined, ...evidence("School and explicit qualification; timing was not supplied") });
  }
  result.occupations = [...new Map(result.occupations.map((job) => [[personNameKey(job.title), personNameKey(job.employer || ""), job.status].join("|"), job])).values()].slice(0, 24) as PersonJobSuggestion[];
  result.education = [...new Map(result.education.map((school) => [[personNameKey(school.institution), personNameKey(school.degree || "")].join("|"), school])).values()].slice(0, 16) as PersonEducationSuggestion[];
  const about = (sections.get("about") || []).filter((line) => !noise.test(line)).join(" ");
  const current = result.occupations.find((job) => job.status === "current");
  const summary = about ? shortAbout(about, name) : current ? `${name} works as ${current.title} at ${current.employer}.` : "";
  if (summary) result.suggestions.push({ field: "context", value: summary, ...evidence(about ? "About section" : "Summary of the current role") });
  // Only header/contact links belong to this person; links in employer, school, and activity sections do not.
  const contact = [...(sections.get("header") || []), ...(sections.get("contact info") || [])];
  for (const raw of contact.join("\n").match(/https?:\/\/[^\s<>"']+/g) || []) {
    const link = personProfileLink(raw.replace(/[),.;]+$/, ""));
    if (!link || link.field === "linkedin" && link.url !== source.url) continue;
    result.suggestions.push({ ...link, value: link.url, ...evidence("Contact link") });
  }
  for (let index = 0; index < contact.length; index++) {
    const raw = contact[index].match(/^Birthday\s*:?\s*(.*)$/i)?.[1];
    if (raw === undefined) continue;
    const birthday = raw || contact[index + 1] || "";
    const words = birthday.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
    const month = words ? new Date(`${words[1]} 1, 2000`).getMonth() + 1 : 0;
    const normalized = normalizeBirthday(words ? `${words[3] || "-"}-${String(month).padStart(2, "0")}-${words[2].padStart(2, "0")}` : birthday);
    if (normalized && (!/^\d{4}/.test(normalized) || normalized <= new Date().toISOString().slice(0, 10))) result.suggestions.push({ field: "birthday", value: normalized, ...evidence("Explicit birthday") });
  }
  const byField = new Map<string, PersonAutofillResult["suggestions"][number]>(), conflicts = new Set<string>();
  for (const item of result.suggestions) {
    if (byField.has(item.field) && byField.get(item.field)!.value !== item.value) conflicts.add(item.field);
    else byField.set(item.field, item);
  }
  result.suggestions = [...byField.values()].filter((item) => !conflicts.has(item.field));
  if (!result.suggestions.length && !result.occupations.length && !result.education.length) result.message = "No clear About, work, education, or contact details were found. Include the section headings and the dates below each role or school, or enter the fields directly.";
  return result;
}
