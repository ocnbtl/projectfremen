const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const misses = [];
let shared = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir,entry.name);
    if(entry.isDirectory()) { scan(file); continue; }
    if(!file.endsWith('.tsx') || file.endsWith('SearchField.tsx')) continue;
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node) {
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
        const tag=node.tagName.getText(source);
        if(tag==='SearchField') shared++;
        if(tag==='input') {
          const attrs=new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(source),a.initializer?.getText(source)||'']));
          if(attrs.get('type')==='"search"' || /\b(?:search|find)\b/i.test((attrs.get('placeholder')||'')+' '+(attrs.get('aria-label')||''))) misses.push(path.relative(root,file)+':'+(source.getLineAndCharacterOfPosition(node.pos).line+1));
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
scan(path.join(root,'components'));scan(path.join(root,'app'));
assert.deepEqual(misses,[], 'Search inputs must use the shared SearchField: '+misses.join(', '));
assert(shared>=30,'Search coverage unexpectedly decreased');
console.log(`${shared} search instances use the shared control; no legacy search inputs remain.`);
