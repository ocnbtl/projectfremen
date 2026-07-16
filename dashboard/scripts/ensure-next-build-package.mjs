import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const buildDirectory = path.join(process.cwd(), ".next");
const buildIdPath = path.join(buildDirectory, "BUILD_ID");
const packageMarkerPath = path.join(buildDirectory, "package.json");
const expectedMarker = '{"type": "commonjs"}';

// Never manufacture a build directory: a real Next production build must have
// completed and written BUILD_ID before this compatibility guard can run.
await access(buildIdPath);

let currentMarker = "";
try {
  currentMarker = (await readFile(packageMarkerPath, "utf8")).trim();
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

if (!currentMarker) {
  await writeFile(packageMarkerPath, expectedMarker, "utf8");
  console.log("[postbuild] Restored the Next build package marker for deployment packaging.");
} else if (currentMarker !== expectedMarker) {
  throw new Error("Unexpected .next/package.json contents; refusing to overwrite the build marker.");
}
