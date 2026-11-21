// Passagem de maturidade da tipografia: peso segue tamanho, sem maiúsculas
// como decoração, e a sombra deixa de ser brilho roxo. Corre uma vez, à mão,
// sobre src/. Não faz parte do build.
//   node scripts/uipass.mjs [--dry]
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const NAMED = { 'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18, 'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30 };

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
};
walk(ROOT);

const sizeOf = (line) => {
  let best = null;
  for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    const n = Number(m[1]);
    if (best === null || n < best) best = n;
  }
  for (const [cls, n] of Object.entries(NAMED)) {
    if (line.includes(cls) && (best === null || n < best)) best = n;
  }
  return best;
};

const changes = {};
let total = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let size = null;          // contexto herdado das linhas acima
  let since = 0;
  const out = lines.map((line) => {
    let l = line;
    const own = sizeOf(l);
    if (own !== null) { size = own; since = 0; }
    else if (since < 3) since += 1;
    else size = null;

    const n = own ?? size ?? 14;

    // 9 e 10px não existem: o piso é 11, e nada de texto essencial abaixo
    // disso num telemóvel com sol em cima.
    l = l.replace(/text-\[(9|10)px\]/g, 'text-[11px]');

    // 100% preto não é ênfase, é volume. O peso segue o corpo.
    if (/font-(black|extrabold)/.test(l)) {
      const w = n <= 13 ? 'font-semibold' : 'font-bold';
      l = l.replace(/font-(black|extrabold)/g, w);
      if (n >= 18 && !/tracking-/.test(l)) l = l.replace(w, `${w} tracking-tight`);
    }
    // Negrito a 11px é grito; aí o meio-peso chega.
    if (n <= 11) l = l.replace(/font-bold/g, 'font-medium');

    // Maiúsculas espaçadas eram a assinatura do «cartoon». Frase normal.
    // Consome o espaço antes do token: assim não sobra cola de duas espaços
    // nem é preciso mexer na indentação do ficheiro.
    l = l.replace(/\s*\b(?:uppercase|tracking-(?:wider|widest|wide))\b/g, '');

    // O brilho colorido sob o botão é adorno; a elevação neutra é profundidade.
    l = l.replace(/shadow-(?:lg|xl)\s+shadow-[a-z]+-\d+\/\d+/g, 'shadow-card');
    l = l.replace(/\s+shadow-(?:purple|violet)-\d+\/\d+/g, '');
    l = l.replace(/\bshadow-lg\b/g, 'shadow-card');
    l = l.replace(/\bshadow-xl\b/g, 'shadow-card');
    if (l !== line) {
      changes[file] = (changes[file] || 0) + 1;
      total += 1;
    }
    return l;
  });
  if (!DRY && out.join('\n') !== src) writeFileSync(file, out.join('\n'));
}

const rel = (p) => p.replace(ROOT, 'src');
for (const [f, c] of Object.entries(changes).sort((a, b) => b[1] - a[1])) {
  console.log(String(c).padStart(4), rel(f));
}
console.log(DRY ? `dry-run: ${total} linhas mudariam` : `${total} linhas alteradas em ${Object.keys(changes).length} ficheiros`);
