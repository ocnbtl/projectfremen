import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/landing-pixels.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { createPixelTrail, advancePixelTrail } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (const [width, height] of [[1280, 720], [390, 844], [18, 14]]) {
  const trail = createPixelTrail(width, height, random);
  for (let step = 0; step < 20000; step++) {
    const previous = trail.points.at(-1);
    advancePixelTrail(trail, width, height, random);
    assert.notDeepEqual(trail.points.at(-1), previous, "Tip must keep advancing, including beyond the history cap");
    assert.equal(trail.occupied.size, trail.points.length, "Never overpaint an occupied cell");
    assert.ok(trail.points.length <= 1600, "History stays bounded");
    const point = trail.points.at(-1);
    assert.ok(point.x >= 0 && point.y >= 0 && point.x + 2 <= width && point.y + 2 <= height);
  }
}
console.log("Passed 60,000 pixel steps: desktop, portrait, enclosed tips, boundaries, and continued motion beyond the history cap.");
