<#
  Backup externo do Acompanhamento Nutricional (lado deste computador).

  Baixa da VPS, pela chave SSH de backup (restrita ao servir-backup.sh):
    banco.dump        PostgreSQL (pg_dump -Fc)
    arquivos.tar.gz   dietas, exames, receitas, fotos, PDFs e imagens
    configuracao.env  segredos necessários para restaurar (sessão, push, chaves)
    versao.txt        commit do código em produção
  e grava manifesto.json com tamanho e SHA-256 de cada arquivo.

  Cada execução vira uma pasta AAAA-MM-DD_HHMM. Mantém as últimas
  $ManterDiarios cópias e, além delas, a primeira de cada mês por
  $ManterMensais meses. Uma cópia só vale depois de conferida; se algo falhar,
  a pasta incompleta é descartada e aparece um aviso no Windows.

  Uso manual:  powershell -ExecutionPolicy Bypass -File backup\backup-vps.ps1
#>
param(
  [string]$Destino = (Join-Path $env:USERPROFILE "Backups\NutriDGCampos"),
  [string]$Servidor = "nutri-backup",
  [int]$ManterDiarios = 30,
  [int]$ManterMensais = 12,
  # Só para testes: outro executável no lugar do ssh.
  [string]$Ssh = ""
)

$ErrorActionPreference = "Stop"

$ssh = if ($Ssh) { $Ssh } else { Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe" }
if (-not (Test-Path $ssh)) { $ssh = (Get-Command ssh -ErrorAction Stop).Source }

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$log = Join-Path $Destino "backup.log"

function Registrar([string]$mensagem) {
  $linha = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $mensagem
  Add-Content -Path $log -Value $linha -Encoding UTF8
  Write-Host $linha
}

# Aviso na área de notificação do Windows (só aparece com alguém conectado).
function Avisar([string]$titulo, [string]$texto, [string]$tipo) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $icone = New-Object System.Windows.Forms.NotifyIcon
    $icone.Icon = [System.Drawing.SystemIcons]::Information
    $icone.Visible = $true
    $icone.ShowBalloonTip(15000, $titulo, $texto, [System.Windows.Forms.ToolTipIcon]::$tipo)
    Start-Sleep -Seconds 16
    $icone.Dispose()
  } catch { }
}

# Baixa uma parte pela conexão SSH, gravando os bytes exatamente como chegam
# (o redirecionamento do PowerShell 5.1 alteraria arquivos binários).
function Baixar([string]$parte, [string]$alvo) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $ssh
  $info.Arguments = "-o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=30 $Servidor $parte"
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $processo = [System.Diagnostics.Process]::Start($info)
  $erro = $processo.StandardError.ReadToEndAsync()
  $arquivo = [System.IO.File]::Create($alvo)
  try { $processo.StandardOutput.BaseStream.CopyTo($arquivo) } finally { $arquivo.Close() }
  $processo.WaitForExit()
  if ($processo.ExitCode -ne 0) { throw "Falha ao baixar '$parte' (código $($processo.ExitCode)): $($erro.Result.Trim())" }
  if ((Get-Item $alvo).Length -le 0) { throw "'$parte' veio vazio." }
}

function ComecaCom([string]$arquivo, [byte[]]$esperado) {
  $fluxo = [System.IO.File]::OpenRead($arquivo)
  try {
    $inicio = New-Object byte[] $esperado.Length
    [void]$fluxo.Read($inicio, 0, $esperado.Length)
  } finally { $fluxo.Close() }
  return [System.Linq.Enumerable]::SequenceEqual($inicio, $esperado)
}

$nome = Get-Date -Format "yyyy-MM-dd_HHmm"
$pasta = Join-Path $Destino $nome
$parcial = "$pasta.parcial"

try {
  Registrar "Início do backup ($nome)."
  if (Test-Path $parcial) { Remove-Item -Recurse -Force $parcial }
  New-Item -ItemType Directory -Force -Path $parcial | Out-Null

  $banco = Join-Path $parcial "banco.dump"
  Baixar "banco" $banco
  if (-not (ComecaCom $banco ([System.Text.Encoding]::ASCII.GetBytes("PGDMP")))) { throw "banco.dump não é um dump válido do PostgreSQL." }

  $arquivos = Join-Path $parcial "arquivos.tar.gz"
  Baixar "arquivos" $arquivos
  if (-not (ComecaCom $arquivos ([byte[]](0x1F, 0x8B)))) { throw "arquivos.tar.gz não é um gzip válido." }
  # Lê o pacote inteiro: confirma que nenhum arquivo veio cortado.
  $tar = Join-Path $env:WINDIR "System32\tar.exe"
  if (Test-Path $tar) {
    $quantidade = (& $tar -tzf $arquivos | Measure-Object).Count
    if ($LASTEXITCODE -ne 0) { throw "arquivos.tar.gz está corrompido." }
  } else { $quantidade = $null }

  $configuracao = Join-Path $parcial "configuracao.env"
  Baixar "configuracao" $configuracao
  if (-not (Select-String -Path $configuracao -Pattern "^POSTGRES_DB=" -Quiet)) { throw "configuracao.env incompleto." }

  Baixar "versao" (Join-Path $parcial "versao.txt")

  $manifesto = [ordered]@{
    criado_em = (Get-Date).ToString("o")
    servidor = $Servidor
    arquivos_no_pacote = $quantidade
    conteudo = @(Get-ChildItem $parcial -File | ForEach-Object {
      [ordered]@{ arquivo = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash }
    })
  }
  $manifesto | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $parcial "manifesto.json") -Encoding UTF8

  Rename-Item -Path $parcial -NewName $nome
  $tamanho = [math]::Round(((Get-ChildItem $pasta -File | Measure-Object Length -Sum).Sum / 1MB), 1)
  Set-Content -Path (Join-Path $Destino "ULTIMO-BACKUP-OK.txt") -Value "$nome ($tamanho MB)" -Encoding UTF8
  Registrar "Backup concluído: $pasta ($tamanho MB; $quantidade arquivos no pacote)."

  # Retenção: últimas $ManterDiarios + a primeira de cada mês por $ManterMensais meses.
  $copias = @(Get-ChildItem $Destino -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' } | Sort-Object Name -Descending)
  $manter = New-Object System.Collections.Generic.HashSet[string]
  $copias | Select-Object -First $ManterDiarios | ForEach-Object { [void]$manter.Add($_.Name) }
  $copias | Group-Object { $_.Name.Substring(0, 7) } | Sort-Object Name -Descending | Select-Object -First $ManterMensais |
    ForEach-Object { [void]$manter.Add(($_.Group | Sort-Object Name | Select-Object -First 1).Name) }
  foreach ($copia in $copias) {
    if (-not $manter.Contains($copia.Name)) {
      Remove-Item -Recurse -Force $copia.FullName
      Registrar "Cópia antiga removida: $($copia.Name)."
    }
  }
  # Restos de execuções interrompidas.
  Get-ChildItem $Destino -Directory -Filter "*.parcial" | Where-Object { $_.FullName -ne $parcial } | Remove-Item -Recurse -Force
  exit 0
} catch {
  Registrar "ERRO: $($_.Exception.Message)"
  if (Test-Path $parcial) { Remove-Item -Recurse -Force $parcial -ErrorAction SilentlyContinue }
  Avisar "Backup do Nutri DG Campos falhou" "$($_.Exception.Message) Veja $log" "Error"
  exit 1
}
