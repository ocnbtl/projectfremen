import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/modules/people/photo-crop.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { photoCrop, movePhotoCrop, zoomPhotoCrop } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const near = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} != ${b}`);
for (const [sourceWidth, sourceHeight] of [[1200, 1200], [2400, 1200], [1200, 2400]]) {
  const initial = { sourceWidth, sourceHeight, zoom: 1, panX: 0, panY: 0 };
  const zoomed = zoomPhotoCrop(initial, 2);
  const before = photoCrop(zoomed);
  const moved = photoCrop(movePhotoCrop(zoomed, .1, -.15));
  near(moved.x, before.x - before.side * .1);
  near(moved.y, before.y + before.side * .15);
  // A point under the cursor stays in place during zoom on either axis.
  const anchored = photoCrop(zoomPhotoCrop(zoomed, 2.5, .3, .7));
  near(before.x + before.side * .3, anchored.x + anchored.side * .3);
  near(before.y + before.side * .7, anchored.y + anchored.side * .7);
  for (const dx of [-100, 100]) for (const dy of [-100, 100]) {
    const edge = movePhotoCrop(zoomed, dx, dy);
    const crop = photoCrop(edge);
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.side <= sourceWidth && crop.y + crop.side <= sourceHeight);
    const reset = photoCrop(zoomPhotoCrop(edge, .1));
    assert.equal(reset.side, Math.min(sourceWidth, sourceHeight));
    assert.ok(reset.x >= 0 && reset.y >= 0);
    // Reversing after hitting an edge responds immediately.
    const reversed = photoCrop(movePhotoCrop(edge, -Math.sign(dx) * .01, -Math.sign(dy) * .01));
    near(Math.abs(reversed.x - crop.x), crop.side * .01);
    near(Math.abs(reversed.y - crop.y), crop.side * .01);
  }
}
console.log("Photo crop: square, portrait, landscape, pointer movement, focal zoom, edge clamping and reversal passed.");
