# Radar de Milhas

Buscador de promoções de milhas, pontos e transferências bonificadas. Lê os feeds dos
principais sites do assunto, identifica o que é promoção de verdade, agrupa a mesma campanha
noticiada por vários sites, calcula o custo do milheiro e compara com o que o mercado paga.

Roda de graça no GitHub Actions. Sem servidor, sem banco, sem dependências.

## O que ele faz

1. **Coleta.** Lê os feeds RSS de Melhores Destinos, Passageiro de Primeira, Pontos pra Voar,
   Melhores Cartões e Cartões de Crédito.
2. **Classifica.** Separa transferência bonificada, compra de pontos com desconto,
   pontos + dinheiro, clube/assinatura, pointsback e acúmulo acelerado. Descarta o ruído
   (passagem promocional, pacote, notícia de aviação).
3. **Extrai.** Programa de origem e destino, percentual de bônus, prazo de validade e,
   quando a matéria já traz, o custo do milheiro resultante.
4. **Agrupa.** A mesma campanha noticiada por 4 sites vira um card com 4 links.
5. **Pontua.** Nota de 0 a 100 combinando percentual, raridade (compara com o máximo já
   registrado naquela rota), tipo de promoção e urgência.
6. **Avalia.** Compara o custo do milheiro com a cotação de mercado e dá o veredito:
   vale a pena, no limite, não vale.
7. **Alerta.** Manda no Telegram quando aparece transferência bonificada acima do seu limite.

## Estrutura

```
src/parser.mjs     leitura de RSS, classificação, extração, agrupamento
src/coletar.mjs    orquestra a coleta, pontua, grava os dados, dispara alerta
src/cotacao.mjs    camada de referência: quanto o mercado paga pelo milheiro
src/build.mjs      gera o site e a versão de arquivo único
src/fontes.json    feeds, programas, tipos de promoção e filtros de ruído
data/              dados coletados (o Action comita aqui)
site/              painel que vai para a Netlify
```

## Como colocar de pé

**1. Repositório.** Crie um repo e suba estes arquivos.

**2. Primeira coleta local** (opcional, só para ver funcionando):

```bash
node src/coletar.mjs --seco    # não grava nada, só imprime
node src/coletar.mjs           # grava data/promocoes.json
node src/build.mjs             # gera o site
```

**3. GitHub Actions.** O workflow já está em `.github/workflows/coletar.yml` e roda a cada
2 horas. Em Settings > Actions > General, marque *Read and write permissions* para o workflow
poder comitar os dados.

**4. Alerta no Telegram** (opcional). Fale com o @BotFather, crie um bot, pegue o token.
Mande uma mensagem para o bot e descubra seu chat id em
`https://api.telegram.org/bot<TOKEN>/getUpdates`. Em Settings > Secrets and variables > Actions,
cadastre:

| Secret | Para que serve |
|---|---|
| `TELEGRAM_TOKEN` | token do bot |
| `TELEGRAM_CHAT_ID` | seu chat id |

E em *Variables*, opcionalmente `LIMITE_ALERTA` (padrão 80), o percentual mínimo que
dispara o alerta.

**5. Netlify.** Aponte para o repo. O `netlify.toml` já define build e publish. Cada commit
do Action republica o painel.

## Ajustes que você vai querer fazer

**Fixar a cotação que você confia.** O `data/referencia-manual.json` sobrescreve a raspagem.
Exemplo:

```json
{
  "programas": {
    "Smiles": { "min": 16.50, "max": 20.00, "mediana": 18.00, "fonte": "minha cotação" }
  }
}
```

**Adicionar fonte.** Acrescente em `src/fontes.json` > `feeds`. Qualquer RSS 2.0 serve.

**Calibrar o filtro.** Se algo irrelevante estiver passando, acrescente o termo em `ruido`.
Se uma promoção boa estiver escapando, veja `tipos` e acrescente a palavra-chave em `exige`
ou `contexto`.

## Limites honestos

- Os programas (Livelo, Smiles, Latam) não têm API pública de promoções e as páginas de
  campanha ficam atrás de login. O radar depende de os blogs noticiarem, com o atraso que isso
  implica. Para as campanhas de 1 dia, que são a maioria, o atraso costuma ser de minutos.
- O prazo nem sempre vem explícito. Quando não dá para identificar, o coletor assume 3 dias e
  marca `confiancaPrazo: "baixa"`. Confira o regulamento antes de transferir.
- A cotação de referência é um retrato editorial, não cotação em tempo real. Para valor exato
  você precisa simular na plataforma, que exige login e CPF.
- O cadastro na página da promoção, quando exigido, tem que ser feito **antes** da
  transferência. Nenhuma automação resolve isso por você.
