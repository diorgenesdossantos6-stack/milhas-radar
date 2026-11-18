// Coletor das ofertas de parceiro da Livelo.
// A página /ofertas publica os dados estruturados de cada parceiro: pontuação
// normal, pontuação da campanha, pontuação para assinante do Clube e o prazo.
// É daí que sai o multiplicador, que é o que realmente diz se a oferta é boa.

import fs from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ARQ = path.join(RAIZ, 'data', 'livelo-parceiros.json');
const URL_OFERTAS = 'https://www.livelo.com.br/ofertas';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function semTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function paraIso(d) {
  // "2026-11-22-23:59:00 GMT-03:00" -> ISO
  if (!d) return null;
  const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, a, me, dia, h, mi, se] = m;
  const dt = new Date(`${a}-${me}-${dia}T${h}:${mi}:${se}-03:00`);
  return isNaN(dt) ? null : dt.toISOString();
}

/** Percorre o JSON da página e junta os perfis de parceiro de todas as abas. */
export function extrairParceiros(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ nao encontrado');
  const dados = JSON.parse(m[1]);

  const perfis = [];
  (function varrer(o, prof = 0) {
    if (prof > 24 || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) { for (const v of o) varrer(v, prof + 1); return; }
    if (Array.isArray(o.partnersProfile)) perfis.push(...o.partnersProfile);
    for (const v of Object.values(o)) varrer(v, prof + 1);
  })(dados);

  const porId = new Map();
  for (const p of perfis) {
    const par = p.parity || {};
    const atual = Number(par.parity) || 0;
    const clube = Number(par.parityClub) || 0;
    const normal = Number(par.parityBau) || 0;
    if (!atual && !clube) continue;

    const melhor = Math.max(atual, clube);
    const multiplicador = normal > 0 ? Number((melhor / normal).toFixed(1)) : null;
    const emCampanha = Boolean(par.promotion) || par.activeCampaign === 'PROMOTION' ||
      (normal > 0 && melhor > normal);

    const registro = {
      id: p.id,
      loja: p.name,
      link: (p.partnerDetailsPage || p.link || '').trim(),
      categorias: (p.categories || []).filter((c) => c !== 'todos'),
      pontosPorReal: atual,
      pontosClube: clube || null,
      pontosNormal: normal || null,
      multiplicador,
      emCampanha,
      de: paraIso(par.dateStart),
      ate: paraIso(par.dateEnd),
      regras: semTags(par.legalTerms).slice(0, 300) || null
    };
    const anterior = porId.get(p.id);
    if (!anterior || melhor > Math.max(anterior.pontosPorReal, anterior.pontosClube || 0)) {
      porId.set(p.id, registro);
    }
  }

  return [...porId.values()].sort((a, b) => {
    const ma = a.multiplicador || 0, mb = b.multiplicador || 0;
    return mb - ma || Math.max(b.pontosPorReal, b.pontosClube || 0) - Math.max(a.pontosPorReal, a.pontosClube || 0);
  });
}

/**
 * Lê as ofertas. Se a Livelo mudar a página e a leitura falhar, mantém a
 * última leitura boa e registra o erro, em vez de apagar tudo em silêncio.
 */
export async function coletarLivelo() {
  const agora = new Date();
  let anterior = null;
  try { anterior = JSON.parse(await fs.readFile(ARQ, 'utf8')); } catch { /* primeira vez */ }

  try {
    const r = await fetch(URL_OFERTAS, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const parceiros = extrairParceiros(await r.text());
    if (!parceiros.length) throw new Error('nenhum parceiro no JSON da pagina');

    const vigentes = parceiros.filter((p) => !p.ate || new Date(p.ate) >= agora);
    const saida = {
      atualizadoEm: agora.toISOString(),
      lidoEm: agora.toISOString(),
      fonte: URL_OFERTAS,
      ok: true,
      total: vigentes.length,
      emCampanha: vigentes.filter((p) => p.emCampanha).length,
      parceiros: vigentes
    };
    await fs.writeFile(ARQ, JSON.stringify(saida, null, 2) + '\n');
    return saida;
  } catch (e) {
    // Falhou: preserva o que já havia, marcado como leitura antiga.
    const base = anterior || { parceiros: [], total: 0, emCampanha: 0, fonte: URL_OFERTAS };
    const vigentes = (base.parceiros || []).filter((p) => !p.ate || new Date(p.ate) >= agora);
    const saida = {
      ...base,
      atualizadoEm: agora.toISOString(),
      lidoEm: base.lidoEm || base.atualizadoEm || null,
      ok: false,
      erro: e.message,
      total: vigentes.length,
      emCampanha: vigentes.filter((p) => p.emCampanha).length,
      parceiros: vigentes
    };
    await fs.writeFile(ARQ, JSON.stringify(saida, null, 2) + '\n');
    throw Object.assign(new Error(`Livelo: ${e.message} (mantida a leitura de ${saida.lidoEm || 'nunca'})`), { parcial: saida });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  coletarLivelo().then((r) => {
    console.log(`Livelo: ${r.total} parceiro(s), ${r.emCampanha} em campanha`);
    for (const p of r.parceiros.slice(0, 14)) {
      const fim = p.ate ? new Date(p.ate).toLocaleDateString('pt-BR') : 'sem prazo';
      const mult = p.multiplicador ? `${p.multiplicador}x` : '  -';
      console.log(`  ${String(p.pontosPorReal).padStart(3)} pts/R$ (clube ${String(p.pontosClube ?? '-').padStart(3)}, normal ${String(p.pontosNormal ?? '-').padStart(3)}) ${mult.padStart(5)}  ate ${fim}  ${p.loja}`);
    }
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
