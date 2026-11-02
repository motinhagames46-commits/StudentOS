// Gera os ícones da app a partir de um só desenho (conselho de 2026-11-02): favicon.svg, favicon.ico (16, 32 e 48),
// apple-touch-icon.png (180, fundo opaco: o iOS pinta a transparência de preto), icon-192.png, icon-512.png e
// icon-maskable-512.png. Usa o Chromium do Playwright, já instalado para os E2E: nenhuma dependência nova.
// Uso: node scripts/icons.mjs (os ficheiros gerados ficam versionados em apps/web/public).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUT = new URL('../apps/web/public/', import.meta.url);
const TEAL = '#0F7F6B';
// «S» geométrico em traço grosso, desenhado como caminho (sem fonte), numa grelha de 32.
const S =
  'M21 10.6C19.8 9 18 8 16 8C13.2 8 11 9.6 11 12C11 14.4 13.2 15.3 16 16C18.8 16.7 21 17.6 21 20' +
  'C21 22.4 18.8 24 16 24C14 24 12.2 23 11 21.4';
const glyph = (scale) =>
  `<path d="${S}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" ` +
  `transform="translate(16 16) scale(${scale}) translate(-16 -16)"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

// Separador do browser: cantos arredondados e transparentes.
const tab = svg(`<rect width="32" height="32" rx="8" fill="${TEAL}"/>${glyph(1)}`);
// Ecrã principal: quadrado cheio (o sistema arredonda os cantos), com margem à volta do «S».
const square = (scale) => svg(`<rect width="32" height="32" fill="${TEAL}"/>${glyph(scale)}`);

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(source, size) {
  await page.setViewportSize({ width: size, height: size });
  const src = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
  await page.setContent(`<body style="margin:0"><img src="${src}" width="${size}" height="${size}"></body>`);
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** ICO com PNG lá dentro (aceite pelos browsers e pelo Windows desde o Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

writeFileSync(new URL('favicon.svg', OUT), `${tab}\n`);
const small = [];
for (const size of [16, 32, 48]) small.push({ size, data: await png(tab, size) });
writeFileSync(new URL('favicon.ico', OUT), ico(small));
writeFileSync(new URL('apple-touch-icon.png', OUT), await png(square(0.9), 180));
writeFileSync(new URL('icon-192.png', OUT), await png(square(0.9), 192));
writeFileSync(new URL('icon-512.png', OUT), await png(square(0.9), 512));
// «maskable»: o Android pode cortar até um círculo de 80 %; o «S» fica dentro dessa zona segura.
writeFileSync(new URL('icon-maskable-512.png', OUT), await png(square(0.75), 512));
await browser.close();
console.log('Ícones gerados em apps/web/public');
