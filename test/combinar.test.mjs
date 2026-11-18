// Teste da combinação e do avaliador de clube com dados controlados.
import { combinar, avaliarClube } from '../src/parser.mjs';
import assert from 'node:assert/strict';

const campanhas = [
  { id: 'a', tipo: 'compra_pontos', percentual: 50, origens: ['Livelo'], destino: 'Livelo',
    ate: '2026-11-25T23:59:00Z', titulo: 'Livelo com 50% off na compra de pontos', fontes: [] },
  { id: 'b', tipo: 'transferencia_bonificada', percentual: 100, origens: ['Livelo'], destino: 'Smiles',
    ate: '2026-11-20T23:59:00Z', titulo: 'Smiles 100% de bonus', fontes: [] },
  { id: 'c', tipo: 'transferencia_bonificada', percentual: 25, origens: ['C6 Bank'], destino: 'Latam Pass',
    ate: '2026-11-22T23:59:00Z', titulo: 'Latam 25%', fontes: [] }
];

const combos = combinar(campanhas);
assert.equal(combos.length, 1, 'deve achar exatamente uma combinacao');
assert.equal(combos[0].origem, 'Livelo');
assert.equal(combos[0].destino, 'Smiles');
assert.equal(combos[0].descontoCompra, 50);
assert.equal(combos[0].bonusTransferencia, 100);
assert.equal(combos[0].ate, '2026-11-20T23:59:00Z', 'prazo deve ser o que vence primeiro');

// Clube com pontos mensais
const mensal = avaliarClube(
  { titulo: 'Assine o Clube Livelo Mini por apenas R$ 24,90 por mes', resumo: 'Sao 500 pontos por mes' },
  null, 19);
assert.ok(mensal, 'deve calcular');
assert.equal(mensal.milheiro, 49.8, 'R$24,90 / 500 pontos = R$49,80 o milheiro');
assert.equal(mensal.veredito, 'nao vale');

// Clube com milheiro ja publicado
const pub = avaliarClube({ titulo: 'Clube Livelo: milheiro a partir de R$ 15,00', resumo: '' }, 15, 19);
assert.equal(pub.milheiro, 15);
assert.equal(pub.veredito, 'vale');

console.log('todos os testes passaram');
