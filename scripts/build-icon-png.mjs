// One-off generator: media/blink.svg -> media/icon.png (256x256 marketplace icon).
// Run with: npm run build:icon-png
// The .png is committed, so normal installs/builds do not need this script.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, "..", "media");

const SIZE = 256;
const PAD = 32;       // breathing room around the glyph
const RADIUS = 48;    // rounded-square background
const BG = "#1e1e2e"; // matches package.json galleryBanner.color

// blink.svg is a black 26x26 glyph; recolor white and place it on the dark
// rounded square so the icon reads on both light and dark store themes.
const glyph = readFileSync(join(mediaDir, "blink.svg"), "utf8")
  .replace(/<\/?svg[^>]*>/g, "")
  .replaceAll('fill="#000000"', 'fill="#ffffff"');
const scale = (SIZE - 2 * PAD) / 26;

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="${BG}"/>
  <g transform="translate(${PAD} ${PAD}) scale(${scale})">${glyph}</g>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng();
const outPath = join(mediaDir, "icon.png");
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
