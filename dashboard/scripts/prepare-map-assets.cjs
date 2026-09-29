const fs = require("node:fs"),
  path = require("node:path");
const source = path.dirname(require.resolve("maplibre-gl/package.json"));
const target = path.resolve(__dirname, "../public/vendor/maplibre");
fs.mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
  fs.copyFileSync(path.join(source, "dist", file), path.join(target, file));
fs.copyFileSync(
  path.join(source, "LICENSE.txt"),
  path.join(target, "LICENSE.txt"),
);
console.log("Prepared MapLibre worker and shared module");
