import assert from 'node:assert/strict';
import { intervalos, mediana, preverJanela, media } from '../src/janela.mjs';

// intervalos em dias, ignorando repetidas no mesmo dia
assert.deepEqual(intervalos(['2026-01-01', '2026-01-31', '2026-03-01']), [30, 29]);
assert.deepEqual(intervalos(['2026-01-01', '2026-01-01']), []);
assert.deepEqual(intervalos([]), []);
assert.deepEqual(intervalos(['2026-01-01T10:00:00Z', '2026-01-11T23:00:00Z']), [10]);

assert.equal(mediana([10, 20, 30]), 20);
assert.equal(mediana([10, 20, 30, 40]), 25);
assert.equal(mediana([]), null);

// amostra pequena nao vira previsao
const pouca = preverJanela(['2026-11-01', '2026-11-20']);
assert.equal(pouca.pronta, false);
assert.equal(pouca.campanhas, 2);
assert.equal(pouca.ultima, '2026-11-20');

// com quatro campanhas, tres intervalos, sai a janela
const p = preverJanela(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
assert.equal(p.pronta, true);
assert.equal(p.campanhas, 4);
assert.equal(p.medianaDias, 31);
assert.equal(p.maiorDias, 31);
assert.equal(p.ultima, '2026-09-01');
assert.equal(p.de, '2026-10-02');
assert.equal(p.ate, '2026-10-02');

// intervalo irregular: a janela abre na mediana e fecha no maior
const q = preverJanela(['2026-01-01', '2026-02-01', '2026-02-21', '2026-05-01']);
assert.equal(q.medianaDias, 31);   // intervalos 31, 20 e 69
assert.equal(q.maiorDias, 69);
assert.ok(q.de < q.ate);

// media de percentuais ignora zero e nulo
assert.equal(media([80, 100, 60]), 80);
assert.equal(media([80, null, 0]), 80);
assert.equal(media([]), null);

console.log('janela: ok');
