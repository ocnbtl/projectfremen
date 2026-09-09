const fs=require('node:fs');
const path=require('node:path');
const {getCountries}=require('libphonenumber-js/min');
const root=path.resolve(__dirname,'..');
// Artwork: country-flag-icons (MIT), bundled locally so flags also work on Windows.
const symbols=getCountries().map(iso=>{
  const svg=fs.readFileSync(path.join(root,'node_modules/country-flag-icons/3x2',iso+'.svg'),'utf8');
  const viewBox=svg.match(/viewBox="([^"]+)"/)[1];
  const body=svg.replace(/^.*?<svg[^>]*>/s,'').replace(/<\/svg>\s*$/,'').replace(/id="([^"]+)"/g,`id="${iso}-$1"`).replace(/url\(#([^)]*)\)/g,`url(#${iso}-$1)`).replace(/href="#([^"]+)"/g,`href="#${iso}-$1"`);
  return `<symbol id="flag-${iso}" viewBox="${viewBox}">${body}</symbol>`;
});
fs.writeFileSync(path.join(root,'public/country-flags.svg'),`<svg xmlns="http://www.w3.org/2000/svg"><!-- country-flag-icons, MIT license; see country-flags-LICENSE.txt -->${symbols.join('')}</svg>`);
fs.writeFileSync(path.join(root,'public/country-flags-LICENSE.txt'),fs.readFileSync(path.join(root,'node_modules/country-flag-icons/LICENSE'),'utf8').replace(/\r\n/g,'\n'));
console.log(`Generated ${symbols.length} country flags`);
