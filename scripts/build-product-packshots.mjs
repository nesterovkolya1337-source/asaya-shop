import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = new URL("../public/images/figma/", import.meta.url);

const jobs = [
  {
    source: "product-cream-coconut-page2.png",
    target: "product-cream-coconut-page2.webp",
  },
  {
    source: "product-gel-kiwi-page2.png",
    target: "product-gel-kiwi-page2.webp",
  },
];

await Promise.all(jobs.map(({ source, target }) => (
  sharp(fileURLToPath(new URL(source, root)))
    .webp({ quality: 90, effort: 5 })
    .toFile(fileURLToPath(new URL(target, root)))
)));

console.log(`Optimized ${jobs.length} Page 2 product packshots.`);
