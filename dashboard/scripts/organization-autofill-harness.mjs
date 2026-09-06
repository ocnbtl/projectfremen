import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), "fremen-organization-tests-"));
try {
  const compile = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--outDir", temporary, "--module", "commonjs", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "lib/server/public-page.ts", "lib/server/organization-metadata.ts", "lib/modules/people/links.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const require = createRequire(import.meta.url);
  const { isPublicAddress, resolvePublicPage, fetchPublicPage, requestPinnedPage } = require(path.join(temporary, "server/public-page.js"));
  const { extractOrganizationMetadata } = require(path.join(temporary, "server/organization-metadata.js"));
  const { normalizeOrganizationUrl } = require(path.join(temporary, "modules/people/organization-autofill.js"));
  const { withoutTrailingLinkSlash } = require(path.join(temporary, "modules/people/links.js"));
  assert.equal(withoutTrailingLinkSlash("https://example.com/path/?q=/"), "https://example.com/path?q=/");
  assert.equal(withoutTrailingLinkSlash("https://example.com/path/#section/"), "https://example.com/path#section/");
  for (const address of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.1.1", "198.18.0.1", "224.0.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "fe80::1", "fc00::1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
  for (const url of ["http://127.1", "http://0x7f000001", "http://2130706433", "http://[::1]", "http://localhost.", "http://router.local", "file:///etc/passwd", "http://user:pass@example.com", "https://example.com:8443"]) await assert.rejects(() => resolvePublicPage(url));
  await assert.rejects(() => resolvePublicPage("https://example.com", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]));
  assert.equal(normalizeOrganizationUrl(" example.com/company/#about "), "https://example.com/company");
  assert.equal(normalizeOrganizationUrl("https://example.com/?q=/"), "https://example.com?q=/");
  const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
  let calls = 0;
  await assert.rejects(() => fetchPublicPage("https://example.com", { resolve, request: async () => { calls++; return { status: 302, headers: { location: "http://169.254.169.254" }, html: "" }; } }));
  assert.equal(calls, 1, "A redirect to metadata service must not be fetched");
  calls = 0;
  await assert.rejects(() => fetchPublicPage("https://example.com", { resolve, request: async () => { calls++; return { status: 302, headers: { location: "/next" }, html: "" }; } }));
  assert.equal(calls, 5, "Redirect limit");
  const paths = [];
  await fetchPublicPage("https://example.com/about", { resolve, request: async ({ url }) => {
    paths.push(url.pathname);
    return url.pathname.endsWith("/") ? { status: 200, headers: {}, html: "<title>Example</title>" } : { status: 301, headers: { location: "/about/" }, html: "" };
  } });
  assert.deepEqual(paths, ["/about", "/about/"], "Respect a server's trailing-slash redirect");
  await assert.rejects(() => fetchPublicPage("https://example.com", { resolve: () => new Promise(() => {}), timeoutMs: 20 }), /too long/);
  await assert.rejects(() => fetchPublicPage("https://example.com", { resolve, request: async () => ({ status: 403, headers: {}, html: "" }) }), /public preview/);
  // Exercise the actual socket reader against isolated fixtures; public validation is separately tested above.
  const server = createServer((req, res) => {
    if (req.url === "/large") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("x".repeat(512_001)); }
    else if (req.url === "/binary") { res.writeHead(200, { "Content-Type": "image/png" }); res.end("binary"); }
    else if (req.url === "/slow") { res.writeHead(200, { "Content-Type": "text/html" }); res.write("<html>"); }
    else { res.writeHead(200, { "Content-Type": "text/html" }); res.end(`<title>${req.headers.host}</title>`); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = new URL(`http://unresolvable.example:${server.address().port}/`);
    const target = { url, address: { address: "127.0.0.1", family: 4 } };
    const response = await requestPinnedPage(target, AbortSignal.timeout(1000));
    assert.match(response.html, /unresolvable.example/, "Socket must use pinned address and preserve Host");
    for (const pathname of ["/large", "/binary", "/slow"]) await assert.rejects(() => requestPinnedPage({ ...target, url: new URL(pathname, url) }, AbortSignal.timeout(60)));
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  const metadata = { "@context": "https://schema.org", "@graph": [
    { "@type": "Corporation", name: "Wrong Publisher", foundingDate: "1900" },
    { "@type": "Corporation", name: "Example Inc.", foundingDate: "1998-04-01", description: "A &amp; B research", numberOfEmployees: { minValue: 10, maxValue: 50 }, address: { addressLocality: "Columbus", addressRegion: "Ohio", addressCountry: "US" }, url: "https://example.com/", sameAs: ["https://linkedin.com/company/example/", "javascript:alert(1)"] }
  ] };
  const result = extractOrganizationMetadata(`<script type="application/ld+json">${JSON.stringify(metadata)}</script>`, "https://example.com/", "Example");
  const values = Object.fromEntries(result.suggestions.map((item) => [item.field, item.value]));
  assert.equal(values.foundedYear, "1998");
  assert.equal(values.teamSize, "10–50");
  assert.equal(values.headquarters, "Columbus, Ohio, US");
  assert.equal(values.context, "A & B research");
  assert.equal(values.organizationType, "Business");
  assert.equal(values.linkedin, "https://linkedin.com/company/example");
  assert.equal(values.industry, undefined, "Industry must not be inferred from description");
  assert.ok(result.suggestions.every((item) => item.sourceUrl === "https://example.com" && item.evidence));
  const unknown = extractOrganizationMetadata(`<script type="application/ld+json">${JSON.stringify(metadata)}</script>`, "https://example.com", "Different Organization");
  assert.equal(unknown.suggestions.some((item) => item.field === "foundedYear"), false);
  assert.equal(extractOrganizationMetadata("<title>Log in | LinkedIn</title><meta name='description' content='Join us'>", "https://linkedin.com/company/example", "Example").suggestions.length, 0);
  const partial = extractOrganizationMetadata("<script type='application/ld+json'>invalid</script><meta content='Public description' name='description'>", "https://example.com", "Example");
  assert.equal(partial.suggestions.find((item) => item.field === "context").value, "Public description");
  console.log("Organization autofill: address, DNS pinning, redirect, timeout, body limit, metadata, provenance, partial-result checks passed.");
  if (process.argv.includes("--live")) {
    for (const [name, url] of [["Mozilla", "https://www.mozilla.org/en-US/"], ["Cloudflare", "https://www.cloudflare.com/"]]) {
      try {
        const page = await fetchPublicPage(url);
        const parsed = extractOrganizationMetadata(page.html, page.sourceUrl, name);
        console.log(JSON.stringify({ name, sourceUrl: parsed.sourceUrl, fields: parsed.suggestions.map((item) => item.field), bytes: Buffer.byteLength(page.html) }));
      } catch (error) { console.log(JSON.stringify({ name, partial: true, reason: error.message })); }
    }
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
