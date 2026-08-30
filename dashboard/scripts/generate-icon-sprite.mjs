import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const registryPath = path.join(projectDirectory, "lib", "icons", "icon-registry.json");
const iconDirectory = path.join(projectDirectory, "node_modules", "@tabler", "icons", "icons", "outline");
const outputPath = path.join(projectDirectory, "public", "tabler-line-sprite.svg");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const candidates = [...new Set(registry.flatMap((entry) => entry.candidates))].sort();
const symbols = [];

for (const candidate of candidates) {
  const source = await readFile(path.join(iconDirectory, `${candidate}.svg`), "utf8");
  const match = source.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match) throw new Error(`Tabler SVG ${candidate} could not be parsed`);
  const body = match[1]
    .replace(/<path\s+stroke="none"\s+d="M0 0h24v24H0z"\s+fill="none"\s*\/>/i, "")
    .trim();
  symbols.push(`  <symbol id="tabler-${candidate}" viewBox="0 0 24 24">\n    ${body.replace(/\n/g, "\n    ")}\n  </symbol>`);
}

const output = [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  "  <!-- Tabler Icons 3.46.0. MIT licensed. Generated from lib/icons/icon-registry.json. -->",
  ...symbols,
  "</svg>",
  ""
].join("\n");

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== output) {
    throw new Error("tabler-line-sprite.svg is stale; run npm run icons:build");
  }
  process.stdout.write(`Icon sprite is current (${candidates.length} Tabler Line icons).\n`);
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`Wrote ${path.relative(projectDirectory, outputPath)} with ${candidates.length} Tabler Line icons.\n`);
}
