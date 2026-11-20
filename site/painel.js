const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n) => n.toLocaleString('pt-BR');

let DADOS = null, REF = { programas: {} }, LIVELO = { parceiros: [] };

/** Saldo e custo do ponto ficam no navegador: é o que personaliza tudo. */
const MEU = { saldo: 0, custo: 0, origem: 'cartao', mensal: 0, pontosMes: 0 };
function lerMeu() {
  try {
    const g = JSON.parse(localStorage.getItem('radar-milhas-meu') || '{}');
    MEU.saldo = Number(g.saldo) || 0;
    MEU.custo = Number(g.custo) || 0;
    MEU.origem = g.origem || 'cartao';
    MEU.mensal = Number(g.mensal) || 0;
    MEU.pontosMes = Number(g.pontosMes) || 0;
  } catch { /* navegador sem storage, segue sem personalizar */ }
}

/** O custo do ponto, deduzido da origem em vez de perguntado de novo. */
function custoDoPonto() {
  if (MEU.origem === 'clube' && MEU.mensal > 0 && MEU.pontosMes > 0) {
    return (MEU.mensal / MEU.pontosMes) * 1000;
  }
  if (MEU.origem === 'comprados' && MEU.custo > 0) return MEU.custo;
  return 0; // cartão: o ponto não saiu do bolso
}

function gravarMeu() {
  try { localStorage.setItem('radar-milhas-meu', JSON.stringify(MEU)); } catch { /* ok */ }
}

function simular(c) {
  if (!MEU.saldo || !c.percentual || c.tipo !== 'transferencia_bonificada') return null;
  const milhas = Math.round(MEU.saldo * (1 + c.percentual / 100));
  const custo = custoDoPonto();
  const milheiro = custo ? ((MEU.saldo / 1000) * custo / milhas) * 1000 : null;
  return { milhas, milheiro };
}
const filtro = { programa: 'todos', tipo: 'todos' };

async function carregar() {
  if (window.DADOS_EMBUTIDOS) {
    DADOS = window.DADOS_EMBUTIDOS;
    REF = window.REF_EMBUTIDA || REF;
    LIVELO = window.LIVELO_EMBUTIDA || LIVELO;
    return;
  }
  // Os dados vem do proprio repositorio, nao do site. Assim o robo publica
  // dado novo de hora em hora sem que nenhuma hospedagem precise reconstruir
  // a pagina. Se o GitHub falhar, cai para a copia local do proprio site.
  const REPO = 'https://raw.githubusercontent.com/diorgenesdossantos6-stack/milhas-radar/main/site';

  async function buscar(arquivo, reserva) {
    for (const url of [`${REPO}/${arquivo}`, `./${arquivo}`]) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) return await r.json();
      } catch { /* tenta o proximo */ }
    }
    return reserva;
  }

  const [a, b, c] = await Promise.all([
    buscar('promocoes.json', DADOS),
    buscar('referencia.json', REF),
    buscar('livelo-parceiros.json', LIVELO)
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
  return '<span class="sem-num">sem %</span>';
}

function vereditoDe(c) {
  if (!c.veredito) return null;
  const cls = { 'vale': 'v-vale', 'limite': 'v-limite', 'nao vale': 'v-ruim' }[c.veredito];
  return cls ? { txt: c.rotulo || '', cls, motivo: c.motivo || '' } : null;
}

function ativas() {
  return (DADOS.campanhasAtivas || []).filter((c) => quando(c.ate).viva);
}

function renderResumo(todas) {
  const alvo = document.getElementById('resumo');
  if (!alvo) return;
  const acabamHoje = todas.filter((c) => quando(c.ate).perto).length;
  const bons = todas.filter((c) => c.veredito === 'vale').length;
  const lojas = (LIVELO.parceiros || []).filter((p) => (p.multiplicador || 0) >= 5).length;

  const frases = [];
  if (bons) frases.push(`<b>${bons}</b> ${bons > 1 ? 'valem' : 'vale'} a pena agora`);
  if (acabamHoje) frases.push(`<b class="urge">${acabamHoje}</b> ${acabamHoje > 1 ? 'acabam' : 'acaba'} nas próximas horas`);
  if (lojas) frases.push(`<b>${lojas}</b> ${lojas > 1 ? 'lojas pontuam' : 'loja pontua'} 5x ou mais`);
  if (!frases.length) frases.push('nada de excepcional no momento');

  alvo.innerHTML = `<p>De <b>${todas.length}</b> promoções abertas, ${frases.join(', ')}.</p>`;
}

function renderMelhor(c) {
  const alvo = document.getElementById('melhor');
  if (!c) { alvo.hidden = true; return; }
  alvo.hidden = false;
  const q = quando(c.ate);
  const v = vereditoDe(c);
  const ref = c.referencia;

  const fatos = [];
  const sim = simular(c);
  if (sim) {
    fatos.push(`<div><span>seus pontos viram</span><b>${num(sim.milhas)} milhas</b></div>`);
    if (sim.milheiro) fatos.push(`<div><span>custo de cada mil</span><b>${brl(sim.milheiro)}</b></div>`);
  } else if (c.custoMilheiro) {
    fatos.push(`<div><span>seu milheiro sai a</span><b>${brl(c.custoMilheiro)}</b></div>`);
  }
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
    ${c.esperar ? `<p class="esperar">Ritmo da rota: ${c.esperar.texto}.</p>` : ''}
    <div class="fontes">${c.fontes.map((f) => `<a href="${f.link}" target="_blank" rel="noopener">${f.fonte}</a>`).join('')}</div>`;
}

function renderLista() {
  const todas = ativas();
  const resto = todas.slice(1);
  const vis = resto.filter((c) =>
    (filtro.programa === 'todos' || c.destino === filtro.programa) &&
    (filtro.tipo === 'todos' || c.tipoNome === filtro.tipo));

  const lista = document.getElementById('lista');
  if (!lista.dataset.pintou) { lista.classList.add('entrada'); lista.dataset.pintou = '1'; }
  else lista.classList.remove('entrada');
  if (!vis.length) {
    lista.innerHTML = `<li class="nada">${resto.length ? 'Nada com esse filtro.' : 'Só a de cima está aberta agora.'}</li>`;
    return;
  }
  lista.innerHTML = vis.map((c) => {
    const q = quando(c.ate);
    const v = vereditoDe(c);
    const partes = [];
    if (v) partes.push(`<span class="vereditinho ${v.cls}">${v.txt}</span>`);
    const sim = simular(c);
    if (sim) partes.push(`seus pontos viram <b>${num(sim.milhas)}</b> milhas${sim.milheiro ? ` a ${brl(sim.milheiro)}` : ''}`);
    else if (v?.motivo) partes.push(v.motivo);
    else if (c.custoMilheiro) partes.push(`milheiro a ${brl(c.custoMilheiro)}`);
    else partes.push(c.tipoNome.toLowerCase());
    return `<li><button class="item" data-id="${c.id}">
      <span class="figura">${figuraDe(c)}</span>
      <span class="rota">${rotaDe(c)}</span>
      <span class="quando ${q.perto ? 'perto' : ''}">${q.txt}</span>
      ${c.teto && c.percentual ? `<span class="barra" role="img"
          aria-label="${c.percentual}% de um teto de ${c.teto}% nessa rota">
          <span class="trilho"><span class="preenche" style="width:${Math.min(100, Math.round(c.percentual / c.teto * 100))}%"></span></span>
          <span class="topo-rota">teto ${c.teto}%</span>
        </span>` : ''}
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
    ? `<table><thead><tr><th>rota</th><th>maior bônus</th><th>campanhas vistas</th><th>última</th></tr></thead><tbody>${
        hist.map(([par, h]) => `<tr>
          <td>${par}</td>
          <td>${h.maxPercentual}%</td>
          <td>${h.campanhas ?? h.ocorrencias ?? 1}</td>
          <td class="faixa">${h.ultimaEm ? new Date(h.ultimaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</td>
        </tr>`).join('')
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

/** Redesenha tudo que depende do estado do usuário. */
function repintar() {
  const agora = ativas();
  renderResumo(agora);
  renderMelhor(agora[0]);
  renderCombos();
  renderVoos();
  renderLista();
  calcular();
}

function renderCombos() {
  const sec = document.getElementById('combos-sec');
  const alvo = document.getElementById('combos');
  const combos = (DADOS.combinacoes || []).filter((c) => quando(c.ate).viva);
  if (!combos.length) { sec.hidden = true; return; }
  sec.hidden = false;

  alvo.innerHTML = combos.map((k) => {
    const q = quando(k.ate);
    const custo = custoDoPonto();
    // Comprar com desconto e transferir com bônus: o custo final é o que importa.
    const linha = custo
      ? `Pagando ${brl(custo)} por mil com ${k.descontoCompra}% de desconto e ganhando ${k.bonusTransferencia}% de bônus,
         cada mil milhas ${k.destino} sai a <b>${brl(custo / (1 + k.bonusTransferencia / 100))}</b>.`
      : `${k.descontoCompra}% de desconto na compra somado a ${k.bonusTransferencia}% de bônus na transferência.
         Informe de onde vêm seus pontos acima para eu calcular o custo final.`;
    return `<article class="combo">
      <h3>${k.origem} → ${k.destino}</h3>
      <p class="conta-combo">${linha}</p>
      <ol>${k.partes.map((pt) => `<li><b>${pt.papel}:</b> ${pt.titulo}
        <span class="fontes">${(pt.fontes || []).map((f) => `<a href="${f.link}" target="_blank" rel="noopener">${f.fonte}</a>`).join('')}</span></li>`).join('')}</ol>
      <p class="conta-combo" style="margin:10px 0 0">Vale enquanto as duas estiverem de pé: ${q.txt}.
        Cadastre-se nas duas campanhas antes de comprar ou transferir.</p>
    </article>`;
  }).join('');
}

function renderRegua() {
  const alvo = document.getElementById('regua');
  if (!alvo) return;
  const r = (DADOS.regua || {}).Livelo;
  const progs = REF.programas || {};
  const obs = (DADOS.observacoes || []).filter((o) => o.valor > 0).slice(-12);
  const fonteRef = Object.values(progs).find((p) => p.fonteUrl)?.fonteUrl || null;

  // Dois papéis diferentes: o que custa adquirir, e o que a milha vale.
  const origens = ['Livelo', 'Esfera'].filter((p) => progs[p] || (DADOS.regua || {})[p]);
  const aereos = ['Smiles', 'Latam Pass', 'Azul Fidelidade', 'ConnectMiles'].filter((p) => progs[p]);

  const tetos = DADOS.tetosCompra || {};

  const linha = (prog, papel) => {
    const m = progs[prog];
    const reg = (DADOS.regua || {})[prog];
    if (papel === 'origem') {
      if (!reg?.valor) return '';
      return `<tr><td>${prog}</td><td class="n">${brl(reg.valor)}</td>
        <td class="faixa">${m ? `${brl(m.min)} a ${brl(m.max)}` : 'sem cotação'}</td></tr>`;
    }
    const t = tetos[prog];
    if (!m?.mediana && !t) return '';
    return `<tr>
      <td>${prog}</td>
      <td class="n">${t ? brl(t.valor) : '—'}</td>
      <td class="faixa">${m ? brl(m.mediana) : '—'}</td>
    </tr>`;
  };

  const listaPrecos = obs.length
    ? `<ul class="precos">${obs.map((o) => {
        const dia = new Date(o.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const miolo = `${brl(o.valor)}<small>${dia}${o.fonte ? ` · ${o.fonte}` : ''}</small>`;
        return o.link
          ? `<li><a href="${o.link}" target="_blank" rel="noopener" title="${(o.titulo || '').replace(/"/g, '')}">${miolo}</a></li>`
          : `<li>${miolo}</li>`;
      }).join('')}</ul>`
    : '<p>Nenhum preço registrado ainda. Cada promoção que publica o milheiro vira uma observação aqui.</p>';

  const etapas = [
    'Você fixou um valor em <b>src/fontes.json</b>. Quando isso acontece, mando o cálculo embora e obedeço.',
    'Com 5 preços ou mais, uso a <b>mediana do que o radar já viu</b>, limitada pelo que o mercado paga.',
    `Com menos de 5, uso <b>o que o mercado paga menos 10%</b>${progs.Livelo ? `, hoje ${brl(progs.Livelo.mediana)}` : ''}.`
  ];
  const ordem = { manual: 0, observado: 1, mercado: 2, padrao: 2 };

  alvo.innerHTML = `<div class="regua-caixa">
    <div class="regua-topo">
      <span class="regua-valor">${r ? brl(r.valor) : '—'}</span>
      <span class="regua-como">para adquirir mil pontos Livelo.<br>${r ? r.texto.charAt(0).toUpperCase() + r.texto.slice(1) : 'ainda sem base'}.</span>
    </div>

    <div class="regua-conta">
      <p>Existem <b>duas réguas diferentes</b>, e elas respondem perguntas diferentes.</p>

      <div class="duas">
        <div>
          <h4>Quanto custa adquirir</h4>
          <p class="papel">Moeda de origem. Diz se uma assinatura de clube ou uma compra de pontos está cara.</p>
          <table><thead><tr><th>programa</th><th class="n">régua</th><th>mercado paga</th></tr></thead>
            <tbody>${origens.map((p) => linha(p, 'origem')).join('') || '<tr><td colspan="3">sem dados</td></tr>'}</tbody></table>
        </div>
        <div>
          <h4>Quanto custa comprar pronto</h4>
          <p class="papel">Programas aéreos. É a alternativa a gerar milhas: se comprar sai mais barato, não compensa gerar.</p>
          <table><thead><tr><th>programa</th><th class="n">comprar</th><th>referência</th></tr></thead>
            <tbody>${aereos.map((p) => linha(p, 'aereo')).join('') || '<tr><td colspan="3">sem dados</td></tr>'}</tbody></table>
        </div>
      </div>

      <p style="margin-top:18px">Na prática: se seus pontos Livelo custam ${r ? brl(r.valor) : 'X'} o milheiro e uma
        transferência de 100% leva isso para ${r ? brl(r.valor / 2) : 'metade'} em milhas Smiles, compensa,
        porque comprar mil milhas Smiles prontas custaria
        ${tetos.Smiles ? brl(tetos.Smiles.valor) : progs.Smiles ? `perto de ${brl(progs.Smiles.mediana)}` : 'mais'}.</p>

      <p style="margin-top:12px">A coluna <b>comprar</b> se forma com as promoções de compra de pontos que o radar lê.
        ${Object.keys(tetos).length
          ? `Hoje tenho ${Object.entries(tetos).map(([k, v]) => `<b>${k}</b> a ${brl(v.valor)} (${v.texto})`).join(', ')}.`
          : 'Ainda não registrei nenhuma: enquanto isso, uso a cotação de referência, que é mais conservadora.'}</p>

      <p style="margin-top:16px"><b>Como a régua de aquisição é calculada</b>, em ordem de preferência:</p>
      <ol class="etapas">${etapas.map((e, i) => `<li class="${r && ordem[r.base] === i ? 'ativa' : ''}">${e}</li>`).join('')}</ol>

      <p style="margin-top:14px"><b>Preços que o radar já viu</b>${obs.length ? ` (${obs.length} mais recentes)` : ''}:</p>
      ${listaPrecos}
      <p style="margin-top:12px"><b>De onde vem cada número.</b> A coluna <i>referência</i> é a tabela comparativa
        ${fonteRef ? `do <a href="${fonteRef}" target="_blank" rel="noopener">iDinheiro</a>` : 'do iDinheiro'},
        que reúne MaxMilhas, HotMilhas e BankMilhas. As colunas <i>régua</i> e <i>comprar</i> saem das promoções
        que o próprio radar leu: cada preço acima é um link para a matéria de onde ele veio. Nada aqui é estimado
        por mim; quando falta dado, a célula fica vazia em vez de receber um chute.</p>
    </div>
  </div>`;
}

/**
 * Quanto valem as milhas de uma emissão, em reais.
 * Usa a régua do próprio programa: comprar pronto, se conhecido, senão a
 * cotação de referência. Converter com o custo do ponto Livelo seria errado,
 * porque milha Smiles e ponto Livelo não são a mesma moeda.
 */
function valorDasMilhas(milhas, programa) {
  if (!milhas || !programa) return null;
  const teto = (DADOS.tetosCompra || {})[programa];
  const ref = (REF.programas || {})[programa];
  const porMil = teto?.valor || ref?.mediana;
  if (!porMil) return null;
  return {
    reais: (milhas / 1000) * porMil,
    porMil,
    origem: teto ? `preço de comprar milhas ${programa}` : `cotação de referência ${programa}`
  };
}

function renderVoos() {
  const alvo = document.getElementById('voos');
  const resumo = document.getElementById('voosResumo');
  if (!alvo) return;

  const voos = (DADOS.passagens || []).filter((p) => quando(p.ate).viva);
  if (!voos.length) {
    alvo.innerHTML = '<p class="nada">Nenhuma oportunidade de voo nas últimas coletas.</p>';
    if (resumo) resumo.textContent = '';
    return;
  }
  if (resumo) resumo.textContent = `${voos.length} em aberto`;

  alvo.innerHTML = voos.map((p) => {
    const q = quando(p.ate);
    const trecho = p.origem && p.destino ? `${p.origem} → ${p.destino}`
      : p.destino ? p.destino
      : p.ehLista ? 'Vários destinos' : 'Destino no anúncio';

    const emMilhas = valorDasMilhas(p.milhas, p.programa);
    const temAmbos = p.dinheiro && emMilhas;
    const dinheiroVence = temAmbos && p.dinheiro < emMilhas.reais;

    const precos = [];
    if (p.dinheiro) {
      precos.push(`<div><span>em dinheiro</span>
        <b class="${temAmbos ? (dinheiroVence ? 'vence' : 'perde') : ''}">${brl(p.dinheiro)}</b></div>`);
    }
    if (p.milhas) {
      precos.push(`<div><span>em milhas${p.programa ? ` ${p.programa}` : ''}</span>
        <b class="${temAmbos ? (dinheiroVence ? 'perde' : 'vence') : ''}">${num(p.milhas)}</b></div>`);
    }
    if (emMilhas) {
      precos.push(`<div><span>as milhas valem</span>
        <b class="${temAmbos ? (dinheiroVence ? 'perde' : 'vence') : ''}">${brl(emMilhas.reais)}</b></div>`);
    }

    let leitura = '';
    if (temAmbos) {
      const diferenca = Math.abs(p.dinheiro - emMilhas.reais);
      const empate = diferenca < emMilhas.reais * 0.1;
      leitura = empate
        ? `<p class="leitura v-limite">Empate técnico. Pague em dinheiro e guarde as milhas para uma emissão em que elas rendam mais.</p>`
        : dinheiroVence
          ? `<p class="leitura v-ruim">Pague em dinheiro: as milhas valeriam ${brl(emMilhas.reais)} nessa emissão, mais que os ${brl(p.dinheiro)} cobrados.</p>`
          : `<p class="leitura v-vale">Use as milhas: elas valem ${brl(emMilhas.reais)} e substituem ${brl(p.dinheiro)} de tarifa.</p>`;
    }

    const notas = [];
    if (p.iataOrigem) notas.push(`${p.iataOrigem} para ${p.iataDestino}`);
    if (p.data) {
      const [a, m, dia] = p.data.split('-');
      notas.push(`saída em ${dia}/${m}/${a}`);
    }
    if (p.cabine && p.cabine !== 'Economy') notas.push(p.cabine.toLowerCase());
    if (p.idaEVolta) notas.push('ida e volta');
    if (p.taxas) notas.push('fora as taxas de embarque');
    if (emMilhas) notas.push(`milha avaliada pela ${emMilhas.origem}, ${brl(emMilhas.porMil)} o milheiro`);

    return `<article class="voo">
      <span class="trecho">${trecho}</span>
      <span class="quando ${q.perto ? 'perto' : ''}">${q.txt}</span>
      <div class="precos-voo">${precos.join('')}</div>
      ${leitura}
      ${notas.length ? `<p class="obs-voo">${notas.join(' · ')}</p>` : ''}
      <span class="fontes"><a href="${p.link}" target="_blank" rel="noopener">${p.fonte}</a></span>
    </article>`;
  }).join('');
}

function renderPe() {
  const ref = Object.values(REF.programas || {})[0];
  document.getElementById('pe').innerHTML =
    `Promoções lidas de Melhores Destinos, Passageiro de Primeira, Pontos pra Voar, Melhores Cartões e Cartões de Crédito.
     A cotação de referência vem da tabela comparativa do iDinheiro, com valores de MaxMilhas, HotMilhas e BankMilhas,
     e você pode fixar a sua em <code>data/referencia-manual.json</code>.
     ${ref?.coletadoEm ? 'Cotação lida em ' + new Date(ref.coletadoEm).toLocaleDateString('pt-BR') + '. ' : ''}
     Quando a promoção exige cadastro, faça o cadastro antes de transferir: depois não tem como corrigir.
     <span class="aviso-marcas">O Radar de Milhas é um projeto pessoal e independente, sem vínculo, patrocínio,
     parceria ou autorização da Livelo, Smiles, Latam Pass, Azul Fidelidade, Esfera, Premmia ou de qualquer
     outro programa citado. As marcas são mencionadas apenas para identificar promoções divulgadas publicamente
     e pertencem aos seus respectivos titulares. Os dados vêm das fontes listadas acima e dos sites oficiais
     dos programas; confira sempre na fonte antes de transferir.</span>`;
}

/** Carimbo de frescor no topo. E por ele que se percebe se o radar parou. */
function carimbar(todas) {
  const hora = new Date(DADOS.atualizadoEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
  });
  const atraso = Math.round((Date.now() - new Date(DADOS.atualizadoEm).getTime()) / 60000);
  const alerta = atraso > 45 ? ` · sem atualizar há ${atraso} min` : '';
  document.querySelector('.estado').textContent =
    `${todas.length} em aberto, lido às ${hora}${alerta}`;
}

/** O painel se chama radar, entao ele se atualiza sozinho. Busca de novo a
 *  cada 5 minutos, que e o tempo de cache do GitHub: insistir antes disso so
 *  traria a mesma resposta. So repinta quando o dado realmente mudou, para
 *  nao piscar a tela nem perder o que o usuario digitou na calculadora. */
function manterFresco() {
  setInterval(async () => {
    const antes = DADOS.atualizadoEm;
    try { await carregar(); } catch { return; }
    if (DADOS.atualizadoEm === antes) return;
    const todas = ativas();
    carimbar(todas);
    renderResumo(todas);
    renderMelhor(todas[0]);
    renderLista();
    renderCombos();
    renderVoos();
    renderLivelo();
  }, 5 * 60 * 1000);
}

lerMeu();
carregar().then(() => {
  const todas = ativas();
  if (MEU.saldo) document.getElementById('cPontos').value = num(MEU.saldo);
  const custoInicial = custoDoPonto();
  if (custoInicial) document.getElementById('cCusto').value = custoInicial.toFixed(2).replace('.', ',');
  renderResumo(todas);
  carimbar(todas);

  const sel = document.getElementById('cPrograma');
  for (const p of Object.keys(REF.programas || {}).sort()) sel.add(new Option(p, p));

  renderMelhor(todas[0]);
  renderControles();
  renderLista();
  renderCombos();
  renderVoos();
  renderRegua();
  renderHistorico();
  renderLivelo();
  renderPe();
  calcular();
  manterFresco();

  for (const id of ['cPontos', 'cCusto', 'cBonus', 'cDesagio']) {
    document.getElementById(id).addEventListener('input', calcular);
  }
  sel.addEventListener('change', calcular);

  // Saldo e origem dos pontos: mudou, o painel inteiro se reescreve.
  const soNumero = (v) => Number(String(v).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const el = (id) => document.getElementById(id);
  const campoSaldo = el('mSaldo'), campoOrigem = el('mOrigem');
  const campoMensal = el('mMensal'), campoPontosMes = el('mPontosMes'), campoCusto = el('mCusto');

  const mostrarCampos = () => {
    el('lMensal').hidden = MEU.origem !== 'clube';
    el('lPontosMes').hidden = MEU.origem !== 'clube';
    el('lComprado').hidden = MEU.origem !== 'comprados';
    const custo = custoDoPonto();
    el('meuNota').textContent = MEU.origem === 'cartao'
      ? 'Ponto de cartão não saiu do bolso, então a régua aqui é quanto o mercado paga, não quanto custou. Fica salvo só neste navegador.'
      : custo
        ? `Seus pontos custam ${brl(custo)} por mil. É com esse número que eu julgo cada promoção. Fica salvo só neste navegador.`
        : 'Preencha os campos acima para eu calcular quanto custa o seu ponto. Fica salvo só neste navegador.';
  };

  const aplicar = () => {
    MEU.saldo = soNumero(campoSaldo.value);
    MEU.origem = campoOrigem.value;
    MEU.mensal = soNumero(campoMensal.value);
    MEU.pontosMes = soNumero(campoPontosMes.value);
    MEU.custo = soNumero(campoCusto.value);
    gravarMeu();
    mostrarCampos();
    const custo = custoDoPonto();
    if (MEU.saldo) el('cPontos').value = num(MEU.saldo);
    if (custo) el('cCusto').value = custo.toFixed(2).replace('.', ',');
    repintar();
  };

  campoSaldo.value = MEU.saldo ? num(MEU.saldo) : '';
  campoOrigem.value = MEU.origem;
  campoMensal.value = MEU.mensal ? MEU.mensal.toFixed(2).replace('.', ',') : '';
  campoPontosMes.value = MEU.pontosMes ? num(MEU.pontosMes) : '';
  campoCusto.value = MEU.custo ? MEU.custo.toFixed(2).replace('.', ',') : '';
  mostrarCampos();

  for (const c of [campoSaldo, campoMensal, campoPontosMes, campoCusto]) c.addEventListener('change', aplicar);
  campoOrigem.addEventListener('change', aplicar);
  campoSaldo.addEventListener('blur', () => { if (MEU.saldo) campoSaldo.value = num(MEU.saldo); });
}).catch((e) => {
  document.querySelector('.estado').textContent = 'falhou a leitura';
  const lista0 = document.getElementById('lista');
  if (!lista0.dataset.pintou) { lista0.classList.add('entrada'); lista0.dataset.pintou = '1'; }
  lista0.innerHTML =
    `<li class="nada">Não consegui ler os dados (${e.message}). Rode <code>node src/coletar.mjs</code> e recarregue.</li>`;
});
