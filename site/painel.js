const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n) => n.toLocaleString('pt-BR');

let DADOS = null, REF = { programas: {} }, LIVELO = { parceiros: [] };
const filtro = { programa: 'todos', tipo: 'todos' };

async function carregar() {
  if (window.DADOS_EMBUTIDOS) {
    DADOS = window.DADOS_EMBUTIDOS;
    REF = window.REF_EMBUTIDA || REF;
    LIVELO = window.LIVELO_EMBUTIDA || LIVELO;
    return;
  }
  const [a, b, c] = await Promise.all([
    fetch('./promocoes.json').then((r) => r.json()),
    fetch('./referencia.json').then((r) => r.json()).catch(() => REF),
    fetch('./livelo-parceiros.json').then((r) => r.json()).catch(() => LIVELO)
  ]);
  DADOS = a; REF = b; LIVELO = c;
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
  if (c.tipo === 'acumulo' && c.acumulo?.loja) return `${c.acumulo.loja} → ${c.destino}`;
  const origens = c.origens.filter((o) => o !== c.destino);
  return origens.length ? `${origens.join(' e ')} → ${c.destino}` : c.destino;
}

/** Número que resume a oferta: bônus em %, ou pontos por real no acúmulo. */
function figuraDe(c) {
  if (c.percentual) return `${c.percentual}%`;
  if (c.acumulo?.porReal) return `${String(c.acumulo.porReal).replace('.', ',')}<small>pts/R$</small>`;
  return '—';
}

function vereditoDe(c) {
  if (!c.veredito) return null;
  const cls = { 'vale': 'v-vale', 'limite': 'v-limite', 'nao vale': 'v-ruim' }[c.veredito];
  return cls ? { txt: c.rotulo || '', cls, motivo: c.motivo || '' } : null;
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
  if (ref && c.custoMilheiro) fatos.push(`<div><span>o mercado paga</span><b>${brl(ref.min)} a ${brl(ref.max)}</b></div>`);
  fatos.push(`<div><span>prazo</span><b>${q.txt}</b></div>`);
  if (v) fatos.push(`<div><span>compensa?</span><b class="${v.cls}">${v.txt}</b></div>`);

  alvo.innerHTML = `
    <p class="chamada">A oportunidade mais forte agora</p>
    <div class="linha1">
      <span class="figura">${figuraDe(c)}</span>
      <span class="rota">${rotaDe(c)}</span>
    </div>
    <p class="sub">${c.titulo}</p>
    <div class="fatos">${fatos.join('')}</div>
    ${v?.motivo ? `<p class="motivo ${v.cls}">${v.motivo.charAt(0).toUpperCase() + v.motivo.slice(1)}.</p>` : ''}
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
    if (v) partes.push(`<span class="vereditinho ${v.cls}">${v.txt}</span>`);
    if (v?.motivo) partes.push(v.motivo);
    else if (c.custoMilheiro) partes.push(`milheiro a ${brl(c.custoMilheiro)}`);
    else partes.push(c.tipoNome.toLowerCase());
    return `<li><button class="item" data-id="${c.id}">
      <span class="figura">${figuraDe(c)}</span>
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

function renderLivelo() {
  const alvo = document.getElementById('livelo');
  const ps = (LIVELO.parceiros || []).filter((p) => p.pontosPorReal || p.pontosClube);
  if (!ps.length) {
    alvo.innerHTML = `<p class="nada">Não consegui ler as ofertas da Livelo${LIVELO.erro ? ` (${LIVELO.erro})` : ''}.</p>`;
    return;
  }
  const lido = LIVELO.lidoEm
    ? new Date(LIVELO.lidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : 'data desconhecida';

  const alerta = LIVELO.ok === false
    ? `<div class="obs aviso"><p><b>Esta lista está congelada.</b> A última leitura da Livelo falhou
         (${LIVELO.erro || 'motivo não registrado'}), então o que você vê é de ${lido} e pode estar desatualizado.</p></div>`
    : '';

  const linhas = ps.slice(0, 24).map((p) => {
    const melhor = Math.max(p.pontosPorReal || 0, p.pontosClube || 0);
    const soClube = (p.pontosClube || 0) > (p.pontosPorReal || 0);
    const q = p.ate ? quando(p.ate) : null;
    return `<li>
      <span class="pts">${String(melhor).replace('.', ',')}<small>pts/R$</small></span>
      <span class="loja">
        ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">${p.loja}</a>` : p.loja}
        <em>${soClube ? `${p.pontosPorReal} sem o Clube Livelo` : ''}${p.pontosNormal ? `${soClube ? ', ' : ''}normal é ${p.pontosNormal}` : ''}</em>
      </span>
      ${p.multiplicador && p.multiplicador > 1 ? `<span class="mult">${String(p.multiplicador).replace('.', ',')}x</span>` : ''}
      ${q ? `<span class="prazo-loja ${q.perto ? 'perto' : ''}">${q.txt}</span>` : ''}
    </li>`;
  }).join('');

  alvo.innerHTML = `${alerta}
    <ul class="lojas">${linhas}</ul>
    <div class="obs">
      <p>O número grande é a melhor pontuação da campanha, somando o Clube Livelo quando ele paga mais.
        O <b>multiplicador</b> compara com a pontuação normal da loja: é ele que diz se a oferta é boa de verdade,
        porque 5 pontos por real numa loja que já dá 4 vale bem menos que 5 numa que dá 1.</p>
      <p>Só pontua entrando pelo site da Livelo com a conta logada, não indo direto na loja. Lido em ${lido}
        de <a href="${LIVELO.fonte || 'https://www.livelo.com.br/ofertas'}" target="_blank" rel="noopener">livelo.com.br/ofertas</a>.</p>
      <p>Aqui não há veredito de compensar ou não: acúmulo em loja não tem custo de milheiro,
        é ponto sobre uma compra que você já ia fazer. O que vale comparar é o preço do produto.</p>
    </div>`;
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
  renderLivelo();
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
