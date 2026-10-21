<#
  Instala o backup externo neste computador (rodar uma vez, sem ser
  administrador):
    1. cria a chave SSH só de backup (~/.ssh/nutri_backup, sem senha);
    2. cria o atalho "nutri-backup" no ~/.ssh/config (mesmo servidor do "nutri");
    3. agenda a tarefa diária "Backup Nutri DG Campos" (se o computador estiver
       desligado no horário, roda assim que ligar).
  Depois, autorize a chave no servidor com o comando que este script mostra.

  Uso: powershell -ExecutionPolicy Bypass -File backup\instalar-backup.ps1 [-Destino D:\Backups\Nutri] [-Horario 12:30]
#>
param(
  [string]$Destino = (Join-Path $env:USERPROFILE "Backups\NutriDGCampos"),
  [string]$Horario = "12:30"
)

$ErrorActionPreference = "Stop"
$pastaSsh = Join-Path $env:USERPROFILE ".ssh"
$chave = Join-Path $pastaSsh "nutri_backup"
$config = Join-Path $pastaSsh "config"
$sshKeygen = Join-Path $env:WINDIR "System32\OpenSSH\ssh-keygen.exe"
if (-not (Test-Path $sshKeygen)) { $sshKeygen = (Get-Command ssh-keygen -ErrorAction Stop).Source }

# 1. Chave sem senha (no servidor ela só consegue rodar o servir-backup.sh).
if (-not (Test-Path $chave)) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $sshKeygen
  $info.Arguments = "-q -t ed25519 -N `"`" -C backup-nutri -f `"$chave`""
  $info.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($info)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "Não foi possível criar a chave." }
  Write-Host "Chave de backup criada: $chave"
} else {
  Write-Host "Chave de backup já existia: $chave"
}

# 2. Atalho nutri-backup no ~/.ssh/config, com o mesmo endereço do "nutri".
$texto = if (Test-Path $config) { Get-Content $config -Raw } else { "" }
if ($texto -notmatch "(?m)^Host\s+nutri-backup\s*$") {
  $endereco = [regex]::Match($texto, "(?ms)^Host\s+nutri\s*$.*?^\s+HostName\s+(\S+)").Groups[1].Value
  if (-not $endereco) { throw "Não encontrei 'Host nutri' com HostName em $config." }
  $bloco = "`r`n# Backup externo: chave restrita ao servir-backup.sh no servidor.`r`nHost nutri-backup`r`n  HostName $endereco`r`n  User root`r`n  IdentityFile ~/.ssh/nutri_backup`r`n  IdentitiesOnly yes`r`n"
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
Write-Host "Falta autorizar a chave no servidor (depois do deploy que leva a pasta backup/). Rode:"
Write-Host "  Get-Content $chave.pub | ssh nutri `"sh /opt/nutri/backup/autorizar-chave.sh`""
Write-Host "Depois, teste agora:"
Write-Host "  Start-ScheduledTask -TaskName `"Backup Nutri DG Campos`""
