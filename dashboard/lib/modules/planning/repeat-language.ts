import { Temporal } from "@js-temporal/polyfill";
import { parseBirthday } from "../people/birthday";
import type { BirthdaySource } from "./observances";
import { normalizeRepeatPhrasing, repeatWeekdays } from "./repeat-phrasing";

/** Annual anchors preserve offsets across leap years and year boundaries. */
export type RepeatAnchor = { month: number; day: number; offsetDays: number; label: string; personId?: string };
export type RepeatRule = { recurrence: string; recurrenceAnchor: RepeatAnchor | null; label: string };
export const repeatPresets = [
  ["", "Does not repeat"], ["FREQ=DAILY", "Every day"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
  ["FREQ=WEEKLY", "Every week"], ["FREQ=MONTHLY", "Every month"], ["FREQ=YEARLY", "Every year"],
] as const;
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const fixedHolidays: Record<string, [number,number,string]> = {
  halloween:[10,31,"Halloween"], christmas:[12,25,"Christmas"], "christmas day":[12,25,"Christmas"],
  "christmas eve":[12,24,"Christmas Eve"], "new year's day":[1,1,"New Year's Day"], "new years day":[1,1,"New Year's Day"],
  "new year's eve":[12,31,"New Year's Eve"], "valentine's day":[2,14,"Valentine's Day"],
  "independence day":[7,4,"Independence Day (US)"], "veterans day":[11,11,"Veterans Day (US)"],
};
const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g," ").trim();
export function validateRepeatAnchor(value: unknown): RepeatAnchor | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid repeat reference");
  const a=value as RepeatAnchor;
  if (![a.month,a.day,a.offsetDays].every(Number.isInteger) || Math.abs(a.offsetDays)>366 || typeof a.label!=="string" || !a.label.trim() || a.label.length>240 || (a.personId!==undefined && (typeof a.personId!=="string" || !a.personId || a.personId.length>300))) throw new Error("Invalid repeat reference");
  Temporal.PlainDate.from({year:2000,month:a.month,day:a.day},{overflow:"reject"});
  return {month:a.month,day:a.day,offsetDays:a.offsetDays,label:a.label,...(a.personId ? {personId:a.personId} : {})};
}
export function anchoredDay(anchor: RepeatAnchor, year: number, birthdays?: BirthdaySource[]): string | null {
  const person = anchor.personId && birthdays?.find(p=>p.ref.objectId===anchor.personId);
  // Do not silently reuse a removed birthday when current People data is available.
  if (anchor.personId && birthdays && !person) return null;
  const birthday = person ? parseBirthday(person.birthday) : anchor;
  if (!birthday) return null;
  try { return Temporal.PlainDate.from({year,month:birthday.month,day:birthday.day},{overflow:"reject"}).add({days:anchor.offsetDays}).toString(); }
  catch { return null; } // February 29 repeats in leap years only, matching People.
}

/** Deliberately bounded grammar: reject uncertain meaning instead of guessing a schedule. */
export function parseRepeatLanguage(input: string, birthdays: BirthdaySource[] = []): RepeatRule {
  let text=normalizeRepeatPhrasing(input), suffix="";
  text=text.replace(/ (until|through|ending on) ([a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/, (all,word,month,day,year)=>{const m=months.findIndex(name=>name===month||name.slice(0,3)===month)+1;return m?` ${word} ${year}-${String(m).padStart(2,"0")}-${day.padStart(2,"0")}`:all;});
  const until=text.match(/ (?:until|through|ending on) (\d{4}-\d{2}-\d{2})$/);
  if(until) {Temporal.PlainDate.from(until[1],{overflow:"reject"});suffix=`;UNTIL=${until[1].replaceAll("-","")}T235959`;text=text.slice(0,until.index);}
  const count=text.match(/ for (\d+) (?:times|occurrences)$/);
  if(count) { if (until)throw new Error("Choose either an end date or an occurrence count");if (+count[1]<1 || +count[1]>5000) throw new Error("Choose between 1 and 5,000 occurrences"); suffix=`;COUNT=${+count[1]}`;text=text.slice(0,count.index); }
  const rule=(recurrence:string,label:string):RepeatRule=>({recurrence:recurrence+suffix,recurrenceAnchor:null,label:label+(count?` · ${count[1]} occurrences`:until?` · through ${until[1]}`:"")});
  const label=()=>text[0].toUpperCase()+text.slice(1);
  const interval=(value:string|undefined)=>{const n=Number(value||1);if(n<1||n>365)throw new Error("Choose an interval between 1 and 365");return n;};
  const excluded=text.match(/^(every (?:\d+ )?(?:day|week)s?)(?: except | excluding )(.+)$/);
  if(excluded){const omit=repeatWeekdays(excluded[2]);if(!omit)throw new Error("Name the weekdays to exclude");const keep=codes.filter(d=>!omit.includes(d));if(!keep.length)throw new Error("Keep at least one weekday");const base=excluded[1].match(/^every (?:(\d+) )?(day|week)s?$/)!;return rule(`FREQ=${base[2]==="day"?"DAILY":"WEEKLY"};INTERVAL=${interval(base[1])};BYDAY=${keep.join(",")}`,label());}
  const weekly=text.match(/^every (?:(\d+) )?weeks?(?: on)? (.+)$/);
  if(weekly){const chosen=repeatWeekdays(weekly[2]);if(chosen)return rule(`FREQ=WEEKLY;INTERVAL=${interval(weekly[1])};BYDAY=${chosen.join(",")}`,label());}
  // Ordinal weekdays and month dates can be expressed in either natural word order.
  text=text.replace(/^every (?:(\d+) )?months? on (?:the )?(.+)$/,(_,n,days)=>`every ${days} of every ${n||1} month`)
    .replace(/^on (?:the )?(.+?) (?:of )?every month$/, "every $1 of every 1 month")
    .replace(/^the (.+) of every month$/, "every $1 of every 1 month")
    .replace(/^every the /,"every ");
  const positions:Record<string,number>={first:1,second:2,third:3,fourth:4,fifth:5,last:-1,"second to last":-2};
  const sharedOrdinal=text.match(/^every (first|second|third|fourth|fifth|last) and (first|second|third|fourth|fifth|last) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: of (?:the |every )?month)?$/);
  if(sharedOrdinal) return rule(`FREQ=MONTHLY;BYDAY=${positions[sharedOrdinal[1]]}${codes[weekdays.indexOf(sharedOrdinal[3])]},${positions[sharedOrdinal[2]]}${codes[weekdays.indexOf(sharedOrdinal[3])]}`,label());
  const ord=text.match(/^every (first|second|third|fourth|fifth|last|second to last|[1-5](?:st|nd|rd|th)) (sunday|monday|tuesday|wednesday|thursday|friday|saturday|weekday|weekend day)(?: (?:of|in) (?:the |each |every )?(?:(\d+) )?(month|january|february|march|april|may|june|july|august|september|october|november|december))?$/);
  if(ord){const pos=positions[ord[1]]||parseInt(ord[1]),month=ord[4]&&ord[4]!=="month"?months.indexOf(ord[4])+1:0;const by=ord[2]==="weekday"?"MO,TU,WE,TH,FR":ord[2]==="weekend day"?"SA,SU":codes[weekdays.indexOf(ord[2])];return rule(`FREQ=${month?"YEARLY":"MONTHLY"}${month?`;BYMONTH=${month}`:ord[3]&&+ord[3]!==1?`;INTERVAL=${interval(ord[3])}`:""};BYDAY=${by.includes(",")?by:pos+by}${by.includes(",")?`;BYSETPOS=${pos}`:""}`,label());}
  const monthDays=text.match(/^every (.+?)(?: (?:of|in) (?:the |each |every )?(?:(\d+) )?month)$/);
  if(monthDays){const dates=monthDays[1].replace(/\b(?:the|day)\b/g,"").trim().split(/\s*(?:,\s*(?:and )?| and | & )\s*/).map(d=>d==="last"?-1:/^\d{1,2}(?:st|nd|rd|th)?$/.test(d)?parseInt(d):NaN);if(dates.length&&dates.every(d=>Number.isInteger(d)&&(d===-1||d>=1&&d<=31)))return rule(`FREQ=MONTHLY;INTERVAL=${interval(monthDays[2])};BYMONTHDAY=${[...new Set(dates)].join(",")}`,`${label()}${dates.some(d=>d>28)?" · skips months without that date":""}`);}
  const simple=text.match(/^every (?:(\d+) )?(day|week|month|year)s?$/);
  if(simple) { const n=Number(simple[1]||1);if(n<1||n>365)throw new Error("Choose an interval between 1 and 365");return rule(`FREQ=${({day:"DAILY",week:"WEEKLY",month:"MONTHLY",year:"YEARLY"})[simple[2]]};INTERVAL=${n}`,`Every ${n===1?"":n+" "}${simple[2]}${n===1?"":"s"}`); }
  if (/^every weekdays?$/.test(text)) return rule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR","Every weekday");
  if (/^every weekends?$/.test(text)) return rule("FREQ=WEEKLY;BYDAY=SA,SU","Every weekend");
  const namedDays=repeatWeekdays(text.replace(/^every /,""));
  if(namedDays) return rule(`FREQ=WEEKLY;BYDAY=${namedDays.join(",")}`,label());
  text=text.replace(/ (?:every year|annually|yearly)$/, "").replace(/^every year on /,"");
  text=text.replace(/^every year(?: on)? /,"").replace(/^every /,"");
  let offset=0;
  const relative=text.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (days?|weeks?) (before|after) (.+)$/);
  if(relative) { const words=["zero","one","two","three","four","five","six","seven","eight","nine","ten"];offset=(/^\d+$/.test(relative[1])?+relative[1]:words.indexOf(relative[1]))*(relative[2].startsWith("week")?7:1)*(relative[3]==="before"?-1:1);text=relative[4]; }
  let anchor:RepeatAnchor|undefined;
  const birthday=text.match(/^(.+?)(?:'s|') birthday$/);
  if(birthday) {
    const name=birthday[1], exact=birthdays.filter(p=>normalize(p.ref.label)===name), matches=exact.length?exact:birthdays.filter(p=>normalize(p.ref.label).split(" ")[0]===name);
    if(matches.length!==1) throw new Error(matches.length?"More than one person matches. Use their full name.":"No saved birthday matches. Use the person's full name and check their birthday in People.");
    const parts=parseBirthday(matches[0].birthday);if(!parts)throw new Error("This person needs a valid birthday in People");
    anchor={month:parts.month,day:parts.day,offsetDays:offset,label:`${matches[0].ref.label}'s birthday`,personId:matches[0].ref.objectId};
  } else if(fixedHolidays[text]) { const [month,day,label]=fixedHolidays[text];anchor={month,day,label,offsetDays:offset}; }
  else {
    text=text.replace(/^on /,"").replace(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)$/,"$2 $1");
    const date=text.match(/^(\d{1,2})[\/-](\d{1,2})$/), named=text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/);
    const month=date?+date[1]:named?months.findIndex(m=>m===named[1]||m.slice(0,3)===named[1])+1:0, day=date?+date[2]:named?+named[2]:0;
    if(month&&day)anchor={month,day,offsetDays:offset,label:`${months[month-1]} ${day}`};
  }
  if(!anchor) throw new Error("Try “every 17 days”, “every last Friday”, or “10 days before Halloween”. Use a saved person's name for birthdays. This wording isn't supported yet.");
  if(suffix)throw new Error("End dates and counts for birthday or holiday references aren't supported yet. Use the annual rule without that limit.");
  validateRepeatAnchor(anchor);
  return {recurrence:"FREQ=YEARLY",recurrenceAnchor:anchor,label:`Every year${offset?` ${Math.abs(offset)} days ${offset<0?"before":"after"}`:" on"} ${anchor.label}${anchor.month===2&&anchor.day===29?" (leap years)":""}`};
}
