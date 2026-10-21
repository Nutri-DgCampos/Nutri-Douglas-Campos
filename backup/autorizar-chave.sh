#!/bin/sh
# Autoriza a chave pública de backup (recebida pela entrada padrão) a rodar
# somente o servir-backup.sh. Rodar uma vez, no servidor, como root:
#   Get-Content $env:USERPROFILE\.ssh\nutri_backup.pub | ssh nutri "sh /opt/nutri/backup/autorizar-chave.sh"
# Rodar de novo com a mesma chave não duplica a linha.

set -eu
chave=$(head -n 1 | tr -d '\r')
case "$chave" in
  ssh-ed25519\ *) ;;
  *) echo "Chave invalida: esperado ssh-ed25519." >&2; exit 1 ;;
esac

chmod 755 /opt/nutri/backup/servir-backup.sh
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

corpo=$(echo "$chave" | awk '{print $2}')
if grep -q "$corpo" /root/.ssh/authorized_keys; then
  echo "Chave de backup ja estava autorizada."
  exit 0
fi

echo "command=\"/opt/nutri/backup/servir-backup.sh\",restrict $chave" >> /root/.ssh/authorized_keys
echo "Chave de backup autorizada (somente o servir-backup.sh)."
