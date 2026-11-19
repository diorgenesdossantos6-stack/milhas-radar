// Extração de trecho e datas das oportunidades de voo.
//
// Três sinais, do mais barato ao mais caro:
//  1. o endereço da matéria, que vem sem acento e sem emoji, e por isso costuma
//     ser mais limpo que o título;
//  2. o próprio título, como já era feito;
//  3. o link da companhia dentro da matéria, que dá código IATA e data exata,
//     mas exige buscar a página e só existe em parte das fontes.

const AEROPORTOS = {
  GRU: 'São Paulo', CGH: 'São Paulo', VCP: 'Campinas', GIG: 'Rio de Janeiro',
  SDU: 'Rio de Janeiro', BSB: 'Brasília', CNF: 'Belo Horizonte', PLU: 'Belo Horizonte',
  SSA: 'Salvador', REC: 'Recife', FOR: 'Fortaleza', POA: 'Porto Alegre',
  CWB: 'Curitiba', FLN: 'Florianópolis', MCZ: 'Maceió', NAT: 'Natal',
  JPA: 'João Pessoa', AJU: 'Aracaju', THE: 'Teresina', SLZ: 'São Luís',
  BEL: 'Belém', MAO: 'Manaus', CGB: 'Cuiabá', CGR: 'Campo Grande',
  GYN: 'Goiânia', VIX: 'Vitória', IGU: 'Foz do Iguaçu', JDO: 'Juazeiro do Norte',
  PMW: 'Palmas', RBR: 'Rio Branco', PVH: 'Porto Velho', BVB: 'Boa Vista',
  MCP: 'Macapá', LIS: 'Lisboa', OPO: 'Porto', MAD: 'Madri', BCN: 'Barcelona',
  CDG: 'Paris', LHR: 'Londres', FCO: 'Roma', MIA: 'Miami', JFK: 'Nova York',
  EZE: 'Buenos Aires', AEP: 'Buenos Aires', SCL: 'Santiago', MVD: 'Montevidéu',
  BOG: 'Bogotá', LIM: 'Lima', PTY: 'Cidade do Panamá', MEX: 'Cidade do México'
};

export function nomeAeroporto(iata) {
  return AEROPORTOS[iata] || iata;
}

// Palavras de chamada que aparecem no endereço mas não fazem parte do trecho.
const RECHEIO = new Set([
  'barato', 'baratas', 'barata', 'muito', 'imperdivel', 'imperdiveis', 'urgente',
  'alerta', 'ppv', 'oferta', 'ofertas', 'promocao', 'promocoes', 'voe', 'voar',
  'voo', 'voos', 'viaje', 'viagem', 'passagem', 'passagens', 'aerea', 'aereas',
  'trecho', 'nacionais', 'nacional', 'internacionais', 'internacional', 'com', 'destino'
]);

/** Remove as palavras de chamada das duas pontas, preservando o nome do lugar. */
function limparPontas(slug) {
  let partes = slug.split('-').filter(Boolean);
  while (partes.length && RECHEIO.has(partes[0])) partes.shift();
  while (partes.length && RECHEIO.has(partes[partes.length - 1])) partes.pop();
  return partes.join('-');
}

function titulizar(texto) {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return texto.split('-').filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/**
 * Lê o trecho a partir do endereço da matéria.
 * O slug não tem acento nem emoji, então quebra menos que o título.
 */
export function trechoDoEndereco(link) {
  let slug;
  try {
    slug = new URL(link).pathname.replace(/\/+$/, '').split('/').pop() || '';
  } catch { return null; }
  if (!slug) return null;

  // Corta onde começa o preço: "a-partir", "por-r", ou o primeiro número.
  // Cortar em "-com-" era errado, porque parte "voos-com-destino-ao-X" ao meio.
  const corte = slug.search(/-(?:a-partir|apartir|por-r|\d)/);
  const inicio = corte > 0 ? slug.slice(0, corte) : slug;

  // "trecho-belo-horizonte-para-maceio", "voe-campinas-para-lisboa"
  const mPar = inicio.match(/^(?:trecho-|voe-|voos?-|passagens?-|alerta-ppv-)?(.+?)-para-(.+)$/);
  if (mPar) {
    const origem = titulizar(limparPontas(mPar[1].replace(/^(de|do|da)-/, '')));
    const destino = titulizar(limparPontas(mPar[2].replace(/^(o|a|os|as)-/, '')));
    if (origem.length > 2 && destino.length > 2) return { origem, destino, fonte: 'endereco' };
    if (destino.length > 2) return { origem: null, destino, fonte: 'endereco' };
  }

  // "voos-com-destino-ao-nordeste", "passagens-uruguai", "viaje-estados-unidos"
  const mDest = inicio.match(/(?:destino-(?:ao|a|aos|as|para)|passagens?|viaje|voos?-para)-(.+)$/);
  if (mDest) {
    const destino = titulizar(limparPontas(mDest[1].replace(/^(o|a|os|as|ao)-/, '')));
    // "Passagens aéreas nacionais" não nomeia destino nenhum.
    const temNomeProprio = destino.split(' ').some((w) => !RECHEIO.has(w.toLowerCase()));
    if (destino.length > 2 && temNomeProprio) {
      return { origem: null, destino, fonte: 'endereco' };
    }
  }
  return null;
}

/**
 * Lê o link da companhia dentro da matéria: código IATA, data e se é resgate.
 * Hoje só o Pontos pra Voar publica esse link.
 */
export function trechoDoLinkDaCompanhia(html) {
  const m = html.match(/https:\/\/www\.latamairlines\.com\/[^"'\s]*oferta-voos\?[^"'\s]+/);
  if (!m) return null;
  let params;
  try { params = new URL(m[0].replace(/&amp;/g, '&')).searchParams; }
  catch { return null; }

  const origem = params.get('origin');
  const destino = params.get('destination');
  if (!origem || !destino || origem.length !== 3) return null;

  const saida = params.get('outbound');
  return {
    origem: nomeAeroporto(origem),
    destino: nomeAeroporto(destino),
    iataOrigem: origem,
    iataDestino: destino,
    data: saida && saida !== 'null' ? saida.slice(0, 10) : null,
    idaEVolta: params.get('trip') === 'RT',
    comMilhas: params.get('redemption') === 'true',
    cabine: params.get('cabin') || null,
    fonte: 'companhia'
  };
}

/** Fontes cuja matéria vale a pena buscar, por publicarem o link da companhia. */
export const FONTES_COM_LINK = ['pontospravoar.com'];

export function valeBuscarPagina(link) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    return FONTES_COM_LINK.some((f) => host === f || host.endsWith(`.${f}`));
  } catch { return false; }
}
