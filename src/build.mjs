// Gera o site: copia os dados para site/ e monta um index standalone em build/.
import fs from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const p = (...x) => path.join(RAIZ, ...x);

const dados = JSON.parse(await fs.readFile(p('data', 'promocoes.json'), 'utf8'));
let ref = { programas: {} };
try { ref = JSON.parse(await fs.readFile(p('data', 'referencia.json'), 'utf8')); } catch {}

// Versao do site que le os JSON por fetch (vai para a Netlify).
const enxuto = {
  atualizadoEm: dados.atualizadoEm,
  campanhasAtivas: dados.campanhasAtivas,
  historico: dados.historico
};
await fs.writeFile(p('site', 'promocoes.json'), JSON.stringify(enxuto, null, 2) + '\n');
await fs.writeFile(p('site', 'referencia.json'), JSON.stringify(ref, null, 2) + '\n');

// Versao de arquivo unico, util para mandar por mensagem ou abrir offline.
await fs.mkdir(p('build'), { recursive: true });
const html = await fs.readFile(p('site', 'index.html'), 'utf8');
const js = await fs.readFile(p('site', 'painel.js'), 'utf8');
const embutido =
  `<script>window.DADOS_EMBUTIDOS=${JSON.stringify(enxuto)};window.REF_EMBUTIDA=${JSON.stringify(ref)};</script>`;
await fs.writeFile(
  p('build', 'index.html'),
  html.replace('<script src="./painel.js"></script>', `${embutido}\n<script>${js}</script>`)
);

console.log(`Site gerado: ${enxuto.campanhasAtivas.length} campanhas ativas.`);
