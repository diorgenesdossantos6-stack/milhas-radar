// Decide quais passagens merecem alerta. Duas trilhas: rotas que o Diorgenes
// escolheu, e promocao excepcional para qualquer lugar.
import { normalizar } from './parser.mjs';

// Regiao do destino. O que nao estiver aqui cai em 'resto', que tem o teto
// mais alto, entao um destino desconhecido erra para o lado de alertar menos.
const REGIOES = {
  brasil: ['brasil', 'nordeste', 'sudeste', 'sul', 'norte', 'centro oeste', 'nacionais',
    'sao paulo', 'rio de janeiro', 'salvador', 'recife', 'fortaleza', 'maceio', 'natal',
    'joao pessoa', 'aracaju', 'belem', 'manaus', 'porto seguro', 'ilheus', 'maragogi',
    'belo horizonte', 'brasilia', 'goiania', 'curitiba', 'florianopolis', 'porto alegre',
    'foz do iguacu', 'campo grande', 'cuiaba', 'vitoria', 'juazeiro do norte', 'sao luis',
    'teresina', 'palmas', 'rio branco', 'boa vista', 'macapa', 'porto velho', 'navegantes',
    'jericoacoara', 'fernando de noronha', 'chapada'],
  america_sul: ['argentina', 'buenos aires', 'bariloche', 'mendoza', 'cordoba', 'ushuaia',
    'chile', 'santiago', 'uruguai', 'montevideu', 'punta del este', 'paraguai', 'assuncao',
    'bolivia', 'peru', 'lima', 'cusco', 'colombia', 'bogota', 'cartagena', 'medellin',
    'equador', 'quito', 'venezuela', 'guiana', 'america do sul'],
  america_norte: ['estados unidos', 'eua', 'miami', 'orlando', 'nova york', 'new york',
    'los angeles', 'las vegas', 'chicago', 'boston', 'washington', 'san francisco',
    'dallas', 'houston', 'atlanta', 'canada', 'toronto', 'vancouver', 'montreal',
    'mexico', 'cancun', 'cidade do mexico', 'america do norte'],
  europa: ['europa', 'portugal', 'lisboa', 'porto', 'espanha', 'madri', 'madrid',
    'barcelona', 'franca', 'paris', 'italia', 'roma', 'milao', 'veneza', 'alemanha',
    'frankfurt', 'munique', 'berlim', 'inglaterra', 'londres', 'reino unido', 'holanda',
    'amsterda', 'belgica', 'bruxelas', 'suica', 'zurique', 'austria', 'viena', 'grecia',
    'atenas', 'irlanda', 'dublin', 'noruega', 'suecia', 'dinamarca', 'copenhague']
};

export function regiaoDe(destino) {
  if (!destino) return 'resto';
  const d = normalizar(destino);
  for (const [regiao, lugares] of Object.entries(REGIOES)) {
    if (lugares.some((l) => d === l || d.includes(l))) return regiao;
  }
  return 'resto';
}

// Quanto a passagem custa de verdade, em reais. Promocao em milhas e convertida
// pela cotacao do proprio programa, nunca pela de outro.
export function custoEmReais(p, tetosCompra = {}, referencia = {}) {
  const opcoes = [];
  if (p.dinheiro > 0) opcoes.push({ reais: p.dinheiro, como: 'dinheiro' });
  if (p.milhas > 0 && p.programa) {
    const porMil = tetosCompra?.[p.programa]?.valor || referencia?.programas?.[p.programa]?.mediana;
    if (porMil > 0) {
      opcoes.push({
        reais: Number(((p.milhas / 1000) * porMil).toFixed(2)),
        como: `${p.milhas.toLocaleString('pt-BR')} milhas ${p.programa}`,
        porMil
      });
    }
  }
  if (!opcoes.length) return null;
  // Ele pagaria do jeito mais barato, entao o julgamento usa o menor.
  return opcoes.sort((a, b) => a.reais - b.reais)[0];
}

export function origemAceita(p, origens) {
  if (!p.origem) return 'desconhecida';
  const o = normalizar(p.origem);
  return origens.some((x) => o === normalizar(x) || o.includes(normalizar(x))) ? 'sim' : 'nao';
}

function destinoEscolhido(p, destinos) {
  if (!p.destino || !destinos?.length) return false;
  const d = normalizar(p.destino);
  return destinos.some((x) => d === normalizar(x) || d.includes(normalizar(x)));
}

export function avaliarAlerta(p, cfg, tetosCompra, referencia) {
  if (!p || p.ehLista) return null;                       // lista de inspiracao nao e oferta
  if (origemAceita(p, cfg.origens) === 'nao') return null;

  const custo = custoEmReais(p, tetosCompra, referencia);
  if (!custo) return null;

  // Destino desconhecido nao pode herdar o teto mais alto: isso deixaria uma
  // promocao nacional passar pelo criterio de voo para a Asia. Usa o menor.
  const regiao = p.destino ? regiaoDe(p.destino) : 'indefinida';
  const tetoBase = regiao === 'indefinida'
    ? Math.min(...Object.values(cfg.tetos || {}))
    : cfg.tetos?.[regiao];
  if (!tetoBase || !isFinite(tetoBase)) return null;
  const teto = p.idaEVolta ? tetoBase : Math.round(tetoBase * 0.6);

  if (destinoEscolhido(p, cfg.destinos)) {
    return { trilha: 'rota', regiao, teto, custo, motivo: `destino que você acompanha` };
  }
  // Achado: tao abaixo do teto que vale avisar mesmo sendo so ida. A isca de
  // "a partir de" existe, mas num preco desses o risco de ignorar e maior que
  // o de olhar. Continua valendo a origem e o filtro de lista de inspiracao.
  const corteAchado = Number((tetoBase * (1 - (cfg.achadoAbaixoDe ?? 0.70))).toFixed(2));
  if (custo.reais <= corteAchado) {
    return {
      trilha: 'achado',
      regiao,
      teto: corteAchado,
      custo,
      motivo: `${custo.como} fica em R$ ${custo.reais.toLocaleString('pt-BR')}, bem abaixo do teto de R$ ${tetoBase.toLocaleString('pt-BR')} para ${regiao.replace(/_/g, ' ')}`
    };
  }

  // Trecho so de ida com "a partir de" quase sempre e isca para uma rota
  // obscura. Fora da lista de destinos, so ida e volta vira alerta.
  if (cfg.somenteIdaEVolta !== false && !p.idaEVolta) return null;
  if (custo.reais <= teto) {
    return {
      trilha: 'excepcional',
      regiao,
      teto,
      custo,
      motivo: `${custo.como} fica em R$ ${custo.reais.toLocaleString('pt-BR')}, abaixo do seu teto de R$ ${teto.toLocaleString('pt-BR')}`
    };
  }
  return null;
}
