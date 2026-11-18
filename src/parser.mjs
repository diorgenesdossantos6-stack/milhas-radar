// Parser de feeds RSS 2.0 e extracao de promocoes de milhas.
// Sem dependencias externas: roda em Node 18+ puro.

const MESES = {
  janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
};

export function normalizar(txt) {
  return (txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '-')
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(bloco, nome) {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i');
  const m = bloco.match(re);
  return m ? decodeEntities(m[1]).trim() : '';
}

function tagsTodas(bloco, nome) {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'gi');
  return [...bloco.matchAll(re)].map((m) => decodeEntities(m[1]).trim());
}

/** Extrai os itens de um feed RSS 2.0 (tambem tolera Atom simples). */
export function parseFeed(xml, fonte) {
  const blocos = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entradas = blocos.length
    ? blocos
    : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);

  return entradas.map((b) => {
    let link = tag(b, 'link');
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? decodeEntities(m[1]) : '';
    }
    const pub = tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published');
    const d = pub ? new Date(pub) : null;
    return {
      fonte: fonte.id,
      fonteNome: fonteDoLink(link.trim(), fonte.nome),
      titulo: stripTags(tag(b, 'title')),
      link: link.trim(),
      publicado: d && !isNaN(d) ? d.toISOString() : null,
      resumo: stripTags(tag(b, 'description') || tag(b, 'summary')).slice(0, 1200),
      categorias: tagsTodas(b, 'category').map(stripTags).filter(Boolean)
    };
  }).filter((it) => it.titulo && it.link);
}

/** Classifica o tipo de promocao; devolve null se nao parecer promocao de pontos. */
export function classificar(item, cfg) {
  const texto = normalizar(`${item.titulo} ${item.resumo} ${item.categorias.join(' ')}`);
  const tituloNorm = normalizar(item.titulo);

  // Descarta ruido obvio quando nao ha sinal forte de bonificacao no titulo.
  const temSinalForte = /(bonus|bonificad)/.test(tituloNorm) &&
    /(transferenc|transferir|envio de pontos|enviar pontos)/.test(texto);
  if (!temSinalForte) {
    for (const r of cfg.ruido) {
      if (tituloNorm.includes(normalizar(r))) return null;
    }
  }

  const achados = [];
  for (const t of cfg.tipos) {
    const temExige = t.exige.some((k) => texto.includes(normalizar(k)));
    const temContexto = !t.contexto.length || t.contexto.some((k) => texto.includes(normalizar(k)));
    if (temExige && temContexto) achados.push(t);
  }
  if (!achados.length) return null;
  achados.sort((a, b) => a.prioridade - b.prioridade);
  return achados[0];
}

/** Identifica programas de origem e destino citados. */
export function programas(item, cfg) {
  const texto = normalizar(`${item.titulo} ${item.resumo}`);
  const casar = (mapa) => Object.entries(mapa)
    .filter(([, chaves]) => chaves.some((k) => texto.includes(normalizar(k))))
    .map(([nome]) => nome);
  return { origem: casar(cfg.programas.origem), destino: casar(cfg.programas.destino) };
}

/** Maior percentual de bonus/desconto citado, priorizando o titulo. */
export function percentual(item) {
  const pega = (txt) => {
    const vals = [...normalizar(txt).matchAll(/(\d{1,3})\s*%/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n >= 5 && n <= 300);
    return vals.length ? Math.max(...vals) : null;
  };
  return pega(item.titulo) ?? pega(item.resumo);
}

/**
 * Tenta descobrir ate quando a promocao vale.
 * Cobre "hoje (22/09)", "ate 14 de agosto", "23h59 do dia 19/01/2026",
 * "valida somente hoje", "ultimo dia", "ate amanha".
 */
export function prazo(item, refIso) {
  const ref = refIso ? new Date(refIso) : new Date();
  const texto = normalizar(`${item.titulo} ${item.resumo}`);
  const fim = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d, 23, 59, 0));
    return dt.toISOString();
  };
  const anoRef = ref.getUTCFullYear();

  // dd/mm/aaaa ou dd/mm
  const mData = texto.match(/(?:ate|at[eé]|dia|em)\s*(?:as\s*)?(?:\d{1,2}h\d{0,2}\s*(?:do dia)?\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (mData) {
    const d = Number(mData[1]), m = Number(mData[2]);
    let y = mData[3] ? Number(mData[3]) : anoRef;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let iso = fim(y, m, d);
      // virada de ano: promocao de dezembro citada em janeiro e vice-versa
      if (!mData[3] && new Date(iso) < new Date(ref.getTime() - 20 * 864e5)) iso = fim(y + 1, m, d);
      return { ate: iso, confianca: 'alta' };
    }
  }

  // "ate 14 de agosto"
  const mExt = texto.match(/(?:ate|at[eé]|dia)\s*(\d{1,2})\s*de\s*([a-z]+)(?:\s*de\s*(\d{4}))?/);
  if (mExt && MESES[mExt[2]]) {
    const d = Number(mExt[1]), m = MESES[mExt[2]];
    const y = mExt[3] ? Number(mExt[3]) : anoRef;
    let iso = fim(y, m, d);
    if (!mExt[3] && new Date(iso) < new Date(ref.getTime() - 20 * 864e5)) iso = fim(y + 1, m, d);
    return { ate: iso, confianca: 'alta' };
  }

  // "hoje (22/09)" ja coberto acima; aqui o caso sem data
  if (/(somente hoje|so hoje|valida hoje|valido hoje|ultimo dia|ultimas horas|termina hoje|encerra hoje|hoje \()/.test(texto)) {
    const base = item.publicado ? new Date(item.publicado) : ref;
    return { ate: fim(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()), confianca: 'media' };
  }
  if (/(ate amanha|termina amanha|valida ate amanha)/.test(texto)) {
    const base = new Date((item.publicado ? new Date(item.publicado) : ref).getTime() + 864e5);
    return { ate: fim(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()), confianca: 'media' };
  }

  // Sem prazo identificado: assume janela curta a partir da publicacao.
  const base = item.publicado ? new Date(item.publicado) : ref;
  return { ate: new Date(base.getTime() + 3 * 864e5).toISOString(), confianca: 'baixa' };
}

/**
 * O nome da fonte sai do domínio da matéria, não do feed que a trouxe.
 * Feeds irmãos publicam links uns dos outros, e creditar o feed errado
 * é mentir sobre a origem do número.
 */
const SITES = {
  'melhoresdestinos.com.br': 'Melhores Destinos',
  'melhorescartoes.com.br': 'Melhores Cartões',
  'passageirodeprimeira.com': 'Passageiro de Primeira',
  'pontospravoar.com': 'Pontos pra Voar',
  'cartoesdecredito.me': 'Cartões de Crédito',
  'cartoeseviagens.com.br': 'Cartões e Viagens',
  'livelo.com.br': 'Livelo',
  'idinheiro.com.br': 'iDinheiro'
};

export function fonteDoLink(link, padrao) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    for (const [dominio, nome] of Object.entries(SITES)) {
      if (host === dominio || host.endsWith(`.${dominio}`)) return nome;
    }
    return host;
  } catch {
    return padrao;
  }
}

export function chave(link) {
  try {
    const u = new URL(link);
    u.search = ''; u.hash = '';
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return normalizar(link);
  }
}

/**
 * Agrupa promocoes que sao a mesma campanha noticiada por varias fontes.
 * Chave: destino principal + percentual + tipo + dia do prazo.
 */
export function agruparCampanhas(promos) {
  const grupos = new Map();
  for (const p of promos) {
    const dia = (p.ate || '').slice(0, 10);
    const dest = (p.destino && p.destino[0]) || (p.origem && p.origem[0]) || 'indefinido';
    const k = `${normalizar(dest)}|${p.percentual ?? 'x'}|${p.tipo}|${dia}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        id: k,
        tipo: p.tipo,
        tipoNome: p.tipoNome,
        destino: dest,
        origens: [],
        percentual: p.percentual,
        ate: p.ate,
        confiancaPrazo: p.confiancaPrazo,
        nota: p.nota,
        custoMilheiro: p.custoMilheiro ?? null,
        acumulo: p.acumulo ?? null,
        clube: p.clube ?? null,
        titulo: p.titulo,
        publicado: p.publicado,
        fontes: []
      });
    }
    const g = grupos.get(k);
    for (const o of p.origem || []) if (!g.origens.includes(o)) g.origens.push(o);
    if (!g.fontes.some((f) => f.fonte === p.fonteNome)) {
      g.fontes.push({ fonte: p.fonteNome, link: p.link, titulo: p.titulo, publicado: p.publicado });
    }
    g.nota = Math.max(g.nota, p.nota);
    if (p.confiancaPrazo === 'alta' && g.confiancaPrazo !== 'alta') {
      g.confiancaPrazo = 'alta';
      g.ate = p.ate;
    }
    if (p.custoMilheiro && (!g.custoMilheiro || p.custoMilheiro < g.custoMilheiro)) g.custoMilheiro = p.custoMilheiro;
    if (p.acumulo && (!g.acumulo || (p.acumulo.porReal || 0) > (g.acumulo.porReal || 0))) g.acumulo = p.acumulo;
    if (p.clube && (!g.clube || p.clube.milheiro < g.clube.milheiro)) g.clube = p.clube;
    if (p.titulo.length < g.titulo.length) g.titulo = p.titulo;
    if (p.publicado && (!g.publicado || p.publicado < g.publicado)) g.publicado = p.publicado;
  }
  return [...grupos.values()].sort((a, b) => b.nota - a.nota || new Date(b.publicado || 0) - new Date(a.publicado || 0));
}

/**
 * Extrai o custo do milheiro quando a propria materia ja calcula,
 * ex.: "Milheiro Smiles a partir de R$ 15,55".
 */
export function custoMilheiro(item) {
  const txt = `${item.titulo} ${item.resumo}`;
  const re = /milheiro[^.;]{0,60}?R\$\s*([\d.]+,\d{2}|\d+(?:,\d{2})?)|R\$\s*([\d.]+,\d{2}|\d+(?:,\d{2})?)[^.;]{0,30}?\/?\s*milheiro/i;
  const m = txt.match(re);
  if (!m) return null;
  const bruto = m[1] || m[2];
  const v = Number(String(bruto).replace(/\./g, '').replace(',', '.'));
  return v > 2 && v < 200 ? Number(v.toFixed(2)) : null;
}

/**
 * Acúmulo em loja parceira: quantos pontos por real, e em qual loja.
 * Ex.: "Ganhe até 24 pontos Azul Fidelidade por real gasto na Natura".
 */
export function acumuloLoja(item, tipoId) {
  if (tipoId !== 'acumulo') return null;
  const titulo = item.titulo;
  const m = normalizar(titulo).match(/(?:ate\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*pontos?\s*(?:por|a cada)\s*(?:real|r\$\s*1?|dolar)/);
  const porReal = m ? Number(m[1].replace(',', '.')) : null;

  // Loja parceira: só no título, e só o que vem depois de "na/no/em".
  const ml = titulo.match(/\b(?:na|no|em)\s+((?:[A-ZÀ-Ý][\wÀ-ÿ&'.-]*)(?:\s+(?:[A-ZÀ-Ý][\wÀ-ÿ&'.-]*|de|do|da)){0,2})/);
  const naoSaoLojas = [
    'Livelo', 'Esfera', 'Smiles', 'Latam', 'Azul', 'Itaú', 'Itau', 'Bradesco', 'Caixa', 'C6',
    'Clube', 'Black', 'Friday', 'Orange', 'Melhores', 'Passageiro', 'Pontos', 'Cartões', 'Cartoes', 'Radar'
  ];
  let loja = ml ? ml[1].trim() : null;
  if (loja) {
    // Corta no primeiro termo que não é nome de loja (ex.: "Natura A Azul" -> "Natura").
    const partes = loja.split(/\s+/);
    const corte = partes.findIndex((w, i) => i > 0 && (w.length === 1 || naoSaoLojas.includes(w)));
    if (corte > 0) loja = partes.slice(0, corte).join(' ');
    if (naoSaoLojas.some((b) => loja.startsWith(b))) loja = null;
  }
  return porReal || loja ? { porReal, loja } : null;
}

/**
 * Diz se a promoção compensa, usando a melhor régua disponível:
 * 1. custo do milheiro contra a cotação de mercado (mais forte);
 * 2. percentual contra o teto conhecido daquela rota.
 */
export function avaliar(campanha, referencia, tetos, historico, tetosCompra) {
  const ref = referencia?.[campanha.destino];
  const compra = tetosCompra?.[campanha.destino];
  const fmt = (n) => n.toFixed(2).replace('.', ',');

  // Melhor régua possível: o preço de comprar essas mesmas milhas prontas.
  // Se gerar sai mais caro que comprar, não compensa gerar.
  if (campanha.custoMilheiro && compra?.valor) {
    const margem = Number((compra.valor - campanha.custoMilheiro).toFixed(2));
    const veredito = margem > compra.valor * 0.15 ? 'vale' : margem > 0 ? 'limite' : 'nao vale';
    const rotulo = veredito === 'vale' ? 'Vale a pena' : veredito === 'limite' ? 'No limite' : 'Não vale';
    const motivo = veredito === 'vale'
      ? `gerar sai a R$ ${fmt(campanha.custoMilheiro)}, contra R$ ${fmt(compra.valor)} para comprar pronto`
      : veredito === 'limite'
        ? `R$ ${fmt(campanha.custoMilheiro)} contra R$ ${fmt(compra.valor)} de comprar pronto: diferença pequena`
        : `R$ ${fmt(campanha.custoMilheiro)} sai mais caro que comprar pronto a R$ ${fmt(compra.valor)}`;
    return { veredito, rotulo, motivo, base: 'compra', margem };
  }

  // Sem promoção de compra registrada, recua para a cotação de referência.
  if (campanha.custoMilheiro && ref?.mediana) {
    const margem = Number((ref.mediana - campanha.custoMilheiro).toFixed(2));
    const veredito = margem > 2 ? 'vale' : margem > 0 ? 'limite' : 'nao vale';
    const motivo = veredito === 'vale'
      ? `milheiro R$ ${fmt(campanha.custoMilheiro)} contra R$ ${fmt(ref.mediana)} de referência`
      : veredito === 'limite'
        ? 'margem pequena sobre o preço de referência'
        : 'sai mais caro do que a referência de mercado';
    const rotulo = veredito === 'vale' ? 'Vale a pena' : veredito === 'limite' ? 'No limite' : 'Não vale';
    return { veredito, rotulo, motivo, base: 'cotacao', margem };
  }

  if (campanha.tipo === 'transferencia_bonificada' && campanha.percentual) {
    const histMax = historico?.[`${campanha.origens[0]} -> ${campanha.destino}`]?.maxPercentual || 0;
    const teto = Math.max(tetos?.[campanha.destino] || 0, histMax);
    if (!teto) return null;
    const razao = campanha.percentual / teto;
    if (razao >= 0.95) return { veredito: 'vale', rotulo: 'Melhor momento', motivo: `${campanha.percentual}% é o topo do que essa rota costuma dar`, base: 'teto', teto };
    if (razao >= 0.75) return { veredito: 'limite', rotulo: 'Razoável', motivo: `${campanha.percentual}% contra um teto de ${teto}% nessa rota`, base: 'teto', teto };
    return { veredito: 'nao vale', rotulo: 'Dá para esperar', motivo: `essa rota já chegou a ${teto}%`, base: 'teto', teto };
  }

  return null;
}

/**
 * Assinatura de clube: calcula quanto sai o milheiro.
 * Prefere o número que a própria matéria publica; só então tenta deduzir
 * de mensalidade e pontos. Sem base para calcular, devolve null em vez de chutar.
 */
export function avaliarClube(item, custoJaCalculado, valorJusto, reguaTexto) {
  const texto = `${item.titulo} ${item.resumo}`;
  const norm = normalizar(texto);

  let milheiro = custoJaCalculado || null;
  let origem = milheiro ? 'publicado na matéria' : null;

  if (!milheiro) {
    const mMensal = norm.match(/(?:12x\s*de\s*)?r\$\s*([\d.]+,\d{2}|\d+)\s*(?:\/|por\s*)?m[eê]s/) ||
                    norm.match(/por\s*apenas\s*r\$\s*([\d.]+,\d{2}|\d+)/);
    // Os pontos vêm por mês ou no total do ano. A frase diz qual.
    const mMensais = norm.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(mil\s*)?pontos\s*(?:por\s*m[eê]s|\/m[eê]s|mensais|ao\s*m[eê]s)/);
    const mTotais = norm.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(mil\s*)?pontos/);
    const mPontos = mMensais || mTotais;
    if (mMensal && mPontos) {
      const mensal = Number(mMensal[1].replace(/\./g, '').replace(',', '.'));
      let pontos = Number(String(mPontos[1]).replace(/[.,]/g, ''));
      if (mPontos[2]) pontos *= 1000;
      const porMes = Boolean(mMensais);
      if (mensal > 0 && pontos > 0) {
        const bruto = porMes ? (mensal / pontos) * 1000 : ((mensal * 12) / pontos) * 1000;
        // Resultado absurdo quase sempre é erro de leitura: melhor não afirmar nada.
        if (bruto > 0 && bruto < 200) {
          milheiro = Number(bruto.toFixed(2));
          origem = porMes
            ? 'calculado da mensalidade e dos pontos mensais'
            : 'calculado da mensalidade e do total de pontos';
        }
      }
    }
  }
  if (!milheiro) return null;

  const justo = valorJusto || 19;
  const veredito = milheiro <= justo * 0.85 ? 'vale' : milheiro <= justo * 1.05 ? 'limite' : 'nao vale';
  const rotulo = veredito === 'vale' ? 'Bom preço' : veredito === 'limite' ? 'No limite' : 'Caro';
  const comoVeio = reguaTexto ? `, ${reguaTexto}` : '';
  const motivo = `milheiro a R$ ${milheiro.toFixed(2).replace('.', ',')} contra uma régua de R$ ${justo.toFixed(2).replace('.', ',')}${comoVeio}`;
  return { milheiro, origem, veredito, rotulo, motivo, base: 'clube' };
}

/**
 * Vale esperar? Compara o intervalo desde a última campanha forte da rota
 * com a cadência conhecida daquele destino.
 */
export function valeEsperar(campanha, historico, cadencia) {
  if (campanha.tipo !== 'transferencia_bonificada' || !campanha.percentual) return null;
  const dias = cadencia?.[campanha.destino];
  if (!dias) return null;

  const chaves = Object.keys(historico || {}).filter((k) => k.endsWith(`-> ${campanha.destino}`) || k === campanha.destino);
  let ultima = null;
  for (const k of chaves) {
    const h = historico[k];
    if (h?.ultimaEm && (!ultima || h.ultimaEm > ultima)) ultima = h.ultimaEm;
  }
  if (!ultima) return { cadencia: dias, texto: `campanhas desse destino costumam repetir a cada ${dias} dias` };

  const passados = Math.round((Date.now() - new Date(ultima)) / 864e5);
  if (passados <= 2) return { cadencia: dias, desde: passados, texto: `costuma repetir a cada ${dias} dias` };
  const falta = Math.max(0, dias - passados);
  return {
    cadencia: dias, desde: passados, falta,
    texto: falta > 14
      ? `a próxima costuma demorar mais ${falta} dias, então esperar tem custo`
      : `a próxima pode vir em cerca de ${falta} dias`
  };
}

/**
 * Combinação: comprar pontos com desconto e transferir com bônus na mesma rota.
 * É assim que saem os melhores custos, e nenhuma das duas promoções sozinha mostra isso.
 */
export function combinar(campanhas) {
  const compras = campanhas.filter((c) => c.tipo === 'compra_pontos' && c.percentual);
  const transfs = campanhas.filter((c) => c.tipo === 'transferencia_bonificada' && c.percentual);
  const saida = [];

  for (const t of transfs) {
    const origem = t.origens[0];
    if (!origem) continue;
    const compra = compras.find((c) => c.origens.includes(origem) || c.destino === origem);
    if (!compra) continue;
    const ate = new Date(t.ate) < new Date(compra.ate) ? t.ate : compra.ate;
    saida.push({
      id: `combo|${compra.id}|${t.id}`,
      origem,
      destino: t.destino,
      descontoCompra: compra.percentual,
      bonusTransferencia: t.percentual,
      ate,
      partes: [
        { papel: 'compra', titulo: compra.titulo, fontes: compra.fontes },
        { papel: 'transferência', titulo: t.titulo, fontes: t.fontes }
      ]
    });
  }
  return saida;
}

/**
 * Régua de valor justo, calculada em vez de arbitrada.
 *
 * Combina duas âncoras:
 *  1. o que o mercado paga pelo milheiro (teto: pagar mais que isso para
 *     adquirir não se justifica, já que dá para vender por esse preço);
 *  2. a mediana dos preços de aquisição que o próprio radar já observou,
 *     que é o que você consegue de fato, e não o que alguém arbitrou.
 *
 * Com poucas observações, assume o teto de mercado com desconto e diz que
 * a base é fraca, em vez de fingir precisão.
 */
export function valorJustoAuto(observacoes, referenciaPrograma, manual, dias = 90) {
  if (manual) {
    return { valor: manual, base: 'manual', amostras: null, texto: 'definido por você' };
  }

  const corte = Date.now() - dias * 864e5;
  const vals = (observacoes || [])
    .filter((o) => new Date(o.em).getTime() > corte && o.valor > 0)
    .map((o) => o.valor)
    .sort((a, b) => a - b);

  const teto = referenciaPrograma?.mediana || null;

  if (vals.length >= 5) {
    const meio = Math.floor(vals.length / 2);
    const mediana = vals.length % 2 ? vals[meio] : (vals[meio - 1] + vals[meio]) / 2;
    const valor = teto ? Math.min(mediana, teto) : mediana;
    return {
      valor: Number(valor.toFixed(2)),
      base: 'observado',
      amostras: vals.length,
      menor: vals[0],
      maior: vals[vals.length - 1],
      texto: `mediana de ${vals.length} preços vistos em ${dias} dias`
    };
  }

  if (teto) {
    return {
      valor: Number((teto * 0.9).toFixed(2)),
      base: 'mercado',
      amostras: vals.length,
      texto: `base fraca, ${vals.length} preço(s) visto(s); por ora uso o que o mercado paga menos 10%`
    };
  }

  return { valor: 19, base: 'padrao', amostras: vals.length, texto: 'sem base ainda, usando um valor de partida' };
}


/**
 * Teto: quanto custa comprar mil milhas prontas daquele programa.
 *
 * É a alternativa concreta a gerar milhas por transferência. Se gerar sai mais
 * caro que comprar, não compensa gerar, por melhor que o bônus pareça.
 * Formado pelas promoções de compra de pontos que o radar leu, não por arbítrio.
 */
export function tetoCompra(observacoes, programa, dias = 90) {
  const corte = Date.now() - dias * 864e5;
  const vals = (observacoes || [])
    .filter((o) => o.tipo === 'compra_pontos' && o.destino === programa)
    .filter((o) => new Date(o.em).getTime() > corte && o.valor > 0)
    .map((o) => o.valor)
    .sort((a, b) => a - b);

  if (!vals.length) return null;
  const meio = Math.floor(vals.length / 2);
  const mediana = vals.length % 2 ? vals[meio] : (vals[meio - 1] + vals[meio]) / 2;
  return {
    valor: Number(mediana.toFixed(2)),
    menor: vals[0],
    amostras: vals.length,
    texto: vals.length === 1
      ? `uma compra de pontos vista a R$ ${vals[0].toFixed(2).replace('.', ',')} o milheiro`
      : `mediana de ${vals.length} promoções de compra vistas em ${dias} dias`
  };
}
