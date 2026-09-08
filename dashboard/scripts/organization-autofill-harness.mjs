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
  const compile = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--outDir", temporary, "--module", "commonjs", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "lib/server/public-page.ts", "lib/server/organization-metadata.ts", "lib/server/organization-discovery.ts", "lib/modules/people/links.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const require = createRequire(import.meta.url);
  const { isPublicAddress, resolvePublicPage, fetchPublicPage, requestPinnedPage } = require(path.join(temporary, "server/public-page.js"));
  const { extractOrganizationMetadata } = require(path.join(temporary, "server/organization-metadata.js"));
  const { discoverOrganization } = require(path.join(temporary, "server/organization-discovery.js"));
  const { normalizeOrganizationUrl, organizationProfileLink, emptyOrganizationSuggestions, organizationSeedUrls } = require(path.join(temporary, "modules/people/organization-autofill.js"));
  const { withoutTrailingLinkSlash } = require(path.join(temporary, "modules/people/links.js"));
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
  assert.equal(knowledgeRequests.length,3,'One page plus two bounded knowledge requests');
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
  for (const [field, expected] of Object.entries({ ...socialLinks, website: "https://example.com", name: "Example", industry: "Research Services", organizationType: "Business", foundedYear: "2004", teamSize: "11–50 employees", headquarters: "Columbus, Ohio, USA", streetAddress: "12 Main Street, Suite 4, Columbus, Ohio, 43215, USA", context: "Tools for field research." })) assert.equal(discoveredValues[field], expected, field);
  assert.ok(fetched.includes("https://example.com/about") && fetched.includes("https://example.com/contact"), "Follow relevant company pages from a reverse social seed");
  assert.ok(!fetched.includes("https://wrong.example"), "Ignore unrelated embedded profiles");
  assert.ok(fetched.length <= 10 && new Set(fetched).size === fetched.length, "Bound and deduplicate discovery");
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
  assert.ok(!searchFallback.sources.includes('https://unrelated.example') && searchedPages.length <= 10);
  assert.ok(searchFallback.message.includes('link back'));
  const { extractOrganizationPage, conciseOrganizationDescription } = require(path.join(temporary, 'server/organization-metadata.js'));
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
