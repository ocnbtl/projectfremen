/** Normalize conversational wording without discarding meaningful constraints. */
export function normalizeRepeatPhrasing(input: string): string {
  let text=input.toLowerCase().replace(/[’‘]/g,"'").replace(/(\d)(days?|weeks?|months?|years?)\b/g,"$1 $2").replace(/\s+/g," ").trim().replace(/[.!]+$/, "");
  text=text.replace(/^please /,"").replace(/^(?:can|could|would) you (?:please )?/,"")
    .replace(/^(?:i want|i would like|i'd like)(?: (?:this|the) event)?(?: to)? /,"")
    .replace(/^(?:(?:this|the) event (?:should|needs to) |(?:set|make) (?:this|the) event (?:to )?)/,"")
    .replace(/^(?:repeat|recur|repeats|recurs)(?: (?:this|the) event)?(?: (?:it|on))? /,"")
    .replace(/^please /,"");
  const small=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens=["twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  text=text.replace(new RegExp(`\\b(${tens.join("|")})(?:[- ](${small.slice(1,10).join("|")}))?(?= (?:days?|weeks?|months?|years?|times|occurrences)\\b)`,"g"),(_,a:string,b:string)=>String((tens.indexOf(a)+2)*10+(b?small.indexOf(b):0)))
    .replace(new RegExp(`\\b(${small.join("|")})(?= (?:days?|weeks?|months?|years?|times|occurrences)\\b)`,"g"),a=>String(small.indexOf(a)));
  text=text.replace(/\b(?:business|working|work) days\b/g,"weekdays").replace(/\bbusiness day\b/g,"weekday")
    .replace(/\bfortnightly\b/g,"every 2 weeks").replace(/\bfortnight\b/g,"2 weeks")
    .replace(/\bevery other\b/g,"every 2").replace(/^each /,"every ")
    .replace(/^(?:once (?:a|per)|every single) /,"every ").replace(/^once every /,"every ")
    .replace(/^daily\b/,"every day").replace(/^weekly\b/,"every week").replace(/^monthly\b/,"every month")
    .replace(/^(?:annually|yearly|annually recurring)\b/,"every year").replace(/^quarterly\b/,"every 3 months")
    .replace(/\beach year\b/g,"every year").replace(/\beach month\b/g,"every month").replace(/^everyday$/,"every day")
    .replace(/\bthe day (before|after)\b/g,"1 day $1").replace(/\b(?:a|one) week (before|after)\b/g,"1 week $1")
    .replace(/\bthe birthday of (.+)$/, "$1's birthday");
  const weekdays=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  for(const day of weekdays) text=text.replace(new RegExp(`\\b${day}s\\b`,"g"),day).replace(new RegExp(`\\b${day.slice(0,3)}\\b`,"g"),day);
  return text.replace(/\s+/g," ").trim();
}

const days=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const codes=["SU","MO","TU","WE","TH","FR","SA"];
export function repeatWeekdays(text: string): string[] | null {
  if(/^(?:every )?weekdays?$/.test(text)) return codes.slice(1,6);
  if(/^(?:every )?weekends?$/.test(text)) return ["SA","SU"];
  const selected:string[]=[];
  for(const part of text.replace(/^(?:on|every) /,"").split(/\s*(?:,\s*(?:and )?| and | & )\s*/)) {
    const range=part.match(/^([a-z]+)\s*(?:through|to|-)\s*([a-z]+)$/);
    if(range) {
      const start=days.indexOf(range[1]),end=days.indexOf(range[2]);if(start<0||end<0)return null;
      for(let i=start;i<start+7;i++){selected.push(codes[i%7]);if(i%7===end)break;}
    } else {const index=days.indexOf(part);if(index<0)return null;selected.push(codes[index]);}
  }
  return selected.length?[...new Set(selected)]:null;
}
