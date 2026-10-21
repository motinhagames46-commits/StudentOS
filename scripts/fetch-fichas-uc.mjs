// Descarrega o texto das fichas de UC do conjunto de avaliação (apps/api/test/fixtures/fichas-uc/*.json)
// para .cache/, que não vai para o Git: os textos são do IPVC e obtêm-se do sítio público, a pedido.
// Usa o mesmo pedido que o botão «Consultar» da página do curso. Uso: node scripts/fetch-fichas-uc.mjs
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const dir = new URL('../apps/api/test/fixtures/fichas-uc/', import.meta.url);
const cacheDir = new URL('.cache/', dir);

const run = promisify(execFile);

const cookieJar = fileURLToPath(new URL('cookies.txt', cacheDir));

// O servidor do IPVC não envia o certificado intermédio (HARICA «GEANT TLS RSA 1») e o fetch do Node não o
// vai buscar. O curl do sistema completa a cadeia; a verificação TLS continua ligada.
// O endpoint só responde dentro da sessão PHP anónima que a página do curso abre (sem login).
async function curl(url, form) {
  const args = ['--silent', '--show-error', '--fail', '--max-time', '30', '-b', cookieJar, '-c', cookieJar, url];
  for (const [key, value] of Object.entries(form ?? {})) args.push('--data-urlencode', `${key}=${value}`);
  const { stdout } = await run('curl', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

/** Texto legível a partir do HTML da ficha (aproxima o que o estudante copia do browser). */
function htmlToText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|dt|dd)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/\r\n?/g, '\n')
    .replace(/^[^\S\n]+|[^\S\n]+$/gm, '') // inclui espaços não separáveis
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

await mkdir(cacheDir, { recursive: true });
const datasets = (await readdir(dir)).filter((f) => f.endsWith('.json'));
for (const file of datasets) {
  const { source, cases } = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
  const { url, action, cd_curso, cd_plano, cd_ramo } = source.puc;
  await curl(source.coursePage);
  for (const c of cases) {
    const { html } = JSON.parse(
      await curl(url, {
        action,
        'data[cd_curso]': cd_curso,
        'data[cd_plano]': cd_plano,
        'data[cd_ramo]': cd_ramo,
        'data[cd_discip]': c.cdDiscip,
      }),
    );
    await writeFile(new URL(`${c.id}.html`, cacheDir), html);
    await writeFile(new URL(`${c.id}.txt`, cacheDir), `${htmlToText(html)}\n`);
    console.log(`${c.id}: ${html.length} bytes`);
    await new Promise((resolve) => setTimeout(resolve, 300)); // sem pressa: é o servidor do IPVC
  }
}
await rm(cookieJar, { force: true });
