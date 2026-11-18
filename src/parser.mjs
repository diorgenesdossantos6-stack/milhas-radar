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
      fonteNome: fonte.nome,
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
