const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n) => n.toLocaleString('pt-BR');

let DADOS = null, REF = { programas: {} };
const filtro = { programa: 'todos', tipo: 'todos' };

async function carregar() {
  if (window.DADOS_EMBUTIDOS) {
    DADOS = window.DADOS_EMBUTIDOS;
    REF = window.REF_EMBUTIDA || REF;
    return;
  }
  const [a, b] = await Promise.all([
    fetch('./promocoes.json').then((r) => r.json()),
    fetch('./referencia.json').then((r) => r.json()).catch(() => REF)
  ]);
  DADOS = a; REF = b;
}

/** Tempo restante em linguagem de decisão, não em data. */
function quando(ate) {
  const h = (new Date(ate) - new Date()) / 36e5;
  if (h < 0) return { txt: 'encerrada', perto: false, viva: false };
  if (h < 1) return { txt: 'acaba em minutos', perto: true, viva: true };
  if (h < 24) return { txt: `acaba em ${Math.round(h)}h`, perto: true, viva: true };
  if (h < 48) return { txt: 'acaba amanhã', perto: true, viva: true };
  const dias = Math.round(h / 24);
  const data = new Date(ate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return { txt: `${dias} dias, até ${data}`, perto: false, viva: true };
}

function rotaDe(c) {
  const origens = c.origens.filter((o) => o !== c.destino);
  return origens.length ? `${origens.join(' e ')} → ${c.destino}` : c.destino;
}

function vereditoDe(c) {
  if (!c.veredito) return null;
  const mapa = { 'vale': ['Vale a pena', 'v-vale'], 'limite': ['No limite', 'v-limite'], 'nao vale': ['Não vale', 'v-ruim'] };
  const [txt, cls] = mapa[c.veredito] || [];
  return txt ? { txt, cls } : null;
}

function ativas() {
  return (DADOS.campanhasAtivas || []).filter((c) => quando(c.ate).viva);
}

function renderMelhor(c) {
  const alvo = document.getElementById('melhor');
  if (!c) { alvo.hidden = true; return; }
  alvo.hidden = false;
  const q = quando(c.ate);
  const v = vereditoDe(c);
  const ref = c.referencia;

  const fatos = [];
  if (c.custoMilheiro) fatos.push(`<div><span>seu milheiro sai a</span><b>${brl(c.custoMilheiro)}</b></div>`);
  if (ref) fatos.push(`<div><span>o mercado paga</span><b>${brl(ref.min)} a ${brl(ref.max)}</b></div>`);
  fatos.push(`<div><span>prazo</span><b>${q.txt}</b></div>`);
  if (v) fatos.push(`<div><span>leitura</span><b class="${v.cls}">${v.txt}</b></div>`);

  alvo.innerHTML = `
    <p class="chamada">A oportunidade mais forte agora</p>
    <div class="linha1">
      <span class="figura">${c.percentual ? c.percentual + '%' : '—'}</span>
      <span class="rota">${rotaDe(c)}</span>
    </div>
    <p class="sub">${c.titulo}</p>
    <div class="fatos">${fatos.join('')}</div>
    <div class="fontes">${c.fontes.map((f) => `<a href="${f.link}" target="_blank" rel="noopener">${f.fonte}</a>`).join('')}</div>`;
}

function renderLista() {
  const todas = ativas();
  const resto = todas.slice(1);
  const vis = resto.filter((c) =>
    (filtro.programa === 'todos' || c.destino === filtro.programa) &&
    (filtro.tipo === 'todos' || c.tipoNome === filtro.tipo));

  const lista = document.getElementById('lista');
  if (!vis.length) {
    lista.innerHTML = `<li class="nada">${resto.length ? 'Nada com esse filtro.' : 'Só a de cima está aberta agora.'}</li>`;
    return;
  }
  lista.innerHTML = vis.map((c) => {
    const q = quando(c.ate);
    const v = vereditoDe(c);
    const partes = [];
    if (c.custoMilheiro) partes.push(`milheiro a ${brl(c.custoMilheiro)}`);
    if (v) partes.push(`<span class="vereditinho ${v.cls}">${v.txt}</span>`);
    partes.push(c.tipoNome.toLowerCase());
    return `<li><button class="item" data-id="${c.id}">
      <span class="figura">${c.percentual ? c.percentual + '%' : '—'}</span>
      <span class="rota">${rotaDe(c)}</span>
      <span class="quando ${q.perto ? 'perto' : ''}">${q.txt}</span>
      <span class="detalhe">${partes.join('<span class="sep"></span>')}
        <span class="fontes">${c.fontes.map((f) => `<a href="${f.link}" target="_blank" rel="noopener">${f.fonte}</a>`).join('')}</span>
      </span>
    </button></li>`;
  }).join('');

  for (const b of lista.querySelectorAll('.item')) {
    b.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const c = todas.find((x) => x.id === b.dataset.id);
      if (c) usarNaConta(c);
    });
  }
}

function renderControles() {
  const todas = ativas().slice(1);
  const programas = [...new Set(todas.map((c) => c.destino))].sort();
  const tipos = [...new Set(todas.map((c) => c.tipoNome))].sort();
  const mk = (id, rotulo, vals, atual) =>
    `<select id="${id}" aria-label="${rotulo}"><option value="todos">${rotulo}</option>` +
    vals.map((v) => `<option ${v === atual ? 'selected' : ''}>${v}</option>`).join('') + '</select>';

  const alvo = document.getElementById('controles');
  alvo.innerHTML = mk('fPrograma', 'todos os programas', programas, filtro.programa) +
                   mk('fTipo', 'todos os tipos', tipos, filtro.tipo);
  alvo.querySelector('#fPrograma').onchange = (e) => { filtro.programa = e.target.value; renderLista(); };
  alvo.querySelector('#fTipo').onchange = (e) => { filtro.tipo = e.target.value; renderLista(); };
}

/** Traz o bônus e o programa da promoção para a calculadora. */
function usarNaConta(c) {
  if (c.percentual) document.getElementById('cBonus').value = String(c.percentual);
  const sel = document.getElementById('cPrograma');
  if ([...sel.options].some((o) => o.value === c.destino)) sel.value = c.destino;
  calcular();
  const campo = document.getElementById('cPontos');
  document.querySelector('.conta')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  campo.focus({ preventScroll: true });
  campo.select?.();
}

function calcular() {
  const n = (id) => Number(String(document.getElementById(id).value).replace(/\./g, '').replace(',', '.')) || 0;
  const pontos = n('cPontos');
  const custo = n('cCusto');
  const bonus = n('cBonus');
  const desagio = n('cDesagio') || 1;
  const prog = document.getElementById('cPrograma').value;

  const milhas = (pontos / desagio) * (1 + bonus / 100);
  const gasto = (pontos / 1000) * custo;
  const milheiro = milhas > 0 ? (gasto / milhas) * 1000 : 0;

  const ref = REF.programas?.[prog];
  let mercado = '';
  if (ref && milheiro > 0) {
    const margem = ref.mediana - milheiro;
    const [txt, cls] = margem > 2 ? ['Vale a pena', 'v-vale'] : margem > 0 ? ['No limite', 'v-limite'] : ['Não vale', 'v-ruim'];
    mercado = `<p class="mercado">O mercado paga de ${brl(ref.min)} a ${brl(ref.max)} pelo milheiro ${prog}.
      <span class="vereditinho ${cls}">${txt}.</span></p>`;
  }

  document.getElementById('resultado').innerHTML = `
    <div class="fatos">
      <div><span>milhas na conta</span><b>${num(Math.round(milhas))}</b></div>
      <div><span>você paga</span><b>${brl(gasto)}</b></div>
      <div><span>cada mil milhas sai a</span><b>${brl(milheiro)}</b></div>
    </div>${mercado}`;
}

function renderHistorico() {
  const hist = Object.entries(DADOS.historico || {})
    .filter(([, h]) => h.maxPercentual)
    .sort((a, b) => b[1].maxPercentual - a[1].maxPercentual)
    .slice(0, 12);
  document.getElementById('historico').innerHTML = hist.length
    ? `<table><thead><tr><th>rota</th><th>maior bônus</th><th>vezes registrado</th></tr></thead><tbody>${
        hist.map(([par, h]) => `<tr><td>${par}</td><td>${h.maxPercentual}%</td><td>${h.ocorrencias}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="nada">O histórico se forma a cada coleta.</p>';
}

function renderPe() {
  const ref = Object.values(REF.programas || {})[0];
  document.getElementById('pe').innerHTML =
    `Promoções lidas de Melhores Destinos, Passageiro de Primeira, Pontos pra Voar, Melhores Cartões e Cartões de Crédito.
     A cotação de referência vem da tabela comparativa do iDinheiro, com valores de MaxMilhas, HotMilhas e BankMilhas,
     e você pode fixar a sua em <code>data/referencia-manual.json</code>.
     ${ref?.coletadoEm ? 'Cotação lida em ' + new Date(ref.coletadoEm).toLocaleDateString('pt-BR') + '. ' : ''}
     Quando a promoção exige cadastro, faça o cadastro antes de transferir: depois não tem como corrigir.`;
}

carregar().then(() => {
  const todas = ativas();
  document.querySelector('.estado').textContent =
    `${todas.length} em aberto, lido às ${new Date(DADOS.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`;

  const sel = document.getElementById('cPrograma');
  for (const p of Object.keys(REF.programas || {}).sort()) sel.add(new Option(p, p));

  renderMelhor(todas[0]);
  renderControles();
  renderLista();
  renderHistorico();
  renderPe();
  calcular();

  for (const id of ['cPontos', 'cCusto', 'cBonus', 'cDesagio']) {
    document.getElementById(id).addEventListener('input', calcular);
  }
  sel.addEventListener('change', calcular);
}).catch((e) => {
  document.querySelector('.estado').textContent = 'falhou a leitura';
  document.getElementById('lista').innerHTML =
    `<li class="nada">Não consegui ler os dados (${e.message}). Rode <code>node src/coletar.mjs</code> e recarregue.</li>`;
});
