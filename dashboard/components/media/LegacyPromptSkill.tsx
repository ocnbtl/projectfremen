import { legacyAdPrompt } from "../../lib/writing/legacy-prompt";
import { skillToken } from "../../lib/writing/tokens";
import { WritingText } from "../writing/WritingText";

const copyPrompt = skillToken({id:"copy-prompt", name:"Copy prompt"});

export default function LegacyPromptSkill({notes = ""}: {notes?: string}) {
  const prompt = legacyAdPrompt(notes);
  return prompt ? <WritingText text={copyPrompt} context={prompt} /> : null;
}
