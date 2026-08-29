import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = new URL("../public/images/figma/", import.meta.url);

function label({ color, name, nameSize = 105, detail, volume }) {
  return Buffer.from(`
    <svg width="900" height="900" viewBox="0 0 3400 3400" xmlns="http://www.w3.org/2000/svg">
      <g fill="${color}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
        <text x="1700" y="1830" font-size="270" font-weight="700" letter-spacing="-12">ASAYA</text>
        <text x="1700" y="2070" font-size="${nameSize}" font-weight="700" letter-spacing="5">${name}</text>
        <text x="1700" y="2240" font-size="78" letter-spacing="3">${detail}</text>
        <text x="1700" y="2580" font-size="80">${volume}</text>
      </g>
    </svg>
  `);
}

const jobs = [
  {
    source: "product-cream-coconut.png",
    target: "product-cream-coconut.webp",
    overlay: label({
      color: "#ffd7ea",
      name: "УВЛАЖНЯЮЩИЙ КРЕМ",
      nameSize: 74,
      detail: "ДЛЯ ТЕЛА С КОКОСОМ",
      volume: "300 МЛ",
    }),
  },
  {
    source: "product-gel-pink.png",
    target: "product-gel-pink.webp",
    overlay: label({
      color: "#c71846",
      name: "ГЕЛЬ ДЛЯ ДУША",
      detail: "НЕЖНОЕ ОЧИЩЕНИЕ",
      volume: "300 МЛ",
    }),
  },
];

await Promise.all(jobs.map(({ source, target, overlay }) => (
  sharp(fileURLToPath(new URL(source, root)))
    .resize({ width: 900, withoutEnlargement: true })
    .composite([{ input: overlay }])
    .webp({ quality: 90, effort: 5 })
    .toFile(fileURLToPath(new URL(target, root)))
)));

console.log(`Built ${jobs.length} labelled ASAYA packshots.`);
