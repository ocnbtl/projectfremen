// Older imported ads keep their prompt above this exact attribution line.
// Retain the author's spacing, including blank lines within the prompt.
export function legacyAdPrompt(notes: string): string | undefined {
  const footer = /\r?\n\r?\nSource: Zeely · https:\/\/zeely\.ai\/start\/tools\/static-ads-fw\/#p\d+[ \t]*(?=\r?\n|$)/.exec(notes);
  if (!footer) return;
  const prompt = notes.slice(0, footer.index);
  return prompt.trim() ? prompt : undefined;
}
