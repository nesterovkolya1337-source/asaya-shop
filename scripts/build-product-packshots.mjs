import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const figmaRoot = fileURLToPath(new URL("../public/images/figma/", import.meta.url));
const sourceRoot = path.join(figmaRoot, "page2-packshots-x4");
const targetRoot = path.join(figmaRoot, "page2-packshots");
const packshots = (await fs.readdir(sourceRoot)).filter((file) => file.endsWith(".png"));

await fs.mkdir(targetRoot, { recursive: true });
await Promise.all(packshots.map((file) => (
  sharp(path.join(sourceRoot, file))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize({ height: 2000, withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 })
    .toFile(path.join(targetRoot, file.replace(/\.png$/i, ".webp")))
)));

console.log(`Optimized ${packshots.length} Page 2 product packshots.`);
