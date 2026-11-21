/* Verify the normal browser PUT, including its automatically generated length, over loopback. */
const assert = require("node:assert/strict"),
  { createServer } = require("node:http"),
  fs = require("node:fs");
const { AwsClient } = require("aws4fetch"),
  { chromium } = require("playwright"),
  ts = require("typescript"),
  Module = require("node:module");
const { randomUUID } = require("node:crypto");
require.extensions[".ts"] = (mod, name) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(name, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    name,
  );
const load = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : load.call(this, name, ...args);
};
Object.assign(process.env, {
  WORKSPACE_MEDIA_BACKEND: "r2-standard",
  R2_ACCOUNT_ID: "b".repeat(32),
  R2_MEDIA_BUCKET: "isolated-test",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
});
const { directPart } = require("../lib/modules/media/workspace-r2.ts");
const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + server.address().port;
};
(async () => {
  let browser,
    saved,
    preflights = 0;
  const site = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<title>Local upload test</title>");
  });
  const origin = await listen(site);
  const verifier = new AwsClient({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    region: "auto",
    service: "s3",
  });
  const host = "b".repeat(32) + ".r2.cloudflarestorage.com";
  const bucket = createServer(async (req, res) => {
    try {
      assert.equal(req.headers.origin, origin);
      res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        preflights++;
        res.setHeader("Access-Control-Allow-Methods", "PUT");
        res.setHeader("Access-Control-Allow-Headers", "if-none-match,x-amz-storage-class,content-type");
        res.writeHead(204);
        res.end();
        return;
      }
      assert.equal(req.method, "PUT");
      const url = new URL(req.url, "https://" + host),
        given = url.searchParams.get("X-Amz-Signature"),
        datetime = url.searchParams.get("X-Amz-Date");
      const names = url.searchParams
        .get("X-Amz-SignedHeaders")
        .split(";")
        .filter((k) => k !== "host");
      const headers = Object.fromEntries(names.map((k) => [k, req.headers[k]]));
      url.searchParams.delete("X-Amz-Signature");
      const predicted = await verifier.sign(url, {
        method: "PUT",
        headers,
        aws: { signQuery: true, allHeaders: true, datetime },
      });
      if (new URL(predicted.url).searchParams.get("X-Amz-Signature") !== given) {
        res.writeHead(403);
        res.end();
        return;
      }
      assert.equal(headers["if-none-match"], "*");
      assert.equal(headers["x-amz-storage-class"], "STANDARD");
      if (saved) {
        res.writeHead(412);
        res.end();
        return;
      }
      const parts = [];
      for await (const bytes of req) parts.push(bytes);
      saved = Buffer.concat(parts);
      res.writeHead(200);
      res.end();
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  });
  const endpoint = await listen(bucket);
  try {
    global.fetch = async (req) => {
      assert.equal(req.method, "HEAD");
      assert.equal(new URL(req.url).hostname, host);
      return saved
        ? new Response(null, { headers: { "content-length": String(saved.length) } })
        : new Response(null, { status: 404 });
    };
    const bytes = Buffer.from("offline-resume fixture");
    const item = {
      workspace_id: randomUUID(),
      media_id: randomUUID(),
      byte_length: bytes.length,
      chunk_size: 8388608,
      write_deadline: new Date(Date.now() + 360000).toISOString(),
    };
    const grant = await directPart(item, 0),
      signed = new URL(grant.url);
    const executablePath =
      process.env.BROWSER_EXECUTABLE ||
      [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(
        fs.existsSync,
      );
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage();
    await page.goto(origin);
    const put = async (text) =>
      page.evaluate(
        async ({ url, headers, text }) =>
          (
            await fetch(url, {
              method: "PUT",
              headers,
              body: new Blob([text]),
              credentials: "omit",
              referrerPolicy: "no-referrer",
            })
          ).status,
        { url: endpoint + signed.pathname + signed.search, headers: grant.headers, text },
      );
    assert.equal(await put("wrong length"), 403);
    assert.equal(await put(bytes.toString()), 200);
    assert.ok(preflights > 0);
    assert.deepEqual(saved, bytes);
    assert.equal(await put(bytes.toString()), 412);
    assert.equal((await directPart(item, 0)).uploaded, true);
    console.log(
      "PASS: browser CORS preflight, actual Blob PUT with signed Content-Length, rejected mismatched length, immutable retry and resume.",
    );
  } finally {
    await browser?.close();
    await Promise.all([
      new Promise((resolve) => bucket.close(resolve)),
      new Promise((resolve) => site.close(resolve)),
    ]);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
