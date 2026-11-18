// Teste do teto de compra: a régua que diz se compensa gerar em vez de comprar.
import { tetoCompra, avaliar } from '../src/parser.mjs';
import assert from 'node:assert/strict';

const hoje = new Date().toISOString();
const velho = '2020-01-01T00:00:00Z';

const obs = [
  { em: hoje, tipo: 'compra_pontos', destino: 'Smiles', valor: 22.0 },
  { em: hoje, tipo: 'compra_pontos', destino: 'Smiles', valor: 18.0 },
  { em: hoje, tipo: 'compra_pontos', destino: 'Smiles', valor: 20.0 },
  { em: hoje, tipo: 'compra_pontos', destino: 'Latam Pass', valor: 30.0 },
  { em: hoje, tipo: 'clube', destino: 'Smiles', valor: 5.0 },        // tipo errado, ignora
  { em: velho, tipo: 'compra_pontos', destino: 'Smiles', valor: 2.0 } // velho, ignora
];

const t = tetoCompra(obs, 'Smiles');
assert.equal(t.valor, 20, 'mediana de 18, 20 e 22');
assert.equal(t.amostras, 3, 'so conta compra_pontos recente do programa');
assert.equal(t.menor, 18);
assert.equal(tetoCompra(obs, 'Azul Fidelidade'), null, 'sem dado, sem teto');

const tetos = { Smiles: t };

// Gerar bem mais barato que comprar: vale
const bom = avaliar({ destino: 'Smiles', custoMilheiro: 14, tipo: 'transferencia_bonificada', percentual: 100, origens: ['Livelo'] },
  { Smiles: { mediana: 17.54 } }, {}, {}, tetos);
assert.equal(bom.veredito, 'vale');
assert.match(bom.motivo, /comprar pronto/);

// Diferenca pequena: limite
const meio = avaliar({ destino: 'Smiles', custoMilheiro: 19, tipo: 'transferencia_bonificada', percentual: 50, origens: ['Livelo'] },
  { Smiles: { mediana: 17.54 } }, {}, {}, tetos);
assert.equal(meio.veredito, 'limite');

// Mais caro que comprar pronto: nao vale, mesmo com bonus alto
const ruim = avaliar({ destino: 'Smiles', custoMilheiro: 24, tipo: 'transferencia_bonificada', percentual: 100, origens: ['Livelo'] },
  { Smiles: { mediana: 17.54 } }, {}, {}, tetos);
assert.equal(ruim.veredito, 'nao vale');
assert.match(ruim.motivo, /mais caro que comprar pronto/);

// Sem teto: recua para a cotacao de referencia
const semTeto = avaliar({ destino: 'Azul Fidelidade', custoMilheiro: 10, tipo: 'transferencia_bonificada', percentual: 90, origens: ['Livelo'] },
  { 'Azul Fidelidade': { mediana: 14.95 } }, {}, {}, tetos);
assert.equal(semTeto.base, 'cotacao');
assert.equal(semTeto.veredito, 'vale');

console.log('teto de compra: todos os testes passaram');
