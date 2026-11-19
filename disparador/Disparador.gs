/**
 * Disparador do Radar de Milhas.
 *
 * O cron do GitHub Actions e pouco confiavel em repositorio publico: ele atrasa
 * e pula execucoes quando a fila esta cheia. Este script chama o workflow pela
 * API no horario certo, usando um gatilho de tempo do Apps Script.
 *
 * COMO INSTALAR
 *  1. script.google.com, Novo projeto, cole este arquivo.
 *  2. Engrenagem (Configuracoes do projeto) > Propriedades do script > Adicionar:
 *       GITHUB_TOKEN  =  o token que voce gerou no GitHub
 *     Guarde so ali. Nao coloque o token no codigo.
 *  3. Rode a funcao instalarGatilho() uma vez. Autorize quando pedir.
 *  4. Pronto. Para conferir, rode dispararColeta() e veja o log.
 *
 * O token precisa ser "fine-grained", so para o repositorio milhas-radar,
 * com a permissao Actions = Read and write. Nada alem disso.
 */

const DONO = 'diorgenesdossantos6-stack';
const REPO = 'milhas-radar';
const WORKFLOW = 'coletar.yml';
const BRANCH = 'main';

/** Chama o workflow. E esta funcao que o gatilho executa de hora em hora. */
function dispararColeta() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Falta a propriedade GITHUB_TOKEN. Veja o passo 2 das instrucoes.');
  }

  const url = `https://api.github.com/repos/${DONO}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const resposta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: JSON.stringify({ ref: BRANCH }),
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();
  if (codigo === 204) {
    console.log('Coleta disparada com sucesso.');
    return true;
  }

  // 401 = token invalido ou expirado. 403 = token sem permissao de Actions.
  // 404 = repositorio ou workflow nao encontrado, ou token sem acesso a ele.
  console.error(`Falhou com codigo ${codigo}: ${resposta.getContentText()}`);
  if (codigo === 401) console.error('Token invalido ou expirado. Gere outro e atualize a propriedade.');
  if (codigo === 403) console.error('Token sem permissao Actions = Read and write.');
  if (codigo === 404) console.error('Confira o nome do repositorio e do arquivo do workflow.');
  return false;
}

/** Cria o gatilho de hora em hora. Rode uma vez. */
function instalarGatilho() {
  removerGatilhos();
  ScriptApp.newTrigger('dispararColeta').timeBased().everyHours(1).create();
  console.log('Gatilho criado: dispararColeta roda de hora em hora.');
}

/** Remove os gatilhos deste script. Util para desinstalar ou reinstalar. */
function removerGatilhos() {
  const gatilhos = ScriptApp.getProjectTriggers();
  for (const g of gatilhos) {
    if (g.getHandlerFunction() === 'dispararColeta') ScriptApp.deleteTrigger(g);
  }
  console.log(`Gatilhos removidos: ${gatilhos.length}`);
}
