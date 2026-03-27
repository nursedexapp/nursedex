import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Generate an ND monogram icon at a given size
async function generateIcon(size, borderRadius = 0) {
  const fontSize = Math.round(size * 0.55);

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${borderRadius}" fill="#2A7B6F"/>
    <text
      x="50%" y="47%"
      dominant-baseline="central"
      text-anchor="middle"
      font-family="Georgia, 'Times New Roman', serif"
      font-weight="600"
      font-size="${fontSize}px"
      letter-spacing="${Math.round(-0.04 * fontSize)}px"
      fill="#FFFFFF"
    >ND</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Generate ICO file (contains 16px and 32px PNGs)
function createIco(buffers16, buffers32) {
  const images = [
    { size: 16, data: buffers16 },
    { size: 32, data: buffers32 },
  ];

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(images.length, 4); // number of images

  // Each directory entry: 16 bytes
  const entries = [];
  let offset = 6 + images.length * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0); // width
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.data.length, 8); // data size
    entry.writeUInt32LE(offset, 12); // data offset
    entries.push(entry);
    offset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  console.log("Generating icons...");

  // Generate PNGs
  const png16 = await generateIcon(16, 2);
  const png32 = await generateIcon(32, 4);
  const png192 = await generateIcon(192, 24);
  const png512 = await generateIcon(512, 64);

  // Save static PNGs to public/
  writeFileSync(join(root, "public", "icon-192.png"), png192);
  writeFileSync(join(root, "public", "icon-512.png"), png512);
  console.log("  public/icon-192.png");
  console.log("  public/icon-512.png");

  // Generate and save favicon.ico
  const ico = createIco(png16, png32);
  writeFileSync(join(root, "src", "app", "favicon.ico"), ico);
  console.log("  src/app/favicon.ico");

  console.log("Done!");
}

main().catch(console.error);
