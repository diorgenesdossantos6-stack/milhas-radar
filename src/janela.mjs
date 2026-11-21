// Quando uma campanha costuma voltar. Trabalha so com o que o radar coletou:
// nada de numero herdado de outro site.

export function intervalos(datas) {
  const ds = [...new Set(datas.filter(Boolean).map((d) => String(d).slice(0, 10)))]
    .sort()
    .map((d) => new Date(d + 'T12:00:00Z').getTime());
  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(Math.round((ds[i] - ds[i - 1]) / 864e5));
  return gaps.filter((g) => g > 0);
}

export function mediana(ns) {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Estimativa da proxima janela. Exige amostra minima: com duas ou tres
 *  campanhas a mediana e chute com cara de numero, e numero com cara de
 *  certeza e pior que nao dizer nada. */
export function preverJanela(datas, minIntervalos = 3) {
  const gaps = intervalos(datas);
  const ultima = datas.filter(Boolean).map((d) => String(d).slice(0, 10)).sort().pop();
  if (gaps.length < minIntervalos) {
    return { pronta: false, campanhas: new Set(datas.filter(Boolean).map((d) => String(d).slice(0,10))).size,
             faltam: minIntervalos - gaps.length + 1, ultima: ultima || null };
  }
  const med = mediana(gaps);
  const maior = Math.max(...gaps);
  const base = new Date(ultima + 'T12:00:00Z').getTime();
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  return {
    pronta: true,
    campanhas: gaps.length + 1,
    medianaDias: med,
    maiorDias: maior,
    ultima,
    de: fmt(base + med * 864e5),
    ate: fmt(base + maior * 864e5)
  };
}

export function media(ns) {
  const v = ns.filter((n) => typeof n === 'number' && n > 0);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
