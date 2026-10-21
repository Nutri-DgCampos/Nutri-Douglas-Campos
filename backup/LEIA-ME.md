# Backup externo e restauração

Cópia diária da VPS para um computador (Windows), fora do servidor.

## O que é copiado

| Arquivo | Conteúdo |
|---|---|
| `banco.dump` | Banco PostgreSQL inteiro (`pg_dump -Fc`) |
| `arquivos.tar.gz` | Pasta de arquivos: dietas, exames, receitas, fotos, PDFs e imagens |
| `configuracao.env` | O `.env` da produção (segredos de sessão, push, chaves) |
| `versao.txt` | Commit do código que estava no ar |
| `manifesto.json` | Tamanho e SHA-256 de cada arquivo |

Cada execução cria uma pasta `AAAA-MM-DD_HHMM` no destino. Ficam as **30 últimas** e, além delas, **a primeira de cada mês por 12 meses**. O resultado de cada execução fica em `backup.log`, e `ULTIMO-BACKUP-OK.txt` mostra a última cópia boa. Se uma execução falhar, a pasta incompleta é apagada e aparece um aviso no Windows.

> **Atenção:** essas pastas têm dados de saúde e os segredos do sistema. Guarde-as num disco criptografado (BitLocker) e não as envie por e-mail ou mensagem.

## Como funciona a segurança

O computador usa uma chave SSH própria (`~/.ssh/nutri_backup`). No servidor, essa chave está presa ao script `backup/servir-backup.sh` (`command=...,restrict` no `authorized_keys`). Ela só consegue pedir `banco`, `arquivos`, `configuracao` ou `versao`. Não abre terminal, não roda outros comandos e não cria túnel. Nada fica gravado no servidor: a cópia passa direto pela conexão.

## Instalação (uma vez)

1. Fazer o deploy que leva a pasta `backup/` ao servidor.
2. Neste computador, na pasta do projeto, no PowerShell (sem administrador):
   ```
   powershell -ExecutionPolicy Bypass -File backup\instalar-backup.ps1
   ```
   Opções: `-Destino D:\Backups\Nutri` (padrão: `%USERPROFILE%\Backups\NutriDGCampos`) e `-Horario 12:30`. Se o computador estiver desligado no horário, a tarefa roda assim que ele ligar.
3. Autorizar a chave no servidor (o instalador mostra o comando; pede a senha da sua chave normal uma vez):
   ```
   Get-Content $env:USERPROFILE\.ssh\nutri_backup.pub | ssh nutri "sh /opt/nutri/backup/autorizar-chave.sh"
   ```
4. Testar agora:
   ```
   Start-ScheduledTask -TaskName "Backup Nutri DG Campos"
   ```
   e conferir `backup.log` na pasta de destino.

Para remover: `Unregister-ScheduledTask -TaskName "Backup Nutri DG Campos"` e apagar, no servidor, a linha `backup-nutri` de `/root/.ssh/authorized_keys`.

## Restauração (servidor novo)

Num servidor Ubuntu com Docker e o repositório em `/opt/nutri`. Copie a pasta da cópia escolhida para `/root/restauracao`, por exemplo com `scp -r`.

```bash
cd /opt/nutri
cp /root/restauracao/configuracao.env .env
git checkout $(cut -d' ' -f1 /root/restauracao/versao.txt)    # mesma versão do código (opcional)

# Banco: sobe só o postgres, restaura e confere.
docker compose up -d postgres
sleep 10
docker exec -i nutri-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /root/restauracao/banco.dump
docker exec nutri-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from patients"'

# Arquivos: sobe o app e extrai o pacote no volume.
docker compose up -d --build
docker exec -i -u root nutri-app sh -c 'tar xzf - -C /dados/arquivos && chown -R node:node /dados/arquivos' < /root/restauracao/arquivos.tar.gz

# nginx/HTTPS e DNS: apontar o domínio para o novo IP e rodar o deploy.sh (--nginx).
```

Teste feito em 21/10/2026, com um servidor simulado e o banco local. O banco foi restaurado num banco novo com as mesmas contagens: pacientes 70/70, alimentos 598/598 e `schema_migrations` 4/4. Os arquivos extraídos ficaram idênticos (102 de 102). A retenção e a falha (pasta incompleta descartada, aviso no Windows) também foram testadas. **Recomendado:** ensaiar a restauração de verdade uma vez por trimestre.
