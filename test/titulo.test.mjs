// O título da campanha agrupada tem que descrever a promoção.
import { agruparCampanhas } from '../src/parser.mjs';
import assert from 'node:assert/strict';

const comum = {
  tipo: 'transferencia_bonificada', tipoNome: 'Transferência bonificada',
  destino: ['Smiles'], origem: ['Livelo'], percentual: 80,
  ate: '2026-11-20T23:59:00Z', confiancaPrazo: 'alta', nota: 70,
  publicado: '2026-11-18T10:00:00Z', fonteNome: 'X', link: 'https://x.com/a', custoMilheiro: null
};

const grupos = agruparCampanhas([
  { ...comum, id: '1', titulo: '5 sugestões de voos em Classe Executiva a partir de 44 mil milhas', fonteNome: 'A', link: 'https://a.com/1' },
  { ...comum, id: '2', titulo: 'Smiles oferece até 80% de bônus nas transferências de pontos Livelo', fonteNome: 'B', link: 'https://b.com/2' }
]);

assert.equal(grupos.length, 1, 'mesma campanha, um grupo');
assert.match(grupos[0].titulo, /80% de bônus/, 'deve escolher o titulo que explica a oferta');
assert.doesNotMatch(grupos[0].titulo, /sugest/, 'nao pode escolher materia de inspiracao');

// Entre dois titulos validos, vence o que diz mais sobre a oferta
const g2 = agruparCampanhas([
  { ...comum, id: '3', titulo: 'Smiles tem novidade', fonteNome: 'A', link: 'https://a.com/3' },
  { ...comum, id: '4', titulo: 'Smiles oferece 80% de bônus nas transferências', fonteNome: 'B', link: 'https://b.com/4' }
]);
assert.match(g2[0].titulo, /80% de bônus nas transferências/);

console.log('titulo da campanha: todos os testes passaram');

// Matéria de inspiração de viagem não entra como promoção, mesmo citando bônus.
import { classificar } from '../src/parser.mjs';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../src/fontes.json', import.meta.url), 'utf8'));

const inspiracao = [
  '5 sugestões de voos em Classe Executiva a partir de 44 mil milhas Smiles',
  'Trecho de Belo Horizonte para Maceió a partir de 16 mil pontos Azul ou R$ 205 + taxas',
  'Passagens para Lisboa a partir de 60 mil milhas'
];
for (const titulo of inspiracao) {
  const r = classificar({ titulo, resumo: 'Aproveite o bônus de 100% na transferência de pontos', categorias: [] }, cfg);
  assert.equal(r, null, `nao pode classificar como promocao: ${titulo}`);
}

// Promoção de verdade continua passando.
const real = classificar(
  { titulo: 'Smiles oferece até 80% de bônus nas transferências', resumo: 'transferência de pontos', categorias: [] }, cfg);
assert.ok(real, 'promocao real tem que passar');
assert.equal(real.id, 'transferencia_bonificada');

console.log('filtro de inspiracao: todos os testes passaram');

// Sem programa nomeado, não é promoção de pontos.
import { programas } from '../src/parser.mjs';

const foraDoEscopo = [
  "Black Friday no Sam's Club! Assine o plano anual com 60% OFF e ganhe cupom de desconto",
  'Assine o streaming com 50% de desconto no primeiro ano'
];
for (const titulo of foraDoEscopo) {
  const pg = programas({ titulo, resumo: 'desconto na assinatura' }, cfg);
  assert.equal(pg.origem.length + pg.destino.length, 0, `nao deveria achar programa em: ${titulo}`);
}

// Promoção de clube de programa de verdade nomeia o programa.
const dentro = programas({ titulo: 'Livelo oferece 9 mil pontos na assinatura anual do Clube Mini', resumo: '' }, cfg);
assert.ok(dentro.origem.includes('Livelo'), 'deve reconhecer a Livelo');

console.log('escopo por programa: todos os testes passaram');
