<#
  Instala o backup externo neste computador (rodar uma vez, sem ser
  administrador):
    1. cria a chave SSH só de backup (~/.ssh/nutri_backup, sem senha);
    2. cria o atalho "nutri-backup" no ~/.ssh/config;
    3. agenda a tarefa diária "Backup Nutri DG Campos" (se o computador estiver
       desligado no horário, roda assim que ligar).
  Depois, a chave precisa ser autorizada no servidor (o script mostra como).

  Uso: powershell -ExecutionPolicy Bypass -File instalar-backup.ps1 [-Destino D:\Backups\Nutri] [-Horario 12:30] [-Endereco IP]
  -Endereco: IP do servidor. Obrigatório em computador sem o atalho "nutri"
  no ~/.ssh/config (por exemplo, o computador do cliente).
#>
param(
  [string]$Destino = (Join-Path $env:USERPROFILE "Backups\NutriDGCampos"),
  [string]$Horario = "12:30",
  [string]$Endereco = ""
)

$ErrorActionPreference = "Stop"
$pastaSsh = Join-Path $env:USERPROFILE ".ssh"
$chave = Join-Path $pastaSsh "nutri_backup"
$config = Join-Path $pastaSsh "config"
$sshKeygen = Join-Path $env:WINDIR "System32\OpenSSH\ssh-keygen.exe"
if (-not (Test-Path $sshKeygen)) { $sshKeygen = (Get-Command ssh-keygen -ErrorAction Stop).Source }
if (-not (Test-Path $pastaSsh)) { New-Item -ItemType Directory -Path $pastaSsh | Out-Null }

# 1. Chave sem senha (no servidor ela só consegue rodar o servir-backup.sh).
if (-not (Test-Path $chave)) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $sshKeygen
  $info.Arguments = "-q -t ed25519 -N `"`" -C backup-nutri-$env:COMPUTERNAME -f `"$chave`""
  $info.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($info)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "Não foi possível criar a chave." }
  Write-Host "Chave de backup criada: $chave"
} else {
  Write-Host "Chave de backup já existia: $chave"
}

# 2. Atalho nutri-backup no ~/.ssh/config: endereço informado ou o do "nutri".
$texto = if (Test-Path $config) { Get-Content $config -Raw } else { "" }
$temNutri = $texto -match "(?m)^Host\s+nutri\s*$"
if ($texto -notmatch "(?m)^Host\s+nutri-backup\s*$") {
  $servidor = if ($Endereco) { $Endereco } else { [regex]::Match($texto, "(?ms)^Host\s+nutri\s*$.*?^\s+HostName\s+(\S+)").Groups[1].Value }
  if (-not $servidor) { throw "Informe o IP do servidor: -Endereco <IP> (este computador não tem o atalho 'nutri' em $config)." }
  # accept-new: guarda a identidade do servidor na primeira conexão e, depois,
  # recusa se ela mudar (a tarefa roda sem ninguém para responder perguntas).
  $bloco = "`r`n# Backup externo: chave restrita ao servir-backup.sh no servidor.`r`nHost nutri-backup`r`n  HostName $servidor`r`n  User root`r`n  IdentityFile ~/.ssh/nutri_backup`r`n  IdentitiesOnly yes`r`n  StrictHostKeyChecking accept-new`r`n"
  Add-Content -Path $config -Value $bloco -Encoding ASCII
  Write-Host "Atalho 'nutri-backup' adicionado em $config"
} else {
  Write-Host "Atalho 'nutri-backup' já existia."
}

# 3. Tarefa agendada (do usuário atual; roda assim que possível se perdeu o horário).
$script = Join-Path $PSScriptRoot "backup-vps.ps1"
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Destino `"$Destino`""
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Backup Nutri DG Campos" -Action $acao -Trigger $gatilho -Settings $opcoes `
  -Description "Copia diária do banco e dos arquivos da VPS para $Destino" -Force | Out-Null
Write-Host "Tarefa 'Backup Nutri DG Campos' agendada para $Horario (destino: $Destino)."

Write-Host ""
if ($temNutri) {
  Write-Host "Falta autorizar a chave no servidor. Rode:"
  Write-Host "  Get-Content $chave.pub | ssh nutri `"sh /opt/nutri/backup/autorizar-chave.sh`""
} else {
  # Computador sem acesso administrativo ao servidor (ex.: o do cliente): quem
  # administra o servidor autoriza a chave PÚBLICA a partir do computador dele.
  $publica = (Get-Content "$chave.pub" -Raw).Trim()
  $arquivo = Join-Path $PSScriptRoot "chave-publica-backup.txt"
  Set-Content -Path $arquivo -Value $publica -Encoding ASCII
  Write-Host "Falta autorizar a chave no servidor. Envie ao administrador do servidor a chave PÚBLICA abaixo"
  Write-Host "(pode ir por e-mail ou mensagem; também foi salva em $arquivo):"
  Write-Host ""
  Write-Host "  $publica"
}
Write-Host ""
Write-Host "Depois de autorizada, teste:"
Write-Host "  Start-ScheduledTask -TaskName `"Backup Nutri DG Campos`""
