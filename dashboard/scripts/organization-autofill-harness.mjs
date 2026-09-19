import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
const root = process.cwd();
// Compiled fixtures live in an isolated temp directory; resolve native runtime
// dependencies from this application's installation, never from a global package.
process.env.NODE_PATH = path.join(root, "node_modules");
Module._initPaths();
const temporary = await mkdtemp(path.join(tmpdir(), "fremen-organization-tests-"));
try {
  const compile = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--outDir", temporary, "--module", "commonjs", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "lib/server/public-page.ts", "lib/server/organization-metadata.ts", "lib/server/organization-discovery.ts", "lib/modules/people/links.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const require = createRequire(import.meta.url);
  const { isPublicAddress, resolvePublicPage, fetchPublicPage, requestPinnedPage } = require(path.join(temporary, "server/public-page.js"));
  const { extractOrganizationMetadata } = require(path.join(temporary, "server/organization-metadata.js"));
  const { discoverOrganization } = require(path.join(temporary, "server/organization-discovery.js"));
  const { normalizeOrganizationUrl, organizationProfileLink, emptyOrganizationSuggestions, organizationSeedUrls } = require(path.join(temporary, "modules/people/organization-autofill.js"));
  const { withoutTrailingLinkSlash } = require(path.join(temporary, "modules/people/links.js"));
  const { normalizeOrganizationIndustry, ORGANIZATION_INDUSTRY_OPTIONS } = require(path.join(temporary, "modules/people/organization-industries.js"));
  const { classifyOrganizationServices } = require(path.join(temporary, "server/organization-classification.js"));
  for (const [description, industry] of [
    ['Customized Private Boat Charters', 'Hospitality & travel'], ['Luxury yacht charters with free cancellation.', 'Hospitality & travel'],
    ['Guided snorkelling tours and fishing trips.', 'Hospitality & travel'], ['Not just boat tours. A day to remember.', 'Hospitality & travel'],
    ['Public boat charters around the coast.', 'Hospitality & travel'], ['Cargo shipping and freight transport.', 'Transportation & logistics'],
    ['Managed IT services.', 'Technology'], ['An architectural firm.', 'Professional services'], ['Veterinary clinic.', 'Healthcare'],
    ['A grocery store.', 'Retail & consumer'], ['A credit union.', 'Finance & insurance'], ['Industrial manufacturing.', 'Manufacturing'],
    ['Snag delivers 1,500+ products to college students in 10 minutes. Order snacks, drinks, and essentials from our app.', 'Retail & consumer'],
    ['A roofing contractor.', 'Construction & real estate'], ['A film production studio.', 'Media & entertainment'],
    ['A restaurant.', 'Hospitality & travel'], ['An organic farm.', 'Agriculture & food'], ['Solar panel installation.', 'Energy & utilities'],
    ['An independent clothing brand.', 'Fashion & apparel']
  ]) assert.deepEqual(classifyOrganizationServices(description), { organizationType: 'Business', industry }, description);
  for (const [description, type, industry] of [
    ['A nonprofit animal rescue.', 'Nonprofit', 'Animal welfare'], ['A nonprofit medical clinic.', 'Nonprofit', 'Health'],
    ['A primary school.', 'University / School', 'Primary / secondary education'], ['A marketing agency.', 'Agency', 'Marketing / advertising'],
    ['A judicial court.', 'Government', 'Judicial / legal']
  ]) assert.deepEqual(classifyOrganizationServices(description, type), { organizationType: type, industry });
  for (const description of ['We no longer offer boat charters.', 'A guide to private boat charters.', 'Our clients offer yacht charters.', 'Software solutions for boat tours.']) assert.equal(classifyOrganizationServices(description), null);
  const fieldsFor = (html, url='https://barefoot.example', name='Barefoot Antigua') => Object.fromEntries(extractOrganizationMetadata(html, url, name).suggestions.map(item=>[item.field,item.value]));
  const barefootHome = '<title>Barefoot Antigua</title><meta property="og:description" content="Charter Options"><h2>Charter Options</h2><h2>Our story</h2><h1>Customized Private Boat Charters</h1><p>Book directly with us.</p><footer>Government sales tax applies. Leave us a review.</footer>';
  for (const route of ['', '/home', '/index.html', '/en', '/en/home', '/en-US/']) {
    const fields = fieldsFor(barefootHome,'https://barefoot.example'+route);
    assert.equal(fields.organizationType,'Business',route); assert.equal(fields.industry,'Hospitality & travel',route);
    assert.equal(fields.context,'Customized Private Boat Charters','Use the offering instead of a navigation label');
  }
  const aboutFields = fieldsFor('<h1>Our story</h1><p>Barefoot Antigua offers private boat charters and guided snorkelling tours.</p>','https://barefoot.example/our-story');
  assert.equal(aboutFields.industry,'Hospitality & travel','A named about-page self-description is usable evidence');
  assert.equal(fieldsFor('<h1>Welcome</h1><p>We specialize in customized private tours.</p>').industry,'Hospitality & travel');
  for (const html of ['<nav><h1>Boat charters</h1></nav>', '<article><h1>Private boat charters</h1></article>', '<blockquote><h2>Private boat charters</h2></blockquote>', '<footer><h2>Boat charters</h2></footer>', '<p>Our partner offers boat charters.</p>']) {
    assert.equal(fieldsFor(html).industry,undefined,'Do not classify partner, article or navigation content');
  }
  assert.equal(fieldsFor('<h1>Private boat charters</h1>','https://barefoot.example/blog/boats').industry,undefined);
  assert.equal(fieldsFor('<p>Another Company offers private boat charters.</p>','https://barefoot.example/our-story').industry,undefined);
  assert.equal(fieldsFor('<h1>Private boat charters</h1><h2>Software development</h2>').industry,undefined,'Competing activities require review');
  assert.equal(fieldsFor('<h1>Private boat charters</h1><h2>Software development</h2>').organizationType,'Business','Ambiguous industry need not hide a supported type');
  const explicitFields = fieldsFor('<p>Organization type: Business</p><p>Industry: Transportation & logistics</p><h1>Private boat charters</h1>');
  assert.equal(explicitFields.industry,'Transportation & logistics','Retain an explicitly published classification');
  const preserved = emptyOrganizationSuggestions(extractOrganizationMetadata(barefootHome,'https://barefoot.example','Barefoot Antigua').suggestions,{ context:'My own notes', organizationType:'Agency', industry:'Consulting' });
  assert.equal(preserved.some(item=>['context','organizationType','industry'].includes(item.field)),false,'Existing manual fields remain unchanged');
  const nonprofitService = await discoverOrganization('Example', ['https://nonprofit.example'], { fetchPage: async url => ({ sourceUrl:url, html:url==='https://nonprofit.example'?'<script type="application/ld+json">{"@type":"NGO","name":"Example","url":"https://nonprofit.example"}</script><a href="/about">About</a>':url.endsWith('/about')?'<p>We provide a medical clinic.</p>':'' }) });
  assert.equal(nonprofitService.suggestions.find(item=>item.field==='organizationType').value,'Nonprofit');
  assert.equal(nonprofitService.suggestions.find(item=>item.field==='industry').value,'Health','Use the established type to classify services on subsequent pages');
  for (const [description, industry] of [
    ['Discover premium beachfront villa rentals in Antigua with MGL 365. Private pools, beaches, chef services and concierge.', 'Hospitality & travel'],
    ['Luxury villa rentals and property management.', 'Hospitality & travel'],
    ['We provide software development and cloud hosting.', 'Technology'],
    ['An accounting firm providing accounting services.', 'Professional services'],
    ['A dental clinic offering patient appointments.', 'Healthcare'],
    ['An online store selling home essentials.', 'Retail & consumer'],
    ['Courier services and freight forwarding.', 'Transportation & logistics'],
    ['An insurance brokerage offering tailored coverage.', 'Finance & insurance'],
    ['A manufacturer of industrial equipment.', 'Manufacturing'],
    ['Property management and real estate brokerage.', 'Construction & real estate']
  ]) assert.deepEqual(classifyOrganizationServices(description), {organizationType:'Business',industry});
  for (const description of ['Discover new possibilities.', 'A guide to villa rentals.', 'Our clients offer villa rentals.', 'Software development and villa rentals.', 'We no longer offer villa rentals.', 'A nonprofit offering free medical clinic appointments.', 'A public medical clinic.', 'A university medical practice.', 'A directory of law firms.', 'Research into property management.']) {
    assert.equal(classifyOrganizationServices(description), null, description);
  }
  assert.equal(classifyOrganizationServices('Villa rentals.', 'Nonprofit'), null, 'Do not override an explicit organization type');
  for (const [type, source, expected] of [
    ['Business', 'Retail', 'Retail & consumer'], ['Business', 'Retail.Current', 'Retail & consumer'],
    ['Business', 'Entertainment Providers', 'Media & entertainment'], ['Business', 'Construction', 'Construction & real estate'],
    ['University / School', 'Higher Education', 'College / university'], ['Business', 'Hospitality', 'Hospitality & travel'],
    ['Business', 'unknown source category', 'Other'], ['Business', '', '']
  ]) assert.equal(normalizeOrganizationIndustry(type, source), expected);
  for (const [type, options] of Object.entries(ORGANIZATION_INDUSTRY_OPTIONS)) for (const option of options) {
    assert.equal(normalizeOrganizationIndustry(type, option), option, 'Preserve every curated option');
  }
  const { approximateTeamSize, formatTeamSize, editTeamSize } = require(path.join(temporary, "modules/people/team-size.js"));
  for (const [input, output] of [['106523','107,000'],['8893','8,900'],['78938','80,000'],['78','78'],['347','350'],['10000','10,000'],['9999','10,000'],['100001','101,000']]) assert.equal(approximateTeamSize(input),output,input);
  for (const value of ['', '11–50 employees', '10,001+', '~8,900', 'global network', '12,34', '1.5 million']) assert.equal(approximateTeamSize(value),value,'Preserve source qualifiers, ranges and non-exact values');
  assert.equal(formatTeamSize('78938'),'78,938','Manual counts are formatted without rounding');
  assert.equal(editTeamSize('107,000'),'107000','Editing removes display separators');
  assert.equal(formatTeamSize(''),'');
  const { extractOrganizationKnowledge } = require(path.join(temporary, 'server/organization-knowledge.js'));
  const claim = (value, extras={}) => ({rank:'normal',mainsnak:{snaktype:'value',datavalue:{value}},...extras});
  const entity = {id:'Q123',labels:{en:{value:'Example Inc.'}},claims:{P856:[claim('https://example.com/')],P571:[claim({time:'+1964-01-25T00:00:00Z',precision:11})],P7085:[claim('example')]}};
  const knowledgeValues = input => Object.fromEntries(extractOrganizationKnowledge(input,'Example','https://www.example.com').map(item=>[item.field,item.value]));
  assert.equal(knowledgeValues([entity]).foundedYear,'1964');
  assert.equal(knowledgeValues([entity]).tiktok,'https://www.tiktok.com/@example');
  for (const url of ['https://example.com.evil.org','https://other.example','https://example.com/other-brand']) assert.deepEqual(knowledgeValues([{...entity,claims:{...entity.claims,P856:[claim(url)]}}]),{},'Same-name entities need the exact official site');
  assert.deepEqual(knowledgeValues([{...entity,labels:{en:{value:'Unrelated'}}}]),{});
  assert.deepEqual(knowledgeValues([entity,{...entity,id:'Q124'}]),{},'Ambiguous entities stay empty');
  assert.equal(knowledgeValues([{...entity,claims:{...entity.claims,P571:[...entity.claims.P571,claim({time:'+1971-01-01T00:00:00Z',precision:9})]}}]).foundedYear,undefined);
  assert.equal(knowledgeValues([{...entity,claims:{...entity.claims,P571:[claim({time:'+1900-00-00T00:00:00Z',precision:7})]}}]).foundedYear,undefined,'Do not present century precision as a year');
  assert.equal(knowledgeValues([{...entity,claims:{...entity.claims,P7085:[claim('old',{qualifiers:{P582:[{}]}}),claim('deprecated',{rank:'deprecated'}),claim('example')]}}]).tiktok,'https://www.tiktok.com/@example');
  assert.equal(knowledgeValues([{...entity,claims:{...entity.claims,P7085:[claim('one'),claim('two')]}}]).tiktok,undefined,'Multiple current accounts are ambiguous');
  assert.equal(knowledgeValues([{...entity,claims:{...entity.claims,P7085:[claim('example/video/123')]}}]).tiktok,undefined,'Never turn a post or arbitrary path into a profile');
  const valuesOf = (html) => Object.fromEntries(extractOrganizationMetadata(html,'https://example.com/company','Example').suggestions.map(item=>[item.field,item.value]));
  const rescueValues = html => Object.fromEntries(extractOrganizationMetadata(html, 'https://www.fortheloveofjanerescue.com/', 'For The Love of Jane').suggestions.map(item => [item.field, item.value]));
  for (const html of [
    '<meta name="description" content="For the Love of Jane is a non-profit animal rescue in Columbus, Ohio">',
    '<p>For the Love of Jane operates as a foster based, 501(c)3 non-profit animal rescue that specializes in neonatal care.</p>',
    '<p>We are a registered nonprofit cat rescue.</p>'
  ]) {
    const values = rescueValues(html);
    assert.equal(values.organizationType, 'Nonprofit');
    assert.equal(values.industry, 'Animal welfare');
    assert.equal(values.teamSize, undefined, 'No inferred workforce from nonprofit status');
    assert.equal(values.foundedYear, undefined);
  }
  for (const html of [
    '<p>Our partner is a nonprofit animal rescue.</p>',
    '<p>For the Love of Jane is not a nonprofit animal rescue.</p>',
    '<p>For the Love of Jane supports a nonprofit animal rescue.</p>',
    '<p>For the Love of Jane is a veterinary clinic supporting animal rescue.</p>',
    '<p>I moved to Columbus in 2016 and started rescuing animals.</p><h4>Antonia Tribuzzo</h4><h4>Anna Evans</h4><footer>© 2023 by Animal Shelter</footer>'
  ]) {
    const values = rescueValues(html);
    assert.equal(values.organizationType, undefined, html);
    assert.equal(values.industry, undefined, html);
    assert.equal(values.foundedYear, undefined, html);
    assert.equal(values.teamSize, undefined, html);
  }
  assert.equal(normalizeOrganizationIndustry('Nonprofit', 'Animal rescue'), 'Animal welfare');
  assert.equal(normalizeOrganizationIndustry('Business', 'Animal rescue'), 'Other', 'Respect organization taxonomy');
  assert.equal(valuesOf('<p>Established in 1999, Example’s European Headquarters sits in the Netherlands.</p>').foundedYear,undefined);
  assert.equal(valuesOf('<p>Founded in 2001, Another Company provides shoes.</p>').foundedYear,undefined);
  assert.equal(valuesOf('<p>Example was founded on January 25, 1964.</p>').foundedYear,'1964');
  assert.equal(valuesOf('<p>Founded: January 25, 1964</p>').foundedYear,'1964');
  assert.equal(valuesOf('<p>Founded: 1964</p><p>Founded: 1971</p>').foundedYear,undefined);
  const knowledgeRequests=[];
  const supplemented=await discoverOrganization('Example',['https://example.com'],{fetchPage:async url=>{
    knowledgeRequests.push(url);
    const html=url.includes('wbsearchentities')?JSON.stringify({search:[{id:'Q123',label:'Example'},{id:'Q124',label:'Example Browser'}]}):url.includes('wbgetentities')?JSON.stringify({entities:{Q123:entity}}):'<p>Example was founded in 2004.</p><p>Company size: 106523</p>';
    return {sourceUrl:url,html};
  }});
  const supplementedValues=Object.fromEntries(supplemented.suggestions.map(item=>[item.field,item.value]));
  assert.equal(supplementedValues.foundedYear,'2004','Knowledge fallback does not replace official facts');
  assert.equal(supplementedValues.teamSize,'107,000');
  assert.equal(supplementedValues.tiktok,'https://www.tiktok.com/@example');
  assert.ok(supplemented.suggestions.find(item=>item.field==='teamSize').evidence.includes('106523'),'Retain exact count in source explanation');
  assert.equal(knowledgeRequests.length,8,'One page, five platform searches and two bounded knowledge requests');
  assert.ok(!knowledgeRequests.at(-1).includes('Q124'),'Do not download full entities for unrelated products');
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
    else if (req.url === "/huge") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("x".repeat(2_000_001)); }
    else if (req.url === "/binary") { res.writeHead(200, { "Content-Type": "image/png" }); res.end("binary"); }
    else if (req.url === "/json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }
    else if (req.url === "/slow") { res.writeHead(200, { "Content-Type": "text/html" }); res.write("<html>"); }
    else { res.writeHead(200, { "Content-Type": "text/html" }); res.end(`<title>${req.headers.host}</title>`); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = new URL(`http://unresolvable.example:${server.address().port}/`);
    const target = { url, address: { address: "127.0.0.1", family: 4 } };
    const response = await requestPinnedPage(target, AbortSignal.timeout(1000));
    assert.match(response.html, /unresolvable.example/, "Socket must use pinned address and preserve Host");
    const jsonTarget={...target,url:new URL('/json',url)};
    await assert.rejects(()=>requestPinnedPage(jsonTarget,AbortSignal.timeout(1000)),'HTML page fetching must still reject JSON by default');
    assert.equal(JSON.parse((await requestPinnedPage(jsonTarget,AbortSignal.timeout(1000),1000,'json')).html).ok,true,'Explicit JSON mode retains bounded pinned sockets');
    await assert.rejects(()=>requestPinnedPage(target,AbortSignal.timeout(1000),1000,'json'),'JSON mode must reject HTML challenge pages');
    for (const pathname of ["/large", "/binary", "/slow"]) await assert.rejects(() => requestPinnedPage({ ...target, url: new URL(pathname, url) }, AbortSignal.timeout(60)));
    assert.equal((await requestPinnedPage({ ...target, url: new URL('/large', url) }, AbortSignal.timeout(1000), 2_000_000)).html.length, 512_001, "Discovery supports larger public organization pages");
    await assert.rejects(() => requestPinnedPage({ ...target, url: new URL('/huge', url) }, AbortSignal.timeout(1000), 2_000_000), /too large|size limit/, "The expanded page limit is enforced");
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  const metadata = { "@context": "https://schema.org", "@graph": [
    { "@type": "Corporation", name: "Wrong Publisher", foundingDate: "1900" },
    { "@type": "Corporation", name: "Example Inc.", foundingDate: "1998-04-01", description: "A &amp; B research", numberOfEmployees: { minValue: 10, maxValue: 50 }, address: { addressLocality: "Columbus", addressRegion: "Ohio", addressCountry: "US" }, url: "https://example.com/", sameAs: ["https://linkedin.com/company/example/", "javascript:alert(1)"] }
  ] };
  const result = extractOrganizationMetadata(`<script type="application/ld+json">${JSON.stringify(metadata)}</script>`, "https://example.com/", "Example");
  const values = Object.fromEntries(result.suggestions.map((item) => [item.field, item.value]));
  assert.equal(values.foundedYear, "1998");
  assert.equal(values.teamSize, "10–50");
  assert.equal(values.headquarters, "Columbus, Ohio, USA");
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
  const socialLinks = { linkedin: "https://www.linkedin.com/company/example", x: "https://x.com/example", youtube: "https://www.youtube.com/@example", instagram: "https://www.instagram.com/example", tiktok: "https://www.tiktok.com/@example" };
  for (const [field, url] of Object.entries(socialLinks)) {
    assert.equal(organizationProfileLink(url).field, field);
    assert.deepEqual(organizationSeedUrls({ [field]: url }), [url], `A ${field} seed works without a name or website`);
  }
  for (const url of ["https://x.com/intent/tweet", "https://x.com/example/status/123", "https://instagram.com/p/123", "https://instagram.com/accounts/login", "https://linkedin.com/shareArticle", "https://linkedin.com/in/some-person", "https://youtube.com/watch?v=123", "https://youtu.be/123", "https://tiktok.com/@example/video/123"]) assert.equal(organizationProfileLink(url), null, `Not an organization profile: ${url}`);
  const footer = Object.values(socialLinks).map((url) => `<a href="${url}?utm_source=site"><svg></svg></a>`).join("");
  const websiteHtml = `<title>Example</title><meta property="og:site_name" content="Example"><meta name="description" content="Tools for field research."><a href="/about">About</a><a href="/contact">Contact</a>${footer}<a href="https://x.com/intent/tweet?url=example.com">Share</a><a href="https://linkedin.com/in/a-founder">Founder</a>`;
  const footerValues = Object.fromEntries(extractOrganizationMetadata(websiteHtml, "https://example.com").suggestions.map((item) => [item.field, item.value]));
  for (const [field, url] of Object.entries(socialLinks)) assert.equal(footerValues[field], url, `Discover ${field} from real anchors`);
  const companyDetails = `<dl><dt>Industry</dt><dd>Research Services</dd><dt>Company size</dt><dd>11–50 employees</dd><dt>Type</dt><dd>Privately held</dd><dt>Founded</dt><dd>2004</dd><dt>Headquarters</dt><dd>Columbus, Ohio, US</dd></dl>`;
  const contactHtml = `<div itemscope itemtype="https://schema.org/PostalAddress"><span itemprop="streetAddress">12 Main Street, Suite 4</span><span itemprop="postalCode">43215</span><span itemprop="addressLocality">Columbus</span><span itemprop="addressRegion">Ohio</span><span itemprop="addressCountry">US</span></div>`;
  const socialHtml = `<meta property="og:title" content="Example (@example) • Instagram"><script type="application/json">${JSON.stringify({ data: { user: { username: "example", full_name: "Example", biography: "Tools for field research.", external_url: "https://example.com" }, unrelated: { username: "someoneelse", external_url: "https://wrong.example" } } })}</script>`;
  const pages = { "https://example.com": websiteHtml, "https://example.com/about": companyDetails, "https://example.com/contact": contactHtml, [socialLinks.instagram]: socialHtml };
  const fetched = [];
  const fetchPage = async (url) => {
    fetched.push(url);
    if (!(url in pages)) throw new Error("Public profile unavailable");
    return { html: pages[url], sourceUrl: url };
  };
  const discovered = await discoverOrganization("", [socialLinks.instagram], { fetchPage });
  const discoveredValues = Object.fromEntries(discovered.suggestions.map((item) => [item.field, item.value]));
  for (const [field, expected] of Object.entries({ ...socialLinks, website: "https://example.com", name: "Example", industry: "Professional services", organizationType: "Business", foundedYear: "2004", teamSize: "11–50 employees", headquarters: "Columbus, Ohio, USA", streetAddress: "12 Main Street, Suite 4, Columbus, Ohio, 43215, USA", context: "Tools for field research." })) assert.equal(discoveredValues[field], expected, field);
  assert.ok(fetched.includes("https://example.com/about") && fetched.includes("https://example.com/contact"), "Follow relevant company pages from a reverse social seed");
  assert.ok(!fetched.includes("https://wrong.example"), "Ignore unrelated embedded profiles");
  assert.ok(fetched.length <= 25 && new Set(fetched).size === fetched.length, "Bound and deduplicate discovery including five platform searches");
  assert.equal(discovered.suggestions.find((item) => item.field === "streetAddress").sourceUrl, "https://example.com/contact", "Keep exact per-field source");
  const onlyMissing = emptyOrganizationSuggestions(discovered.suggestions, { context: "My own description", teamSize: "20", instagram: socialLinks.instagram });
  assert.ok(!onlyMissing.some((item) => ["context", "teamSize", "instagram"].includes(item.field)), "Keep manually entered values, including changes made while fetching");
  assert.ok(!emptyOrganizationSuggestions(discovered.suggestions, { headquarters: "Chicago" }).some((item) => item.field === "streetAddress"), "Do not attach a discovered street to a different manually entered city");
  assert.deepEqual(emptyOrganizationSuggestions([{ field: "foundedYear", value: "9999", sourceUrl: "https://example.com", evidence: "Bad value" }], {}), [], "Never apply invalid generated values");
  const conflicting = await discoverOrganization("Example", ["https://example.com"], { fetchPage: async (url) => ({ sourceUrl: url, html: url.endsWith("/contact") ? "<p>Founded: 2010</p>" : url.endsWith("/about") ? "<p>Founded: 2004</p>" : websiteHtml }) });
  assert.ok(!conflicting.suggestions.some((item) => item.field === "foundedYear") && conflicting.conflicts.includes("foundedYear"), "Conflicting founding years stay empty");
  let privateRequests = 0;
  const privateDiscovery = await discoverOrganization("Example", [socialLinks.instagram], { fetchPage: (url, options) => fetchPublicPage(url, { ...options, resolve, request: async () => {
    privateRequests++;
    return { status: 200, headers: {}, html: '<title>Example (@example)</title><a rel="me" href="http://169.254.169.254">Website</a>' };
  } }) });
  assert.equal(privateRequests, 1, "Discovered private targets never reach a socket");
  assert.ok(!privateDiscovery.suggestions.some((item) => item.field === "website"), "Never suggest an unvalidated private website");
  const blockedResult = await discoverOrganization("Example", [socialLinks.instagram], { fetchPage: async (url) => ({ sourceUrl: url, html: "<title>Log in • Instagram</title>" }) });
  assert.equal(blockedResult.suggestions.length, 0);
  const genericSocial = extractOrganizationMetadata('<title>X</title><meta name="description" content="Connect with people around the world">', socialLinks.x);
  assert.ok(!genericSocial.suggestions.some((item) => ['name', 'context', 'organizationType'].includes(item.field)), 'A platform shell must not become organization details');
  const searchedPages = [];
  const searchFallback = await discoverOrganization('', [socialLinks.instagram], { fetchPage: async (url) => {
    searchedPages.push(url);
    if (url.startsWith('https://www.bing.com/search?')) return { sourceUrl: url, html: `<li class="b_algo"><h2><a href="https://unrelated.example/about">Same name, wrong company</a></h2><p>Founded 1900, 5000 employees</p></li><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${Buffer.from('https://example.com/about').toString('base64url')}">Example</a></h2></li>` };
    if (url === 'https://unrelated.example') return { sourceUrl: url, html: '<title>Example</title><meta name="description" content="WRONG ORGANIZATION"><p>Founded: 1900</p>' };
    if (url === socialLinks.instagram) return { sourceUrl: url, html: '<meta property="og:title" content="Example (@example) • Instagram">' };
    return fetchPage(url);
  } });
  const searchValues = Object.fromEntries(searchFallback.suggestions.map(item => [item.field, item.value]));
  assert.equal(searchValues.website, 'https://example.com', 'A hidden social website can be recovered through an exact reciprocal profile link');
  assert.equal(searchValues.foundedYear, '2004', 'Search snippets and unverified candidate facts must never enter the draft');
  assert.ok(!searchFallback.sources.includes('https://unrelated.example') && searchedPages.length <= 25);
  assert.ok(searchFallback.message.includes('link back'));
  const { extractOrganizationPage, conciseOrganizationDescription } = require(path.join(temporary, 'server/organization-metadata.js'));
  const mglNode = {'@type':'Organization', name:'MGL 365 Antigua', url:'https://www.mgl365antigua.com', description:'Luxury villa rentals and vacation home management in Antigua.'};
  const mglHtml = nodes => `<script type="application/ld+json">${JSON.stringify({'@graph':nodes})}</script>`;
  const mglPage = extractOrganizationPage(mglHtml([mglNode,{...mglNode,'@type':'LocalBusiness'}]),mglNode.url,mglNode.name);
  assert.equal(mglPage.suggestions.find(item=>item.field==='organizationType')?.value,'Business');
  assert.ok(mglPage.suggestions.find(item=>item.field==='organizationType').evidence.includes('structured data'), 'Combine specific types from matching entity nodes');
  assert.equal(mglPage.suggestions.find(item=>item.field==='industry')?.value,'Hospitality & travel');
  assert.ok(mglPage.suggestions.find(item=>item.field==='industry').evidence.startsWith('Inferred classification'), 'Retain the distinction between published and inferred categories');
  assert.ok(!mglPage.suggestions.some(item=>['foundedYear','teamSize'].includes(item.field)), 'Never derive exact facts from service language');
  const partnerPage = extractOrganizationPage(mglHtml([{...mglNode,description:'Our clients offer villa rentals.'},{...mglNode,'@type':'LocalBusiness',url:'https://other.example'}]),mglNode.url,mglNode.name);
  assert.ok(!partnerPage.suggestions.some(item=>['organizationType','industry'].includes(item.field)), 'A same-name company on a different website cannot contribute its type');
  const conflictingTypes = extractOrganizationPage(mglHtml([{...mglNode,'@type':'LocalBusiness'},{...mglNode,'@type':'GovernmentOrganization'}]),mglNode.url,mglNode.name);
  assert.ok(conflictingTypes.conflicts.includes('organizationType'));
  assert.ok(!conflictingTypes.suggestions.some(item=>['organizationType','industry'].includes(item.field)), 'Contradictory identity types must not be replaced with an inference');
  const blogPage = extractOrganizationPage('<meta name="description" content="Luxury villa rentals in Antigua.">',mglNode.url+'/blog/travel',mglNode.name);
  assert.ok(!blogPage.suggestions.some(item=>item.field==='industry'), 'Do not classify the organization from an article');
  const metadataPage = extractOrganizationPage('<meta name="description" content="Discover premium beachfront villa rentals in Antigua with MGL 365. Private pools, beaches, chef services and concierge.">',mglNode.url,mglNode.name);
  assert.equal(metadataPage.suggestions.find(item=>item.field==='organizationType')?.value,'Business', 'A clear homepage offering can classify without structured data');
  for (const [type, industry, expected] of [['Business','Construction & real estate','Construction & real estate'],['Nonprofit','',undefined]]) {
    const explicit = await discoverOrganization(mglNode.name,[mglNode.url],{fetchPage:async url=>({sourceUrl:url,html:url===mglNode.url
      ? '<meta name="description" content="Luxury villa rentals in Antigua."><a href="/about">About</a>'
      : url===mglNode.url+'/about' ? `<dl><dt>Organization type</dt><dd>${type}</dd>${industry ? `<dt>Industry</dt><dd>${industry}</dd>` : ''}</dl>` : '{}'})});
    assert.equal(explicit.suggestions.find(item=>item.field==='organizationType')?.value,type,'Explicit declarations take priority over inference');
    assert.equal(explicit.suggestions.find(item=>item.field==='industry')?.value,expected,'Discard inferred categories incompatible with a later explicit type');
  }
  const navigation=extractOrganizationPage('<a href="https://about.example.com/en">About Example</a><a href="https://example.com.evil.org/company">Company</a>','https://example.com','Example');
  assert.ok(navigation.links.some(link=>link.url==='https://about.example.com/en' && link.kind==='detail'),'Follow linked official corporate subdomains');
  assert.ok(!navigation.links.some(link=>link.url.includes('evil.org')),'Reject lookalike domains');
  const { isLinkedInLogoUrl } = require(path.join(temporary, 'server/organization-logo.js'));
  const { canCompleteOrganizationAddress } = require(path.join(temporary, 'modules/people/organization-autofill.js'));
  assert.equal(canCompleteOrganizationAddress('1075 Risman Dr.', '1075 Risman Dr., Kent, Ohio, 44242, USA'),true);
  assert.equal(canCompleteOrganizationAddress('12 Other Street', '1075 Risman Dr., Kent, Ohio, 44242, USA'),false);
  const completion={field:'streetAddress',value:'1075 Risman Dr., Kent, Ohio, 44242, USA',sourceUrl:'https://university.example',evidence:'Published address'};
  assert.equal(emptyOrganizationSuggestions([completion],{streetAddress:'1075 Risman Dr.'}).length,1);
  assert.equal(emptyOrganizationSuggestions([completion],{streetAddress:'12 Other Street'}).length,0);
  const factPages=[];
  const fallback = await discoverOrganization('Example', ['https://example.com'],{fetchPage:async url=>{factPages.push(url);return {sourceUrl:url,html:url.startsWith('https://www.bing.com/search?')?'<li class="b_algo"><h2><a href="https://example.com/workforce">Example facts</a></h2><p>Invented 9999 employees</p></li>':url==='https://example.com/workforce'?'<p>More than 400 employees</p>':url==='https://example.com'?'<a href="/about">About</a>':'<p>About Example</p>'};}});
  assert.equal(fallback.suggestions.find(x=>x.field==='teamSize')?.value,'400+','Missing facts trigger search, followed by actual official source reading');
  assert.ok(factPages.some(url=>url.startsWith('https://www.bing.com/search?')));
  const university = { '@type': ['CollegeOrUniversity','Organization'], name: 'Example University', url: 'https://university.example', description: 'Example University provides higher education and research. It offers undergraduate and graduate programs. A third marketing sentence.', address: [{postOfficeBoxNumber:'PO Box 10',addressLocality:'Kent',addressRegion:'OH',addressCountry:'US',postalCode:'44242'}, {streetAddress:'1075 Risman Dr.',addressLocality:'Kent',addressRegion:'OH',addressCountry:'US',postalCode:'44242'}] };
  const universityPages = {
    'https://university.example': '<script type="application/ld+json">'+JSON.stringify(university)+'</script><a href="/facts-figures">Facts &amp; Figures</a>',
    'https://university.example/facts-figures': '<a href="/facts-figures/university-overview">University Overview</a>',
    'https://university.example/facts-figures/university-overview': '<article><ul><li>More than 10,700 employees:<ul><li>2,700+ full- and part-time faculty</li><li>5,000+ student employees</li></ul></li><li>33,000 students</li></ul></article>'
  };
  const universityResult = await discoverOrganization('Example University', ['https://university.example'], {fetchPage: async url => {assert.ok(universityPages[url],url);return {sourceUrl:url,html:universityPages[url]};}});
  const universityValues = Object.fromEntries(universityResult.suggestions.map(item=>[item.field,item.value]));
  assert.equal(universityValues.teamSize,'10,700+');
  assert.equal(universityValues.organizationType,'University / School');
  assert.equal(universityValues.headquarters,'Kent, Ohio, USA');
  assert.equal(universityValues.streetAddress,'1075 Risman Dr., Kent, Ohio, 44242, USA');
  assert.equal(universityValues.context,'Example University provides higher education and research. It offers undergraduate and graduate programs.');
  assert.ok(conciseOrganizationDescription('A very long description '.repeat(80)).length<=360);
  assert.equal(extractOrganizationPage('<title>Example University | LinkedIn</title><dl><dt>Type</dt><dd>Educational</dd></dl>','https://linkedin.com/school/example-university','Example University').suggestions.find(x=>x.field==='organizationType')?.value,'University / School');
  const snagProfile = { '@type': 'Organization', name: 'Snag', url: 'https://www.linkedin.com/company/snaginc', sameAs: 'https://snagdelivery.app', numberOfEmployees: {value: 207}, address: {streetAddress: '610 Brazos St', addressLocality: 'Austin', addressRegion: 'Texas', postalCode: '78701', addressCountry: 'US'} };
  const snagHtml = (nodes, size = true) => `<title>Snag | LinkedIn</title><script type="application/ld+json">${JSON.stringify({'@graph':nodes})}</script><dl><dt>Industry</dt><dd>Consumer Services</dd>${size ? '<dt>Company size</dt><dd>11-50 employees</dd>' : ''}<dt>Type</dt><dd>Privately Held</dd><dt>Founded</dt><dd>2021</dd></dl><a href="/search/results/people">View all 207 employees</a>`;
  const snagValues = (html, website = 'https://snagdelivery.app') => Object.fromEntries(extractOrganizationPage(html, snagProfile.url, 'Snag Delivery', {website}).suggestions.map(item=>[item.field,item.value]));
  assert.equal(snagValues(snagHtml([snagProfile])).organizationType, 'Business', 'A verified official website resolves a brand alias');
  assert.equal(snagValues(snagHtml([snagProfile])).foundedYear, '2021');
  assert.equal(snagValues(snagHtml([snagProfile])).teamSize, '11-50 employees', 'Use company-declared size, not associated LinkedIn members');
  assert.equal(snagValues(snagHtml([snagProfile], false)).teamSize, undefined, 'Do not use member counts even without a company-size field');
  assert.equal(snagValues(snagHtml([snagProfile]), 'https://www.snagdelivery.app/').organizationType, 'Business');
  for (const website of ['', 'https://snagdelivery.app.evil.example', 'https://other.example', 'https://snagdelivery.app/another-brand']) {
    assert.equal(snagValues(snagHtml([snagProfile]), website).organizationType, undefined, 'No alias without an exact website match');
  }
  assert.equal(snagValues(snagHtml([{...snagProfile, url:'https://www.linkedin.com/company/other'}])).organizationType, undefined, 'Related companies do not establish profile identity');
  assert.equal(snagValues(snagHtml([snagProfile,{...snagProfile,name:'Another company'}])).organizationType, undefined, 'Ambiguous identity stays empty');
  assert.equal(snagValues('<title>Sign in | LinkedIn</title>' + snagHtml([snagProfile])).organizationType, undefined, 'Never bypass sign-in pages');
  const snagRequests = [];
  const snagResult = await discoverOrganization('Snag Delivery', [snagProfile.url, 'https://snagdelivery.app'], {fetchPage: async url => {
    snagRequests.push(url);
    return {sourceUrl:url, html: url === 'https://snagdelivery.app' ? '<meta name="description" content="College essentials delivered.">' : url === snagProfile.url ? snagHtml([snagProfile]) : '{}'};
  }});
  const snagFields = Object.fromEntries(snagResult.suggestions.map(item=>[item.field,item.value]));
  assert.equal(snagRequests[0], 'https://snagdelivery.app', 'Resolve the website before reading social aliases');
  assert.equal(snagFields.organizationType, 'Business');
  assert.equal(snagFields.industry, 'Retail & consumer');
  assert.equal(snagFields.foundedYear, '2021');
  assert.equal(snagFields.teamSize, '11-50 employees');
  assert.equal(snagFields.headquarters, 'Austin, Texas, USA');
  assert.equal(snagFields.streetAddress, '610 Brazos St, Austin, Texas, 78701, USA');
  assert.equal(emptyOrganizationSuggestions(snagResult.suggestions,{name:'Snag Delivery',context:'My notes'}).some(item=>item.field==='name'||item.field==='context'),false,'Keep the user\'s saved name and description');
  assert.equal(extractOrganizationPage('<p>5,000+ student employees</p><p>25,000 enrolled students</p>','https://university.example').suggestions.some(x=>x.field==='teamSize'),false,'Do not mistake students or a workforce subset for total employees');
  const logoUrl='https://media.licdn.com/dms/image/v2/abc/company-logo_200_200/company-logo/image';
  const logoPage=extractOrganizationPage('<title>Example University | LinkedIn</title><meta property="og:image" content="https://media.licdn.com/company-background/cover"><img class="top-card-layout__entity-image" alt="Example University logo" data-delayed-url="'+logoUrl+'">','https://linkedin.com/school/example-university','Example University');
  assert.equal(logoPage.linkedInLogo,logoUrl);
  for(const invalid of ['http://media.licdn.com/company-logo/foo','https://media.licdn.com.evil.example/company-logo/foo','https://media.licdn.com/company-background/cover','https://127.0.0.1/company-logo/foo']) assert.equal(isLinkedInLogoUrl(invalid),false);
  console.log("Organization autofill: DNS/socket/redirect and byte limits; all six seed fields; profile-only links; reverse social discovery; complete organization details; source provenance; conflicts; draft preservation; ten-page bound; blocked-page recovery passed.");
  if (process.argv.includes("--kent")) {
    const r = await discoverOrganization("Kent State University", ["https://www.kent.edu"]); console.log(JSON.stringify(r,null,2));
  }
  if (process.argv.includes("--live")) {
    for (const [name, url] of [["Mozilla", "https://www.mozilla.org/en-US/"], ["Cloudflare", "https://www.cloudflare.com/"], ["", "https://www.instagram.com/mozilla/"]]) {
      try {
        const parsed = await discoverOrganization(name, [url]);
        console.log(JSON.stringify({ name, sourceUrl: parsed.sourceUrl, fields: parsed.suggestions.map((item) => item.field), sources: parsed.sources, unavailable: parsed.unavailableSources, conflicts: parsed.conflicts }));
      } catch (error) { console.log(JSON.stringify({ name, partial: true, reason: error.message })); }
    }
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
