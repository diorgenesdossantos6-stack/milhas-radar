// A aba de voos só pode receber matéria de voo, e com preço de verdade.
import { classificar, extrairPassagem } from '../src/parser.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../src/fontes.json', import.meta.url), 'utf8'));

const tipoDe = (titulo, resumo = '') =>
  (classificar({ titulo, resumo, categorias: [] }, cfg) || {}).id || null;

// Entram
assert.equal(tipoDe('Trecho de Belo Horizonte para Maceió a partir de 16 mil pontos Azul ou R$ 205 + taxas'), 'passagem');
assert.equal(tipoDe('LATAM tem passagens nacionais a partir de R$ 104 o trecho'), 'passagem');
assert.equal(tipoDe('Muito barato! Voe de Campinas para Lisboa a partir de R$ 991'), 'passagem');
assert.equal(tipoDe('Alerta PPV! Passagens para o Uruguai a partir de 13 mil milhas'), 'passagem');

// Não entram: falam de preço, mas não de voo
assert.notEqual(tipoDe('Ofertas em alta na Amazon hoje! Air Fryer Philco a partir de R$ 13,18'), 'passagem');
assert.notEqual(tipoDe('Hotéis com piscina em São Paulo a partir de R$ 268'), 'passagem');
assert.equal(
  tipoDe('Gere o milheiro Smiles a partir de R$ 15,80 transferindo pontos Livelo',
         'Promoção com bônus na transferência de pontos'),
  'transferencia_bonificada', 'materia de milheiro nao e passagem');
assert.equal(tipoDe('Smiles oferece até 80% de bônus nas transferências'), 'transferencia_bonificada');

// Extração do caso com os dois preços
const p = extrairPassagem(
  { titulo: 'Trecho de Belo Horizonte para Maceió a partir de 16 mil pontos Azul ou R$ 205 + taxas', resumo: '' }, cfg);
assert.equal(p.dinheiro, 205);
assert.equal(p.milhas, 16000);
assert.equal(p.programa, 'Azul Fidelidade');
assert.equal(p.origem, 'Belo Horizonte');
assert.equal(p.destino, 'Maceió');
assert.equal(p.taxas, true);

// Valor fora de escala é descartado em vez de virar tarifa.
// Sem dinheiro e sem milhas sobrando, a extração devolve null.
assert.equal(extrairPassagem({ titulo: 'Voos com produtos a partir de R$ 13,18', resumo: '' }, cfg), null);

// Mas se houver milhas, a passagem vale, só que sem o preço em dinheiro.
const soMilhas = extrairPassagem(
  { titulo: 'Voos para o Uruguai a partir de 13 mil milhas ou R$ 12', resumo: '' }, cfg);
assert.equal(soMilhas.milhas, 13000);
assert.equal(soMilhas.dinheiro, null, 'R$ 12 nao e tarifa de voo');

console.log('passagens: todos os testes passaram');
