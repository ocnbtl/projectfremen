// Usage: node scripts/build-place-localities.cjs cities5000.txt admin1CodesASCII.txt
// Source: https://download.geonames.org/export/dump/ (GeoNames, CC BY 4.0).
// The derived index contains only city names, administrative areas and approximate
// search centers. A city center is never returned as a venue or street address.
const fs = require('node:fs'), path = require('node:path'), { gzipSync } = require('node:zlib');
const lines = file => fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).map(line => line.split('\t'));
const regions = Object.fromEntries(lines(process.argv[3]).map(([code,name]) => [code,name]));
const cities = lines(process.argv[2]).map(row => [row[1], row[2] === row[1] ? '' : row[2], row[8], row[10], +Number(row[4]).toFixed(4), +Number(row[5]).toFixed(4)]);
fs.writeFileSync(path.join(__dirname, '../lib/modules/planning/locality-centers.gz'), gzipSync(JSON.stringify({regions,cities}), {level:9}));
console.log(cities.length + ' locality centers');
