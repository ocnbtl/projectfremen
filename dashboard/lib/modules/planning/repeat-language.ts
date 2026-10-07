import { Temporal } from "@js-temporal/polyfill";
import { parseBirthday } from "../people/birthday";
import type { BirthdaySource } from "./observances";

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
  let text=normalize(input).replace(/^(?:i (?:want|would like)(?: to)?\s+)?repeat\s+/,""), suffix="";
  const count=text.match(/ for (\d+) (?:times|occurrences)$/);
  if(count) { if (+count[1]<1 || +count[1]>5000) throw new Error("Choose between 1 and 5,000 occurrences"); suffix=`;COUNT=${+count[1]}`;text=text.slice(0,count.index); }
  const rule=(recurrence:string,label:string):RepeatRule=>({recurrence:recurrence+suffix,recurrenceAnchor:null,label:label+(count?` · ${count[1]} occurrences`:"")});
  const simple=text.match(/^every (?:(\d+) )?(day|week|month|year)s?$/);
  if(simple) { const n=Number(simple[1]||1);if(n<1||n>365)throw new Error("Choose an interval between 1 and 365");return rule(`FREQ=${({day:"DAILY",week:"WEEKLY",month:"MONTHLY",year:"YEARLY"})[simple[2]]};INTERVAL=${n}`,`Every ${n===1?"":n+" "}${simple[2]}${n===1?"":"s"}`); }
  if (/^every weekdays?$/.test(text)) return rule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR","Every weekday");
  if (/^every weekends?$/.test(text)) return rule("FREQ=WEEKLY;BYDAY=SA,SU","Every weekend");
  const ordinal=text.match(/^every (first|second|third|fourth|last) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: (?:of|in) (?:the |each |every )?month)?$/);
  if(ordinal) return rule(`FREQ=MONTHLY;BYDAY=${({first:1,second:2,third:3,fourth:4,last:-1})[ordinal[1]]}${codes[weekdays.indexOf(ordinal[2])]}`,text[0].toUpperCase()+text.slice(1));
  const namedDays=text.replace(/^every /,"").split(/\s*(?:,| and )\s*/).filter(Boolean);
  if(text.startsWith("every ") && namedDays.every(d=>weekdays.includes(d))) return rule(`FREQ=WEEKLY;BYDAY=${[...new Set(namedDays.map(d=>codes[weekdays.indexOf(d)]))].join(",")}`,text[0].toUpperCase()+text.slice(1));
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
    const date=text.match(/^(\d{1,2})[\/-](\d{1,2})$/), named=text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/);
    const month=date?+date[1]:named?months.indexOf(named[1])+1:0, day=date?+date[2]:named?+named[2]:0;
    if(month&&day)anchor={month,day,offsetDays:offset,label:`${months[month-1]} ${day}`};
  }
  if(!anchor) throw new Error("Try “every 17 days”, “every last Friday”, or “10 days before Halloween”. Use a saved person's name for birthdays. This wording isn't supported yet.");
  if(suffix)throw new Error("A count with a holiday or birthday rule isn't supported yet. Remove the occurrence count.");
  validateRepeatAnchor(anchor);
  return {recurrence:"FREQ=YEARLY",recurrenceAnchor:anchor,label:`Every year${offset?` ${Math.abs(offset)} days ${offset<0?"before":"after"}`:" on"} ${anchor.label}${anchor.month===2&&anchor.day===29?" (leap years)":""}`};
}
