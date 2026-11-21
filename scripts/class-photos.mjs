// Fotos das categorias: Wikimedia Commons, licenças livres, auto-alojadas.
//
// Cada categoria do ecrã de pedido mostra o veículo real. Correr com
//   NODE_EXTRA_CA_CERTS=~/.elara/avast-shield-root.pem node scripts/class-photos.mjs
// Escreve public/classes/<id>.jpg e src/lib/classPhotos.ts (com o autor e a
// licença de cada foto, porque CC BY exige crédito e o crédito tem de viajar
// com a imagem, não ficar num ficheiro que ninguém abre).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const readFileSyncSafe = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const UA = 'ElaraTrajectoria/1.0 (curation de fotos; contact 7dark7cloud7@gmail.com)';
/** Largura pedida ao Commons. O ecrã mostra a categoria com ~112 px: 250 px
 *  chega com folga para um ecrã a 2× e custa menos de metade dos bytes. */
const WIDTH = 250;

/** id da categoria → procuras, da mais específica para a mais larga. */
const WANTED = {
  economico: ['Toyota Corolla white sedan', 'sedan car city street'],
  conforto: ['Toyota Camry silver sedan', 'car sedan modern'],
  xl: ['Toyota Land Cruiser Prado SUV', 'SUV seven seats'],
  moto: ['boda boda motorcycle passenger', 'motorcycle taxi passenger helmet'],
  taxi: ['taxi Luanda', 'yellow taxi car city'],
  candongueiro: ['minibus Luanda', 'Toyota Hiace minibus'],
  hiace: ['Toyota Hiace van', 'Toyota Hiace'],
  autocarro: ['city bus public transport', 'urbanibus transito'],
  picape: ['Toyota Hilux pickup white', 'pickup truck open bed'],
  canter: ['Mitsubishi Fuso Canter box', 'Mitsubishi Fuso Canter'],
  camiao: ['MAN TGX truck highway', 'semi truck freight trailer'],
  carga: ['flatbed truck loading', 'truck cargo pallets'],
};

// `node scripts/class-photos.mjs moto canter` refaz só essas categorias.
// `node scripts/class-photos.mjs --again` só volta a descarregar o que já
// está no photos.json (para mudar o tamanho sem procurar de novo).
const flags = process.argv.slice(2);
const AGAIN = flags.includes('--again');
const only = flags.filter((a) => !a.startsWith('--'));

const OK_LICENSE = /(cc[- ]by|cc0|public domain|pd|domaine|attribut)/i;
const BAD_LICENSE = /(fair use|non-free|nc |nd |no derivative|noncommercial)/i;

const api = async (params) => {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, { headers: { 'User-Agent': UA } });
  const text = await res.text();
  if (!text.startsWith('{')) throw new Error(`resposta não é JSON (${res.status})`);
  return JSON.parse(text);
};

const searchTitles = async (q) => {
  const j = await api({
    action: 'query', format: 'json', list: 'search', srsearch: `filetype:bitmap ${q}`,
    srnamespace: '6', srlimit: '8',
  });
  return (j.query?.search ?? []).map((s) => s.title);
};

const imageInfo = async (title) => {
  const j = await api({
    action: 'query', format: 'json', titles: title, prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime', iiurlwidth: String(WIDTH),
  });
  const pages = j.query?.pages ?? {};
  const pg = Object.values(pages)[0];
  return pg?.imageinfo?.[0];
};

const meta = (info, key) => info?.extmetadata?.[key]?.value?.replace(/<[^>]+>/g, '').trim() ?? '';

const pick = (info, title) => {
  const license = meta(info, 'LicenseShortName');
  if (!info.thumburl) return null;
  if (BAD_LICENSE.test(license)) return null;
  if (!OK_LICENSE.test(license)) return null;
  if (info.width < 600) return null;
  // Nada de fotografia histórica: um camião de 1928 numa categoria de carga
  // parece um erro, e há milhares de fotos modernas livres no Commons.
  if (/(^|[^0-9])(18[0-9]{2}|19[0-5][0-9])([^0-9]|$)/.test(title) || /postcard|vintage|carte postal/i.test(title)) return null;
  return {
    file: title.replace(/^File:/, ''),
    thumb: info.thumburl,
    page: info.descriptionurl,
    author: meta(info, 'Artist') || 'Wikimedia Commons',
    license,
  };
};

const INDEX = 'public/classes/photos.json';
const readIndex = () => JSON.parse(readFileSyncSafe(INDEX) ?? '{}');

/**
 * A API devolve thumbnails de 330 px seja qual for o `iiurlwidth` pedido. O
 * caminho que funciona é reescrever o URL: `upload.wikimedia.org` aceita
 * qualquer largura abaixo da original, e 250 px pesa menos de metade.
 */
const resized = (thumb) => {
  const url = new URL(thumb);
  url.search = '';
  url.hostname = 'upload.wikimedia.org';
  return url.toString().replace(/\/(\d+)px-/, `/${WIDTH}px-`);
};

const grab = async (url) => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // O Commons também devolve páginas de erro; só aceitamos JPEG/PNG reais.
    if (buf.length < 2000) return null;
    const jpg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50;
    return jpg || png ? buf : null;
  } catch {
    return null;
  }
};

const rows = [];
const found_ids = [];

if (AGAIN) {
  for (const [id, r] of Object.entries(readIndex())) {
    if (only.length && !only.includes(id)) continue;
    found_ids.push([id, r]);
  }
} else {
  for (const [id, queries] of Object.entries(WANTED)) {
    if (only.length && !only.includes(id)) continue;
    let found = null;
    for (const q of queries) {
      if (found) break;
      const titles = await searchTitles(q);
      for (const title of titles) {
        const info = await imageInfo(title);
        const chosen = info ? pick(info, title) : null;
        if (chosen) { found = chosen; break; }
      }
    }
    if (!found) { console.log(`- ${id}: nenhuma foto livre encontrada`); continue; }
    found_ids.push([id, found]);
  }
}

for (const [id, found] of found_ids) {
  const buf = (await grab(resized(found.thumb))) ?? (await grab(found.thumb));
  if (!buf) { console.log(`- ${id}: falhou o download`); continue; }
  const out = `public/classes/${id}.jpg`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  const row = { id, ...found, src: `/${out.replace('public/', '')}`, kb: Math.round(buf.length / 1024) };
  rows.push(row);
  console.log(`${id}: ${found.file} · ${found.license} · ${row.kb} kB`);
}

const credit = (r) => `${r.file.split('/')[0]} — foto de ${author(r)}, ${r.license}, via Wikimedia Commons`;

/**
 * Alguns ficheiros têm no campo `Artist` uma frase de página («para mais fotos
 * minhas veja aqui»), não um nome. Um crédito assim num ecrã parece um erro.
 */
const author = (r) => {
  const s = String(r.author ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 48 || /see:|gallery|uploaded|homepage/i.test(s)) return 'Wikimedia Commons';
  return s;
};

// photos.json é a memória do script: refazer uma categoria não apaga as outras.
const all = { ...readIndex() };
rows.forEach((r) => { all[r.id] = r; });
mkdirSync('public/classes', { recursive: true });
writeFileSync(INDEX, JSON.stringify(all, null, 2));

const byFile = new Map();
Object.values(all).forEach((r) => {
  const name = r.file.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  if (!byFile.has(name)) byFile.set(name, { file: name, author: author(r), license: r.license, page: r.page });
});
const credits = [...byFile.values()].map((c) => `  ${JSON.stringify(c)},`).join('\n');

const ts = `// Gerado por scripts/class-photos.mjs — não editar à mão.
//
// Fotos reais de cada tipo de veículo, todas de licença livre do Wikimedia
// Commons, auto-alojadas aqui (o telemóvel do cliente não vai buscar nada à
// Wikimedia, e um thumb redimensionado lá não é fiável). O crédito vai no
// \`alt\` e na lista visível da conta, porque CC BY exige autoria visível.
export interface ClassPhoto { src: string; alt: string; credit: string; page: string }

export const CLASS_PHOTOS: Record<string, ClassPhoto> = {
${Object.values(all).map((r) => `  ${JSON.stringify(r.id)}: { src: ${JSON.stringify(r.src)}, alt: ${JSON.stringify(r.id + ' — ' + r.file.replace(/\.(jpg|jpeg|png|webp)$/i, ''))}, credit: ${JSON.stringify(credit(r))}, page: ${JSON.stringify(r.page)} },`).join('\n')}
};

export const photoFor = (classId: string): ClassPhoto | null => CLASS_PHOTOS[classId] ?? null;

/** Crédito completo, para a lista visível na conta (CC BY exige autoria visível). */
export const IMAGE_CREDITS: { file: string; author: string; license: string; page: string }[] = [
${credits}
];
`;
mkdirSync('src/lib', { recursive: true });
writeFileSync('src/lib/classPhotos.ts', ts);
console.log(`\n${Object.keys(all).length} categorias com foto · ${rows.length} refeitas`);
