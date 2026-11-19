<#
.SYNOPSIS
  Envia as mudancas locais para o GitHub na ordem certa.

.DESCRIPTION
  O coletor comita dados de hora em hora, entao o repositorio remoto quase sempre
  esta a frente do seu PC. E o Expand-Archive suja a pasta antes de voce puxar,
  o que faz o "git pull" abortar. Este script resolve isso fazendo na ordem:

    1. commita o que voce mudou (para o pull nao abortar);
    2. puxa o que o robo gravou, preferindo os dados dele em caso de conflito;
    3. envia.

.EXAMPLE
  .\subir.ps1 "corrige calculo do milheiro"
#>
param(
  [Parameter(Position = 0)]
  [string]$Mensagem = "atualiza radar"
)

$ErrorActionPreference = "Continue"

function Passo($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Aviso($texto) { Write-Host "    $texto" -ForegroundColor DarkGray }

# Confere que estamos num repositorio git
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Esta pasta nao e um repositorio git. Entre na pasta milhas-radar e rode de novo." -ForegroundColor Red
  exit 1
}

Passo "1/3  Guardando o que voce mudou"
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Aviso "Nada mudou aqui, seguindo para puxar o que o robo gravou."
} else {
  git commit -m $Mensagem | Out-Null
  Aviso "Commit feito: $Mensagem"
}

Passo "2/3  Puxando o que o coletor gravou"
git pull --no-rebase --no-edit
if ($LASTEXITCODE -ne 0) {
  Aviso "Conflito. Os dados do robo sao mais recentes, entao eles vencem."
  $arquivosDeDados = @(
    "data/promocoes.json",
    "data/referencia.json",
    "data/livelo-parceiros.json"
  )
  foreach ($arquivo in $arquivosDeDados) {
    git checkout --theirs -- $arquivo *> $null
  }
  git add -A
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit -m "merge dados" | Out-Null
    Aviso "Conflito de dados resolvido."
  }

  # Se sobrou conflito em codigo, e decisao sua: paramos aqui.
  $pendentes = git diff --name-only --diff-filter=U
  if ($pendentes) {
    Write-Host "`nAinda ha conflito nestes arquivos de codigo:" -ForegroundColor Yellow
    $pendentes | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host "Resolva, rode 'git add .', 'git commit' e depois 'git push'." -ForegroundColor Yellow
    exit 1
  }
}

Passo "3/3  Enviando"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nO push falhou. Rode '.\subir.ps1' de novo: quase sempre e o robo tendo commitado no meio do caminho." -ForegroundColor Yellow
  exit 1
}

Write-Host "`nPronto. A Netlify republica em menos de um minuto." -ForegroundColor Green
