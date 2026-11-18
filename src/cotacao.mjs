// Camada de referencia: quanto o mercado paga pelo milheiro de cada programa.
// Serve de parametro para decidir se uma transferencia bonificada vale a pena.
//
// Duas fontes, por ordem de confianca:
//  1. data/referencia-manual.json  (voce edita, tem a ultima palavra)
//  2. raspagem da tabela comparativa do iDinheiro (snapshot editorial)

import fs from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ARQ_MANUAL = path.join(RAIZ, 'data', 'referencia-manual.json');
const ARQ_SAIDA = path.join(RAIZ, 'data', 'referencia.json');

const FONTE_IDINHEIRO = 'https://www.idinheiro.com.br/cartao-de-credito/milhas/quanto-vale-uma-milha/';

const APELIDOS = {
  'tudoazul': 'Azul Fidelidade',
  'azul fidelidade': 'Azul Fidelidade',
  'latam pass': 'Latam Pass',
  'latam pass (latam airlines)': 'Latam Pass',
  'smiles': 'Smiles',
  'smiles (gol)': 'Smiles',
  'livelo': 'Livelo',
  'esfera': 'Esfera'
};

function limpar(html) {
  return html
    .replace(/<[^>]+>/g, '|')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function valores(txt) {
  // Captura "R$12,50 a R$15,30" e "R$18,44"
  const vals = [...txt.matchAll(/R\$\s*([\d.]+,\d{2}|\d+)/g)]
    .map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
    .filter((n) => n > 1 && n < 200);
  return vals;
}

export async function rasparIdinheiro() {
  const r = await fetch(FONTE_IDINHEIRO, {
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }
  });
  if (!r.ok) throw new Error(`iDinheiro HTTP ${r.status}`);
  const html = await r.text();

  const tabelas = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const alvo = tabelas.find((t) => /valor do milheiro/i.test(t) && /smiles/i.test(t));
  if (!alvo) throw new Error('tabela de cotacao nao encontrada');

  const linhas = [...alvo.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => limpar(m[0]));
  const out = {};
  for (const l of linhas) {
    const nomeBruto = Object.keys(APELIDOS).find((k) => l.toLowerCase().includes(k));
    if (!nomeBruto) continue;
    const prog = APELIDOS[nomeBruto];
    const vs = valores(l);
    if (!vs.length) continue;
    out[prog] = {
      programa: prog,
      min: Math.min(...vs),
      max: Math.max(...vs),
      mediana: Number((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)),
      amostras: vs.length,
      fonte: 'iDinheiro (tabela comparativa MaxMilhas/HotMilhas/BankMilhas)',
      fonteUrl: FONTE_IDINHEIRO,
      coletadoEm: new Date().toISOString()
    };
  }
  if (!Object.keys(out).length) throw new Error('nenhum programa extraido');
  return out;
}

export async function montarReferencia() {
  let base = {};
  const erros = [];

  try { base = await rasparIdinheiro(); }
  catch (e) { erros.push(`iDinheiro: ${e.message}`); }

  // O manual sobrescreve: e onde voce fixa a cotacao que confia.
  try {
    const manual = JSON.parse(await fs.readFile(ARQ_MANUAL, 'utf8'));
    for (const [prog, v] of Object.entries(manual.programas || {})) {
      base[prog] = { ...(base[prog] || {}), ...v, programa: prog, fonte: v.fonte || 'manual', manual: true };
    }
  } catch { /* sem arquivo manual */ }

  const saida = { atualizadoEm: new Date().toISOString(), erros, programas: base };
  await fs.writeFile(ARQ_SAIDA, JSON.stringify(saida, null, 2) + '\n');
  return saida;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  montarReferencia().then((r) => {
    console.log('Referencia de cotacao atualizada:');
    for (const p of Object.values(r.programas)) {
      console.log(`  ${p.programa}: R$ ${p.min?.toFixed(2)} a R$ ${p.max?.toFixed(2)} (mediana R$ ${p.mediana}) ${p.manual ? '[manual]' : ''}`);
    }
    if (r.erros.length) console.log('Erros:', r.erros.join(' | '));
  }).catch((e) => { console.error(e); process.exit(1); });
}
