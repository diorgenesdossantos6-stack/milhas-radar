import assert from 'node:assert/strict';
import { regiaoDe, custoEmReais, avaliarAlerta, origemAceita } from '../src/alertas.mjs';

const cfg = {
  origens: ['Goiânia', 'Brasília', 'São Paulo', 'Campinas', 'Belo Horizonte'],
  destinos: ['Lisboa'],
  tetos: { brasil: 450, america_sul: 1300, america_norte: 2800, europa: 2800, resto: 3500 },
  achadoAbaixoDe: 0.70
};
const tetosCompra = { 'Azul Fidelidade': { valor: 14.95 }, Smiles: { valor: 19 } };
const referencia = { programas: { 'Latam Pass': { mediana: 22 } } };

// regiao
assert.equal(regiaoDe('Lisboa'), 'europa');
assert.equal(regiaoDe('Maceió'), 'brasil');
assert.equal(regiaoDe('Buenos Aires'), 'america_sul');
assert.equal(regiaoDe('Miami'), 'america_norte');
assert.equal(regiaoDe('Seul'), 'resto');
assert.equal(regiaoDe(null), 'resto');

// milhas convertidas pelo programa certo, nunca pelo de outro
const emMilhas = { milhas: 77000, programa: 'Azul Fidelidade', dinheiro: null };
assert.equal(custoEmReais(emMilhas, tetosCompra, referencia).reais, 1151.15);

// com as duas formas, vale a mais barata
const duas = { dinheiro: 991, milhas: 77000, programa: 'Azul Fidelidade' };
assert.equal(custoEmReais(duas, tetosCompra, referencia).como, 'dinheiro');

// origem fora da lista derruba o alerta
assert.equal(origemAceita({ origem: 'Recife' }, cfg.origens), 'nao');
assert.equal(origemAceita({ origem: null }, cfg.origens), 'desconhecida');
assert.equal(avaliarAlerta(
  { origem: 'Recife', destino: 'Lisboa', dinheiro: 900, idaEVolta: true }, cfg, tetosCompra, referencia
), null);

// o card real: Campinas para Lisboa, R$ 991, destino acompanhado
const campinasLisboa = {
  origem: 'Campinas', destino: 'Lisboa', dinheiro: 991, milhas: 77000,
  programa: 'Azul Fidelidade', idaEVolta: true, link: 'x'
};
const r1 = avaliarAlerta(campinasLisboa, cfg, tetosCompra, referencia);
assert.equal(r1.trilha, 'rota');

// mesmo voo, sem estar na lista de destinos: ainda passa pelo teto da Europa
const r2 = avaliarAlerta(campinasLisboa, { ...cfg, destinos: [] }, tetosCompra, referencia);
assert.equal(r2.trilha, 'excepcional');
assert.equal(r2.teto, 2800);

// fora da lista de destinos, trecho so de ida nao alerta
const soIda = { origem: 'Goiânia', destino: 'Maceió', dinheiro: 240, idaEVolta: false };
assert.equal(avaliarAlerta(soIda, { ...cfg, destinos: [] }, tetosCompra, referencia), null);

// com a trava desligada, so ida vale 60% do teto
const frouxo = { ...cfg, destinos: [], somenteIdaEVolta: false };
assert.equal(avaliarAlerta({ ...soIda, dinheiro: 400 }, frouxo, tetosCompra, referencia), null);
assert.equal(avaliarAlerta(soIda, frouxo, tetosCompra, referencia).teto, Math.round(cfg.tetos.brasil * 0.6));

// so ida para destino acompanhado continua alertando
assert.equal(avaliarAlerta(
  { origem: 'Goiânia', destino: 'Lisboa', dinheiro: 1500, idaEVolta: false }, cfg, tetosCompra, referencia
).trilha, 'rota');

// lista de inspiracao nunca alerta
assert.equal(avaliarAlerta(
  { destino: 'Lisboa', dinheiro: 100, idaEVolta: true, ehLista: true }, cfg, tetosCompra, referencia
), null);

// sem preco nenhum, nao da para julgar
assert.equal(avaliarAlerta({ destino: 'Lisboa', idaEVolta: true }, cfg, tetosCompra, referencia), null);

console.log('alertas: ok');

// destino desconhecido usa o teto mais rigido, nunca o mais alto
const menorTeto = Math.min(...Object.values(cfg.tetos));
const semDestino = { origem: 'São Paulo', destino: null, dinheiro: menorTeto + 50, idaEVolta: true };
assert.equal(avaliarAlerta(semDestino, { ...cfg, destinos: [] }, tetosCompra, referencia), null);
const semDestinoBarato = { ...semDestino, dinheiro: menorTeto - 50 };
const rSem = avaliarAlerta(semDestinoBarato, { ...cfg, destinos: [] }, tetosCompra, referencia);
assert.equal(rSem.teto, menorTeto);
assert.equal(rSem.regiao, 'indefinida');
console.log('alertas: destino indefinido ok');

// achado: tarifa muito abaixo do teto alerta mesmo sendo so ida
const cfgA = { ...cfg, destinos: [], achadoAbaixoDe: 0.70 };
const corteBrasil = cfg.tetos.brasil * 0.30;           // 70% abaixo

const achado = { origem: 'Goiânia', destino: 'Maceió', dinheiro: Math.round(corteBrasil) - 5, idaEVolta: false };
assert.equal(avaliarAlerta(achado, cfgA, tetosCompra, referencia).trilha, 'achado');

// so ida acima do corte continua barrado
const idaComum = { ...achado, dinheiro: Math.round(cfg.tetos.brasil * 0.5) };
assert.equal(avaliarAlerta(idaComum, cfgA, tetosCompra, referencia), null);

// ida e volta no mesmo preco passa como excepcional
assert.equal(avaliarAlerta({ ...idaComum, idaEVolta: true }, cfgA, tetosCompra, referencia).trilha, 'excepcional');

// origem errada nao vira achado por ser barata
assert.equal(avaliarAlerta(
  { origem: 'Recife', destino: 'Maceió', dinheiro: 40, idaEVolta: false }, cfgA, tetosCompra, referencia
), null);

// lista de inspiracao nunca vira achado
assert.equal(avaliarAlerta(
  { origem: 'Goiânia', destino: 'Maceió', dinheiro: 40, idaEVolta: false, ehLista: true }, cfgA, tetosCompra, referencia
), null);
console.log('alertas: achado ok');
