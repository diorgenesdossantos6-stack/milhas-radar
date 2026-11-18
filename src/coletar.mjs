// Coletor: le os feeds, classifica promocoes, atualiza data/promocoes.json
// e dispara alerta no Telegram para oportunidades acima do limite.
//
// Uso:  node src/coletar.mjs [--seco] [--limite 80]
//   --seco   nao grava nada, so imprime o que encontrou
//   --limite percentual minimo para alertar (padrao 80)

import fs from 'node:fs/promises';
import path from 'node:path';
import { montarReferencia } from './cotacao.mjs';
import { coletarLivelo } from './livelo.mjs';
import { parseFeed, classificar, programas, percentual, prazo, chave, agruparCampanhas, custoMilheiro, acumuloLoja, avaliar, avaliarClube, valeEsperar, combinar, valorJustoAuto, tetoCompra } from './parser.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ARQ_DADOS = path.join(RAIZ, 'data', 'promocoes.json');
const ARQ_FONTES = path.join(RAIZ, 'src', 'fontes.json');

const args = process.argv.slice(2);
const SECO = args.includes('--seco');
const LIMITE = Number(args[args.indexOf('--limite') + 1]) || Number(process.env.LIMITE_ALERTA) || 80;
const AGORA = new Date();

async function baixar(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'milhas-radar/1.0 (+coletor pessoal de promocoes)' }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function pontuar(promo, historico) {
  // Pontua a oportunidade de 0 a 100 combinando percentual, raridade e urgencia.
  const pct = promo.percentual ?? 0;
  const par = promo.par;
  const maxHist = historico[par]?.maxPercentual ?? 0;
  let nota = Math.min(60, pct * 0.6);                       // ate 60 pelo percentual
  if (maxHist && pct >= maxHist) nota += 25;                // iguala ou bate o recorde do par
  else if (maxHist && pct >= maxHist * 0.9) nota += 15;
  else if (!maxHist) nota += 10;                            // par sem historico ainda
  if (promo.tipo === 'transferencia_bonificada') nota += 10;
  const horas = (new Date(promo.ate) - AGORA) / 36e5;
  if (horas > 0 && horas <= 24) nota += 5;                  // acaba hoje
  return Math.round(Math.min(100, nota));
}

async function alertarTelegram(promos) {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || !promos.length) return;
  const linhas = promos.map((p) => {
    const pct = p.percentual ? `${p.percentual}%` : 'bonus';
    const rota = p.par !== 'indefinido' ? p.par : p.titulo;
    const fim = new Date(p.ate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return `*${pct}* ${rota}\n${p.titulo}\nAte ${fim} (${p.fonteNome})\n${p.link}`;
  });
  const texto = `*Radar de milhas*\n\n${linhas.join('\n\n')}`;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'Markdown', disable_web_page_preview: false })
  });
  if (!r.ok) console.error('Falha no alerta Telegram:', r.status, await r.text());
  else console.log(`Alerta enviado: ${promos.length} promocao(oes).`);
}

async function main() {
  const cfg = JSON.parse(await fs.readFile(ARQ_FONTES, 'utf8'));

  let referencia = { programas: {} };
  try { referencia = await montarReferencia(); }
  catch (e) { console.error('Referencia de cotacao indisponivel:', e.message); }

  let livelo = null;
  try { livelo = await coletarLivelo(); console.log(`Livelo: ${livelo.total} parceiro(s), ${livelo.emCampanha} em campanha`); }
  catch (e) { console.error('Livelo indisponivel:', e.message); }

  let base = { atualizadoEm: null, historico: {}, observacoes: [], promocoes: [] };
  try {
    base = { ...base, ...JSON.parse(await fs.readFile(ARQ_DADOS, 'utf8')) };
  } catch { /* primeira execucao */ }

  const vistos = new Map(base.promocoes.map((p) => [p.id, p]));
  const novas = [];
  const erros = [];

  const resultados = await Promise.allSettled(
    cfg.feeds.map(async (f) => ({ f, xml: await baixar(f.url) }))
  );

  for (const r of resultados) {
    if (r.status === 'rejected') { erros.push(String(r.reason?.message || r.reason)); continue; }
    const { f, xml } = r.value;
    let itens;
    try { itens = parseFeed(xml, f); }
    catch (e) { erros.push(`${f.id}: ${e.message}`); continue; }

    for (const item of itens) {
      const tipo = classificar(item, cfg);
      if (!tipo) continue;
      const id = chave(item.link);
      if (vistos.has(id)) continue;

      const pg = programas(item, cfg);
      const pz = prazo(item, item.publicado);
      const par = pg.origem.length && pg.destino.length
        ? `${pg.origem[0]} -> ${pg.destino[0]}`
        : (pg.destino[0] || pg.origem[0] || 'indefinido');

      const promo = {
        id,
        titulo: item.titulo,
        link: item.link,
        fonte: item.fonte,
        fonteNome: item.fonteNome,
        publicado: item.publicado,
        tipo: tipo.id,
        tipoNome: tipo.nome,
        origem: pg.origem,
        destino: pg.destino,
        par,
        percentual: percentual(item),
        custoMilheiro: custoMilheiro(item),
        acumulo: acumuloLoja(item, tipo.id),
        clube: null, // avaliado depois, quando a régua já estiver calculada
        ate: pz.ate,
        confiancaPrazo: pz.confianca,
        resumo: item.resumo.slice(0, 400),
        coletadoEm: AGORA.toISOString()
      };
      promo.nota = pontuar(promo, base.historico);
      vistos.set(id, promo);
      novas.push(promo);
    }
  }

  // Cada preco de aquisicao lido vira observacao: e o que forma a regua com o tempo.
  base.observacoes = base.observacoes || [];
  for (const p of novas) {
    if (!p.custoMilheiro) continue;
    if (p.tipo !== 'clube' && p.tipo !== 'compra_pontos' && p.tipo !== 'transferencia_bonificada') continue;
    base.observacoes.push({
      em: p.publicado || p.coletadoEm,
      valor: p.custoMilheiro,
      tipo: p.tipo,
      programa: p.origem[0] || null,
      destino: p.destino[0] || null,
      titulo: p.titulo,
      link: p.link,
      fonte: p.fonteNome,
      id: p.id
    });
  }
  // Mantem 180 dias e no maximo 400 observacoes.
  const corteObs = AGORA.getTime() - 180 * 864e5;
  base.observacoes = base.observacoes
    .filter((o) => new Date(o.em).getTime() > corteObs)
    .slice(-400);

  // Atualiza o historico de maximo por par, que alimenta a pontuacao de raridade.
  for (const p of novas) {
    if (!p.percentual || p.par === 'indefinido') continue;
    const h = base.historico[p.par] || { maxPercentual: 0, ocorrencias: 0 };
    h.maxPercentual = Math.max(h.maxPercentual, p.percentual);
    h.ocorrencias += 1;
    h.ultimaEm = p.publicado || p.coletadoEm;
    base.historico[p.par] = h;
  }

  // Mantem 180 dias de historico de promocoes.
  const corte = new Date(AGORA.getTime() - 180 * 864e5);
  const todas = [...vistos.values()]
    .filter((p) => new Date(p.publicado || p.coletadoEm) > corte)
    .sort((a, b) => new Date(b.publicado || 0) - new Date(a.publicado || 0));

  const ativas = todas.filter((p) => new Date(p.ate) >= AGORA);
  // A régua de valor justo sai dos preços já observados, não de um número fixo.
  const regua = {};
  for (const prog of Object.keys(cfg.programas.origem)) {
    regua[prog] = valorJustoAuto(
      (base.observacoes || []).filter((o) => !o.programa || o.programa === prog),
      referencia.programas[prog],
      cfg.valorJusto?.[prog] && cfg.valorJusto[prog] > 0 ? cfg.valorJusto[prog] : null
    );
  }

  // Teto por programa: quanto custa comprar mil milhas prontas.
  const tetosCompra = {};
  for (const prog of Object.keys(cfg.programas.destino)) {
    const t = tetoCompra(base.observacoes, prog);
    if (t) tetosCompra[prog] = t;
  }

  const campanhasAtivas = agruparCampanhas(ativas).map((c) => {
    const ref = referencia.programas[c.destino];
    if (ref) c.referencia = { min: ref.min, max: ref.max, mediana: ref.mediana, fonte: ref.fonte };
    if (c.tipo === 'clube') {
      // A régua tem que ser do mesmo programa dos pontos que a assinatura gera:
      // clube de companhia aérea gera milhas dela, Clube Livelo gera pontos Livelo.
      const refDestino = referencia.programas[c.destino];
      const ehAereo = Boolean(refDestino) && !regua[c.destino];
      const r = ehAereo
        ? { valor: refDestino.mediana, base: 'mercado',
            texto: `o que o mercado paga pelo milheiro ${c.destino}` }
        : (regua[c.destino] || regua[c.origens[0]] || regua.Livelo);
      const fonte = c.fontes[0];
      c.clube = avaliarClube({ titulo: c.titulo, resumo: fonte?.titulo || '' }, c.custoMilheiro, r?.valor, r?.texto);
      if (c.clube) { c.clube.regua = r; c.clube.programa = c.destino; }
    }
    const a = c.clube
      ? { ...c.clube, teto: null }
      : avaliar(c, referencia.programas, cfg.tetos, base.historico, tetosCompra);
    if (a) { c.veredito = a.veredito; c.rotulo = a.rotulo; c.motivo = a.motivo; c.baseVeredito = a.base; c.teto = a.teto ?? null; }
    const esperar = valeEsperar(c, base.historico, cfg.cadencia);
    if (esperar) c.esperar = esperar;
    return c;
  });
  const combinacoes = combinar(campanhasAtivas);
  const saida = {
    atualizadoEm: AGORA.toISOString(),
    totalAtivas: ativas.length,
    totalCampanhasAtivas: campanhasAtivas.length,
    combinacoes,
    erros,
    historico: base.historico,
    observacoes: base.observacoes,
    regua,
    tetosCompra,
    campanhasAtivas,
    promocoes: todas
  };

  console.log(`Feeds lidos: ${resultados.filter((r) => r.status === 'fulfilled').length}/${cfg.feeds.length}`);
  console.log(`Novas promocoes: ${novas.length} | Ativas: ${ativas.length} em ${campanhasAtivas.length} campanha(s)`);
  if (erros.length) console.log('Erros:', erros.join(' | '));
  for (const p of novas) {
    console.log(`  [${p.nota}] ${p.percentual ?? '-'}% ${p.par} :: ${p.titulo}`);
  }

  if (SECO) return;
  await fs.writeFile(ARQ_DADOS, JSON.stringify(saida, null, 2) + '\n');

  const alertar = novas.filter(
    (p) => (p.percentual ?? 0) >= LIMITE && new Date(p.ate) >= AGORA && p.tipo === 'transferencia_bonificada'
  );
  await alertarTelegram(alertar);
}

main().catch((e) => { console.error(e); process.exit(1); });
