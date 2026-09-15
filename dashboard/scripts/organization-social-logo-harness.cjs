const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), sharp = require('sharp');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { findOrganizationSocialProfiles } = require('../lib/server/organization-social-search.ts');
const { extractOrganizationPage } = require('../lib/server/organization-metadata.ts');
const { discoverOrganization } = require('../lib/server/organization-discovery.ts');
const { prepareOrganizationLogo, fetchOrganizationLogo } = require('../lib/server/organization-logo.ts');
const { organizationProfileLink, emptyOrganizationSuggestions } = require('../lib/modules/people/organization-autofill.ts');
const urls = ['https://www.linkedin.com/company/example', 'https://www.instagram.com/example', 'https://x.com/example', 'https://www.youtube.com/@example', 'https://www.tiktok.com/@example'];
const search = values => values.map(url => `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${Buffer.from(url).toString('base64url')}">Example</a></h2></li>`).join('');
const profile = (website = 'https://www.example.com/') => `<title>Example official profile</title><a rel="me" href="${website}">Official website</a>`;
const ld = org => `<script type="application/ld+json">${JSON.stringify(org)}</script>`;
(async () => {
  let requests = [];
  const fetchPage = async url => {
    requests.push(url);
    return { sourceUrl: url, html: url.includes('bing.com') ? search(urls) : profile() };
  };
  const found = await findOrganizationSocialProfiles('Example', 'https://example.com', [], fetchPage, Date.now() + 5000);
  assert.deepEqual(found.map(item => item.suggestion.field).sort(), ['instagram','linkedin','tiktok','x','youtube']);
  assert.equal(requests.length, 10, 'Five independent searches plus five candidate checks');
  assert.ok(found.every(item => item.suggestion.sourceUrl === item.page.sourceUrl));
  requests = [];
  await findOrganizationSocialProfiles('Example', 'https://example.com', found.map(item => item.suggestion), fetchPage, Date.now() + 5000);
  assert.equal(requests.length, 0, 'Do not search platforms already supplied');
  assert.equal(emptyOrganizationSuggestions(found.map(item => item.suggestion), { instagram:'https://instagram.com/my-choice' }).some(item => item.field === 'instagram'), false);
  for (const website of ['https://example.com.evil.test','https://example.com/another-business','https://unrelated.example']) {
    const result = await findOrganizationSocialProfiles('Example', 'https://example.com', [], async url => ({ sourceUrl:url,html:url.includes('bing.com')?search(urls):profile(website) }), Date.now()+5000);
    assert.equal(result.length,0,'Same name, tenant or lookalike domain cannot establish ownership');
  }
  const rejected = await findOrganizationSocialProfiles('Example', 'https://example.com', [], async url => ({ sourceUrl:url.includes('bing.com')?url:'https://instagram.com/other',html:url.includes('bing.com')?search(urls):profile() }), Date.now()+5000);
  assert.equal(rejected.length,0,'Redirects to a different profile must not verify a search candidate');
  const ambiguous = await findOrganizationSocialProfiles('Example','https://example.com',[],async url => ({sourceUrl:url,html:url.includes('bing.com')?search(['https://instagram.com/example','https://instagram.com/example2']):profile()}),Date.now()+5000);
  assert.equal(ambiguous.length,0,'Two verified accounts on one platform require review');
  const blocked = await findOrganizationSocialProfiles('Example','https://example.com',[],async url => {
    if (url.includes('bing.com') && decodeURIComponent(url).includes('site:linkedin.com')) throw Error('Search unavailable');
    return {sourceUrl:url,html:url.includes('bing.com')?search([...urls,'https://instagram.com/p/not-a-profile']):url.includes('tiktok.com')?'<title>Sign in</title>':profile()};
  },Date.now()+5000);
  assert.deepEqual(blocked.map(item=>item.suggestion.field).sort(),['instagram','x','youtube']);
  assert.equal((await findOrganizationSocialProfiles('Example','https://example.com',[],async()=>{throw Error('No expired requests');},Date.now()-1)).length,0);
  const candidates = extractOrganizationPage(ld({'@type':'Organization',name:'Example',logo:'/brand.png'}) + '<meta property="og:image" content="/hero.jpg"><img alt="Example Logo" src="/visible.png"><img alt="Example partner logo" src="/partner.png"><link rel="apple-touch-icon" href="/touch.png">','https://example.com','Example').logoCandidates;
  assert.deepEqual(candidates.map(item=>item.url),['https://example.com/brand.png','https://example.com/visible.png','https://example.com/touch.png']);
  const instagram = extractOrganizationPage('<title>Example (@example)</title><script type="application/json">'+JSON.stringify({username:'example',profile_pic_url_hd:'https://cdninstagram.com/avatar.jpg',external_url:'https://example.com'})+'</script>','https://instagram.com/example','Example');
  assert.equal(instagram.logoCandidates[0].kind,'instagram');
  const unrelated = extractOrganizationPage('<title>Other</title><meta property="og:image" content="https://cdninstagram.com/other.jpg">','https://instagram.com/other','Example');
  // Direct supplied profiles may identify themselves by their own handle; newly
  // discovered ones still require reciprocal website evidence before any logo is used.
  assert.equal((await findOrganizationSocialProfiles('Example','https://example.com',[],async url=>({sourceUrl:url,html:url.includes('bing.com')?search(['https://instagram.com/other']):'<title>Other</title><meta property="og:image" content="https://cdninstagram.com/other.jpg">'}),Date.now()+5000)).length,0);
  const makeImage = (width,height,background) => sharp({create:{width,height,channels:4,background}}).png().toBuffer();
  for (const [width,height] of [[120,120],[360,120],[120,360]]) {
    const output = Buffer.from((await prepareOrganizationLogo(await makeImage(width,height,'#cc1100'))).split(',')[1],'base64');
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width,512); assert.equal(metadata.height,512);
    const {data,info} = await sharp(output).raw().toBuffer({resolveWithObject:true});
    const at = (x,y) => [...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
    assert.ok(at(0,0).every(channel=>channel>240),'Padding remains visible');
    assert.ok(at(256,256)[0]>150 && at(256,256)[1]<50,'Artwork remains centered');
    // Original aspect ratio retained, with both extremes of a wide/tall logo visible.
    for (const [x,y] of width>height?[[40,256],[471,256]]:height>width?[[256,40],[256,471]]:[[40,40],[471,471]]) assert.ok(at(x,y)[0]>150 && at(x,y)[1]<50);
  }
  const white = Buffer.from((await prepareOrganizationLogo(await makeImage(120,120,'#ffffff'))).split(',')[1],'base64');
  const whitePixels = await sharp(white).raw().toBuffer();
  assert.ok(whitePixels[0]<100,'Transparent white artwork receives a dark backing');
  for (const input of [Buffer.from('not an image'),Buffer.from('<svg></svg>'),Buffer.alloc(2_000_001),await makeImage(24,24,'red'),await makeImage(500,50,'red'),await makeImage(100,100,'#00000000')]) await assert.rejects(()=>prepareOrganizationLogo(input));
  await assert.rejects(()=>fetchOrganizationLogo({url:'https://127.0.0.1/a.png',sourceUrl:'https://example.com',kind:'website'}));
  await assert.rejects(()=>fetchOrganizationLogo({url:'https://example.com/avatar.png',sourceUrl:'https://instagram.com/example',kind:'instagram'}));
  const logoAttempts=[];
  const fallback = await discoverOrganization('Example',['https://example.com'],{
    fetchPage:async url=>({sourceUrl:url,html:url==='https://example.com'?ld({'@type':'Organization',name:'Example',logo:'/missing.png'})+'<img alt="Example Logo" src="/good.png">':'<title>Unavailable</title>'}),
    fetchLogo:async url=>{logoAttempts.push(url);if(url.endsWith('missing.png'))throw Error('Missing logo');return 'data:image/webp;base64,test';}
  });
  assert.deepEqual(logoAttempts,['https://example.com/missing.png','https://example.com/good.png']);
  assert.equal(fallback.photo.sourceKind,'website');
  assert.equal(fallback.photo.sourceUrl,'https://example.com');
  console.log('Organization social/logo: all five platforms, reciprocal identity, ambiguous/blocked profiles, deadlines, logo provenance, safe fallbacks and square aspect-preserving image preparation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
