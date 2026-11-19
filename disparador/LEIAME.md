# Disparador externo

O cron do GitHub Actions atrasa e pula execuções em repositório público. Este
script chama o workflow pela API no horário certo.

## Passo 1: gerar o token

No GitHub: **Settings** (da sua conta, não do repositório) > **Developer settings**
> **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.

- **Token name:** `radar-milhas-disparador`
- **Expiration:** 90 dias ou 1 ano. Não escolha "No expiration".
- **Repository access:** *Only select repositories* > `milhas-radar`
- **Permissions** > *Repository permissions* > **Actions**: `Read and write`.
  Só essa. Deixe todas as outras em "No access".

Copie o token. Ele aparece uma única vez.

Esse token só consegue disparar workflows nesse repositório. Não lê seu código
privado, não cria commits e não toca em nenhum outro repositório.

## Passo 2: instalar o script

1. [script.google.com](https://script.google.com), **Novo projeto**.
2. Cole o conteúdo de `Disparador.gs`.
3. Engrenagem (**Configurações do projeto**) > **Propriedades do script** >
   **Adicionar propriedade**: nome `GITHUB_TOKEN`, valor é o token.
4. Volte ao editor, selecione a função `instalarGatilho` e clique em **Executar**.
   Autorize o acesso quando o Google pedir.

## Passo 3: conferir

Rode `dispararColeta` manualmente e veja o log. Esperado: "Coleta disparada com
sucesso". Em seguida confira a aba Actions do repositório.

## Quando o token expirar

O script passa a registrar erro 401 no log. Gere outro token pelo passo 1 e
troque o valor da propriedade `GITHUB_TOKEN`. Nada mais muda.

## Desinstalar

Rode `removerGatilhos` e apague a propriedade do script.
