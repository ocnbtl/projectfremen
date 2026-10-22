const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('@playwright/test');
require.extensions['.tsx'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText, file);
const { default: Preview, inertPreviewBlob } = require('../components/VaultMediaPreview.tsx');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://preview.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
    await page.goto('http://preview.test/');
    const payload = '<script>parent.__documentExecuted = true</script><h1>Untrusted document</h1>';
    // Positive control: the previous unsandboxed HTML blob executes in the parent origin.
    const originalUrl = await page.evaluate(content => URL.createObjectURL(new Blob([content], { type: 'text/html' })), payload);
    await page.setContent(`<iframe src="${originalUrl}"></iframe>`);
    await page.waitForFunction(() => window.__documentExecuted === true);
    await page.evaluate(() => { delete window.__documentExecuted; });

    const safeBlob = inertPreviewBlob(new Blob([payload], { type: 'text/html' }));
    assert.ok(safeBlob.type.startsWith('text/plain'));
    assert.equal(await safeBlob.text(), payload);
    const safeUrl = await page.evaluate(({ content, type }) => URL.createObjectURL(new Blob([content], { type })), { content: await safeBlob.text(), type: safeBlob.type });
    await page.setContent(renderToStaticMarkup(React.createElement(Preview, { url: safeUrl, mimeType: safeBlob.type, fileName: 'untrusted.html' })));
    await page.frameLocator('iframe').locator('body').waitFor();
    assert.ok((await page.frameLocator('iframe').locator('body').textContent()).includes('<script>'));
    assert.equal(await page.evaluate(() => window.__documentExecuted), undefined);
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), '');

    // The frame also isolates an active document if a future caller bypasses MIME conversion.
    await page.setContent(renderToStaticMarkup(React.createElement(Preview, { url: originalUrl, mimeType: 'text/html', fileName: 'fallback.html' })));
    await page.frameLocator('iframe').locator('h1').waitFor();
    assert.equal(await page.evaluate(() => window.__documentExecuted), undefined);
    assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument), null);
    for (const [mime, tag] of [['image/png', 'img'], ['audio/mpeg', 'audio'], ['video/mp4', 'video']]) {
      assert.match(renderToStaticMarkup(React.createElement(Preview, { url: 'blob:fixture', mimeType: mime, fileName: 'media' })), new RegExp(`<${tag} `));
    }
    console.log('PASS: former HTML preview executes positive control; fixed text preview is inert; sandbox blocks scripts and parent access; media renderers preserved. No production data used.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
