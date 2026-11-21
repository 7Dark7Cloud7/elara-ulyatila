/**
 * Chapas de matrícula angolanas — Decreto Presidencial n.º 202/16, art. 27.º.
 *
 * A lei diz a forma: **três letras + dois grupos de dois algarismos + duas
 * letras**, separados por traços (`LDA-00-01-AA`), e dá o código de cada
 * província. Antes de Janeiro de 2024 circulava `LD-12-34-AB` (duas letras), e
 * antes de 1996 `AAA-12-34`. As três formas vivem na rua ao mesmo tempo, por
 * isso a app reconhece as três em vez de exigir só a nova.
 *
 * O que este módulo **não** faz: dizer que a chapa é verdadeira. Não há em
 * Angola um registo público consultável por aplicação — quem prometer «verifiquámos
 * a matrícula no registro» está a mentir. O que se faz aqui é (a) forma, (b) a
 * província do código, (c) coerência com o ano e com a praça, e (d) duplicado
 * contra a própria base da Elara, que tem índice único na matrícula. O resto é
 * uma pessoa a olhar para o livrete.
 */

export interface PlateRegion {
  code: string;
  /** O nome da província/município tal como está escrito na lei. */
  region: string;
}

/** art. 27.º, alíneas a) a s) — 19 códigos, sem inventar nenhum. */
export const PLATE_REGIONS: PlateRegion[] = [
  { code: 'BGO', region: 'Bengo' },
  { code: 'BIE', region: 'Bié' },
  { code: 'BLA', region: 'Benguela' },
  { code: 'CCU', region: 'Quando Cubango' },
  { code: 'CDA', region: 'Cabinda' },
  { code: 'CNE', region: 'Cunene' },
  { code: 'CNO', region: 'Cuanza-Norte' },
  { code: 'CSU', region: 'Cuanza-Sul' },
  { code: 'HBO', region: 'Huambo' },
  { code: 'HLA', region: 'Huíla' },
  { code: 'LDA', region: 'Luanda' },
  { code: 'LNO', region: 'Lunda-Norte' },
  { code: 'LSU', region: 'Lunda-Sul' },
  { code: 'LTO', region: 'Lobito' },
  { code: 'MCO', region: 'Moxico' },
  { code: 'MJE', region: 'Malanje' },
  { code: 'NBE', region: 'Namibe' },
  { code: 'UGE', region: 'Uíge' },
  { code: 'ZRE', region: 'Zaire' },
];

const REGION_OF = new Map(PLATE_REGIONS.map((r) => [r.code, r.region]));

export type PlateShape = 'nova' | 'antiga' | 'pre-1996' | 'invalida';

export interface ParsedPlate {
  /** O que se escreve no servidor: maiúsculas, sem traços nem espaços. */
  value: string;
  shape: PlateShape;
  /** As letras da região, tal como vêm na chapa (2, 3 ou 0). */
  prefix: string;
  digits: string;
  tail: string;
  /** A província do código, quando a lei o define. */
  region: string | null;
  /** Só diz «tem a forma de uma chapa angolana». Nada mais. */
  ok: boolean;
  error: string | null;
}

/** Limpa o que a pessoa escreve: traços, espaços, a caixa «AO» e acentos. */
export function normalizePlate(raw: string): string {
  return raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^AO/, '');
}

/** Como a chapa se mostra a uma pessoa: com os traços da lei. */
export function displayPlate(value: string): string {
  const v = normalizePlate(value);
  if (/^[A-Z]{3}\d{4}[A-Z]{2}$/.test(v)) return `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5, 7)}-${v.slice(7)}`;
  if (/^[A-Z]{2}\d{4}[A-Z]{2}$/.test(v)) return `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}-${v.slice(6)}`;
  if (/^[A-Z]{3}\d{4}$/.test(v)) return `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}`;
  return v;
}

export function parsePlate(raw: string): ParsedPlate {
  const value = normalizePlate(raw);
  const base = { value, prefix: '', digits: '', tail: '', region: null, ok: false, error: null as string | null };
  if (!value) return { ...base, shape: 'invalida', error: null };

  const nova = value.match(/^([A-Z]{3})(\d{2})(\d{2})([A-Z]{2})$/);
  if (nova) {
    const [, prefix, a, b, tail] = nova;
    return {
      ...base, shape: 'nova', prefix, digits: a + b, tail,
      region: REGION_OF.get(prefix) ?? null, ok: true,
    };
  }
  const antiga = value.match(/^([A-Z]{2})(\d{2})(\d{2})([A-Z]{2})$/);
  if (antiga) {
    const [, prefix, a, b, tail] = antiga;
    // A série de 1996-2023 só tem `LD` documentado para Luanda; os restantes
    // dois códigos não os inventamos — a forma vale, a província pergunta-se.
    return {
      ...base, shape: 'antiga', prefix, digits: a + b, tail,
      region: prefix === 'LD' ? 'Luanda' : null, ok: true,
    };
  }
  const velha = value.match(/^([A-Z]{3})(\d{2})(\d{2})$/);
  if (velha) {
    const [, prefix, a, b] = velha;
    return {
      ...base, shape: 'pre-1996', prefix, digits: a + b, tail: '',
      region: REGION_OF.get(prefix) ?? null, ok: true,
    };
  }
  return {
    ...base, shape: 'invalida',
    error: 'A chapa angolana tem três letras, quatro algarismos e duas letras — como LDA-00-01-AA. Falta alguma coisa ou vem com letras no lugar dos números.',
  };
}

export interface PlateIssue {
  level: 'erro' | 'aviso';
  text: string;
}

interface PlateContext {
  /** A província da praça escolhida (vem da `tr_zone`, não da pessoa). */
  province?: string | null;
  /** O ano do carro, para a chapa bater com a época. */
  year?: number | null;
}

/**
 * As contradições que se vêem sem registo nenhum. Um erro bloqueia; um aviso
 * deixa passar e diz à pessoa o que a equipa vai perguntar.
 */
export function plateIssues(p: ParsedPlate, ctx: PlateContext = {}): PlateIssue[] {
  const out: PlateIssue[] = [];
  if (!p.value) return out;
  if (!p.ok) { out.push({ level: 'erro', text: p.error ?? 'A matrícula não tem a forma de uma chapa angolana.' }); return out; }

  // «LDA-00-00-AA» é o exemplo da lei escrito por quem copiou o placeholder.
  if (p.digits === '0000') {
    out.push({ level: 'erro', text: 'Os números estão todos em 00-00, que é o exemplo da lei. Escreva a matrícula que está na chapa do carro.' });
  }
  // O código de província só está definido para a série em vigor. Nas séries
  // antigas a app não inventa: vale a forma, e a província pergunta-se à pessoa.
  if (p.shape === 'nova' && !p.region) {
    out.push({ level: 'erro', text: `«${p.prefix}» não é um código de província do Decreto 202/16. Confirme as três primeiras letras na chapa.` });
  }

  if (p.shape === 'pre-1996') {
    out.push({ level: 'aviso', text: 'Essa é a série anterior a 1996. Não é impedimento, mas a equipa vai querer ver o livrete antes da primeira viagem.' });
    if (ctx.year && ctx.year > 1996) {
      out.push({ level: 'aviso', text: `Um carro de ${ctx.year} com chapa da série anterior a 1996 é estranho — verifique se não trocou duas letras.` });
    }
  }
  if (p.shape === 'antiga') {
    out.push({ level: 'aviso', text: 'Chapa do modelo anterior a Janeiro de 2024. A troca era obrigatória dentro de dois anos, por isso confirme se a chapa do carro já é a nova — é com o livrete na mão que isto se resolve.' });
  }

  const province = ctx.province?.trim();
  if (province && p.region) {
    const same = p.region.toLowerCase() === province.toLowerCase();
    if (!same) {
      out.push({
        level: 'aviso',
        text: `A chapa é de ${p.region} e a sua praça é em ${province}. Não proíbe nada — um carro pode trabalhar fora da província onde foi registado — mas a equipa vai perguntar porquê.`,
      });
    }
  }
  return out;
}

/** O que mostrar enquanto a pessoa escreve: forma, proveniência e duplicado. */
export function plateSummary(p: ParsedPlate): string | null {
  if (!p.value) return null;
  if (!p.ok) return null;
  const where = p.region ? ` · ${p.region}` : p.shape === 'antiga' ? ' · série 1996-2023' : '';
  return p.shape === 'nova' ? `Formato em vigor${where}` : `Formato antigo (${p.shape === 'antiga' ? '1996-2023' : 'antes de 1996'})${where}`;
}
