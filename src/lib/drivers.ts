import { supabase } from './supabase';
import { normalizePlate } from './plates';

/**
 * «Esta matrícula já está noutra conta?» — a única pergunta sobre a chapa a que
 * se consegue responder de verdade sem um registo público: a nossa própria base,
 * onde a matrícula tem índice único desde a migração 0003.
 *
 * A política de leitura só mostra linhas aprovadas e a linha da própria pessoa,
 * por isso um «não encontrámos» quer dizer «até agora nada na Elara», não
 * «não existe no país». É por isso que a frase na app nunca promete verificação.
 */
export async function plateTaken(plate: string): Promise<{ taken: boolean; checked: boolean }> {
  const value = normalizePlate(plate);
  if (value.length < 4) return { taken: false, checked: false };
  const { data, error } = await supabase.from('tr_driver').select('id').eq('plate', value).limit(1);
  if (error || !data) return { taken: false, checked: false };
  return { taken: data.length > 0, checked: true };
}

/**
 * O nome que a rua vê. É a mesma regra que `tr_apply_driver` aplica no
 * servidor — primeira palavra + inicial do último apelido — para o ensaio
 * mostrar exactamente o que fica gravado, e não uma esperança.
 */
export function publicNameOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  const last = words[words.length - 1];
  // Sem `toUpperCase`: o servidor faz `left(última palavra, 1)`, por isso o
  // nome com minúscula fica com minúscula — o ensaio mostra o texto tal e qual
  // como ele vai aparecer ao passageiro.
  return `${words[0]} ${last.slice(0, 1)}.`;
}
