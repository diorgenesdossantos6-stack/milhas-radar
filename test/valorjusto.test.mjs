import { valorJustoAuto } from '../src/parser.mjs';
import assert from 'node:assert/strict';

const hoje = new Date().toISOString();
const obs = [12.81, 13.07, 15.55, 15.79, 18.0, 19.5].map((v) => ({ em: hoje, valor: v }));

// Manual vence sempre
assert.equal(valorJustoAuto(obs, { mediana: 21 }, 17).valor, 17);

// Com amostras suficientes, usa a mediana
const r = valorJustoAuto(obs, { mediana: 21 }, null);
assert.equal(r.base, 'observado');
assert.equal(r.amostras, 6);
assert.equal(r.valor, 15.67, 'mediana de 15,55 e 15,79');

// O teto de mercado limita a mediana
const caro = [25, 26, 27, 28, 29].map((v) => ({ em: hoje, valor: v }));
assert.equal(valorJustoAuto(caro, { mediana: 21 }, null).valor, 21, 'nao pode passar do que o mercado paga');

// Poucas amostras: recua para o mercado
const pouco = valorJustoAuto(obs.slice(0, 2), { mediana: 21 }, null);
assert.equal(pouco.base, 'mercado');
assert.equal(pouco.valor, 18.9);

// Observacao velha nao conta
const velha = [{ em: '2020-01-01T00:00:00Z', valor: 5 }];
assert.equal(valorJustoAuto(velha, { mediana: 21 }, null).base, 'mercado');

// Sem nada
assert.equal(valorJustoAuto([], null, null).base, 'padrao');

console.log('valor justo: todos os testes passaram');
