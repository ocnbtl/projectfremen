/* Uses a new browser profile and intercepted loopback origin. No real Vault or providers. */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright"),
  ts = require("typescript"),
  sharp = require("sharp");
const script = (name) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib", name), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
(async () => {
  const executablePath =
    process.env.BROWSER_EXECUTABLE ||
    [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((f) =>
      fs.existsSync(f),
    );
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext();
    await context.route("**/*", (r) =>
      r.fulfill({ contentType: "text/html", body: "<title>Isolated local Vault fixture</title>" }),
    );
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:48873/");
    const code = script("local-first/indexed-db.ts");
    await page.addScriptTag({ content: "window.exports={};" + code });
    const result = await page.evaluate(async () => {
      const { BrowserVaultStore } = window.exports,
        store = await BrowserVaultStore.open();
      const packet = (mediaId, size) => ({ mediaId, chunkIndex: 0, byteLength: size });
      await store.initialize({
        vaultId: "fixture",
        deviceId: "fixture-device",
        deviceName: "Synthetic browser",
        keyVersion: 1,
        keyEnvelope: {},
      });
      await store.putMediaChunk(packet("original", 10), false);
      await store.setDownloadLimit(25);
      const budget = await Promise.all([
        store.putMediaChunk(packet("kept", 10), true),
        store.putMediaChunk(packet("extra", 10), true),
      ]);
      const winner = budget[0] ? "kept" : "extra",
        loser = budget[0] ? "extra" : "kept";
      await store.setLocalMediaPin(winner, 1, true);
      const candidates = await store.allMediaChunks(),
        removed = await store.deleteMediaChunks(candidates);
      const localWhileFull = await store.putMediaChunk(packet("unsynced", 20), false);
      const measured = (await store.metadata()).measuredMediaBytes;
      const overflow = await store.putMediaChunk(packet("other", 1), true);
      let incomplete = false;
      try {
        await store.setLocalMediaPin(loser, 1, true);
      } catch {
        incomplete = true;
      }
      await Promise.all([
        store.updateMetadata({ deviceName: "New name" }),
        store.updateMetadata({ lastSequence: 42 }),
      ]);
      const meta = await store.metadata();
      await store.setLocalMediaPin(winner, 1, false);
      const cleaned = await store.deleteMediaChunks(await store.allMediaChunks());
      await store.setDownloadLimit(null);
      const released = await store.putMediaChunk(packet("later", 100), true);
      return {
        budget,
        removed,
        localWhileFull,
        measured,
        overflow,
        incomplete,
        renamed: meta.deviceName,
        seq: meta.lastSequence,
        pinned: meta.pinnedMediaIds,
        cleaned,
        released,
        original: !!(await store.mediaChunk("original", 0)),
        unsynced: !!(await store.mediaChunk("unsynced", 0)),
      };
    });
    assert.equal(result.budget.filter(Boolean).length, 1);
    assert.equal(result.removed.chunks, 0);
    assert.equal(result.cleaned.chunks, 1);
    assert.equal(result.measured, 40);
    assert.equal(result.overflow, false);
    assert.equal(result.incomplete, true);
    assert.ok(result.original && result.unsynced && result.localWhileFull && result.released);
    assert.equal(result.seq, 42);
    assert.equal(result.renamed, "New name");
    assert.equal(result.pinned.length, 1);
    const photo = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#235" } })
      .withExif({ IFD0: { Artist: "Private fixture" } })
      .jpeg()
      .toBuffer();
    assert.ok((await sharp(photo).metadata()).exif);
    await page.addScriptTag({
      content:
        "window.exports={};window.require=n=>n.includes('browser-preference')?{browserPreference:()=>null}:window.photoLimits;" +
        script("modules/media/workspace-photos.ts") +
        ";window.photoLimits=window.exports;window.exports={};" +
        script("modules/media/upload-privacy.ts"),
    });
    const copy = await page.evaluate(async (arr) => {
      const file = new File([new Uint8Array(arr)], "fixture.jpg", { type: "image/jpeg" });
      const output = await window.exports.metadataFreePhoto(file);
      return { name: output.name, bytes: Array.from(new Uint8Array(await output.arrayBuffer())) };
    }, Array.from(photo));
    assert.equal(copy.name, "fixture-copy.png");
    const meta = await sharp(Buffer.from(copy.bytes)).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 8);
    assert.equal(meta.exif, undefined);
    console.log(
      "PASS: Chromium atomic cache ceiling, concurrent writes, pin protection, unsynced originals, independent metadata updates, preview-only downloads and metadata-free upload copy.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
