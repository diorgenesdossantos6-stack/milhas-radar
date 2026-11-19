import { trechoDoEndereco, trechoDoLinkDaCompanhia, nomeAeroporto, valeBuscarPagina } from '../src/voos.mjs';
import assert from 'node:assert/strict';

// Endereço com par origem/destino
const a = trechoDoEndereco('https://passageirodeprimeira.com/trecho-belo-horizonte-para-maceio-a-partir-16-mil-pontos-azul-ou-205-taxas/');
assert.equal(a.origem, 'Belo Horizonte');
assert.equal(a.destino, 'Maceio');

const b = trechoDoEndereco('https://passageirodeprimeira.com/voe-campinas-para-lisboa-a-partir-r-991-ou-77-mil-pontos-azul-taxas/');
assert.equal(b.origem, 'Campinas');
assert.equal(b.destino, 'Lisboa');

// Só destino
const c = trechoDoEndereco('https://passageirodeprimeira.com/voos-com-destino-ao-nordeste-a-partir-de-r-95-ou-3-mil-milhas-latam-taxas/');
assert.equal(c.destino, 'Nordeste');
assert.equal(c.origem, null);

const d = trechoDoEndereco('https://pontospravoar.com/alerta-ppv-passagens-uruguai-13-mil-pontos-azul-fidelidade/');
assert.equal(d.destino, 'Uruguai');

// Genérico demais não vira destino
assert.equal(trechoDoEndereco('https://www.melhoresdestinos.com.br/promocao/passagens-aereas-nacionais-18-11-26'), null);

// Link da companhia
const html = 'bla <a href="https://www.latamairlines.com/br/pt/oferta-voos?origin=FOR&amp;destination=JDO&amp;adt=1&amp;trip=OW&amp;cabin=Economy&amp;redemption=false&amp;outbound=2027-02-16T00%3A00%3A00.000Z&amp;sort=PRICE">ver</a>';
const e = trechoDoLinkDaCompanhia(html);
assert.equal(e.iataOrigem, 'FOR');
assert.equal(e.origem, 'Fortaleza');
assert.equal(e.destino, 'Juazeiro do Norte');
assert.equal(e.data, '2027-02-16');
assert.equal(e.idaEVolta, false);
assert.equal(e.comMilhas, false);

assert.equal(trechoDoLinkDaCompanhia('<a href="https://exemplo.com">x</a>'), null);
assert.equal(nomeAeroporto('ZZZ'), 'ZZZ', 'codigo desconhecido fica como esta');

// Só busca pagina onde vale
assert.equal(valeBuscarPagina('https://pontospravoar.com/x/'), true);
assert.equal(valeBuscarPagina('https://www.melhoresdestinos.com.br/x'), false);

console.log('voos: todos os testes passaram');

// Palavras de chamada no endereço não podem virar parte do trecho.
const casos = [
  ['https://passageirodeprimeira.com/barato-voe-para-buenos-aires-a-partir-de-r-235-ou-18-mil-pontos-azul-taxas/', null, 'Buenos Aires'],
  ['https://www.melhoresdestinos.com.br/promocao/passagens-aereas-asia-18-11-26', null, 'Asia'],
  ['https://www.melhoresdestinos.com.br/promocao/passagens-aereas-espanha-madri-barcelona-18-11-26', null, 'Espanha Madri Barcelona'],
  ['https://pontospravoar.com/alerta-ppv-viaje-estados-unidos-passagens-65-mil-milhas-smiles/', null, 'Estados Unidos']
];
for (const [url, origemEsperada, destinoEsperado] of casos) {
  const r = trechoDoEndereco(url);
  assert.ok(r, `deveria extrair algo de ${url}`);
  assert.equal(r.origem, origemEsperada, `origem errada em ${url}`);
  assert.equal(r.destino, destinoEsperado, `destino errado em ${url}`);
}

console.log('limpeza de recheio: todos os testes passaram');
