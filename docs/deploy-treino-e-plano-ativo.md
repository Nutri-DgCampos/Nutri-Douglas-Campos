# Deploy único: Módulo de Treino completo e correção do plano ativo

**Data:** 04/11/2026
**Conteúdo:** tudo o que está no GitHub até o commit deste documento.

Inclui:
- Módulo de Treino, etapas T1 a T8, com as respostas do técnico até S1–S8;
- melhorias de 01/11 (cópia de alimento, avisos ao nutricionista, fotos no link);
- correção do plano durante o ciclo ativo (SPEC Plano Ativo, S9–S12).

## 1. Antes

- **Variáveis de ambiente:** não há nenhuma nova obrigatória. O `.env` da produção continua valendo, incluindo VAPID, OpenAI e `CRON_SECRET`.
- **Não usar `IA_SIMULADA`** na produção.
- **Backup:** o `deploy.sh` faz o `pg_dump` antes de tudo. Não use `--sem-backup`.
- **Horário:** de preferência fora de segunda das 9h às 10h e de terça das 18h às 19h, que são as janelas dos lembretes de relatório.

## 2. Deploy

No PowerShell do computador:

```
ssh -t nutri "cd /opt/nutri && bash deploy.sh"
```

O script aplica só as migrações que faltam, em ordem, cada uma numa transação, e registra em `schema_migrations`.

**Se aparecer `FAIL` na seção de migrações, pare e veja o `deploy.log`:** o script continua mesmo com falha.

## 3. Migrações (todas aditivas)

| Migração | O que faz |
|---|---|
| 020 | Treino T1: prescrição e registros do aluno |
| 021 | Educador físico, vínculos, relato de desconforto, push dos profissionais |
| 022 | Cópia de alimento da TACO |
| 023 | Avisos ao nutricionista (sino e push) |
| 024 | Fotos no link da anamnese e ciclo nas fotos |
| 025 | Relatório semanal do Treino, metas e pausas |
| 026 | Alunos próprios do educador |
| 027 | Editor de musculação, biblioteca de exercícios (70), academias e modelos |
| 028 | Corrida e ciclismo do aluno, tênis, bicicletas e consumo |
| 029 | Zonas de treino (Coggan) |
| 030 | Relatório por modalidade |
| 031 | Uso sem internet (hora real do registro) |
| 032 | Anamnese do educador, avaliação física compartilhada, identidade do educador |
| 033 | Planos, contratos, pagamentos, renovação e desativação do aluno do Treino |
| 034 | Correção do plano ativo: liberação do relatório e histórico das alterações |
| 035 | Catálogo de observações do treino (SPEC complementar de 06/11; ver `docs/spec-complementar-2026-11-06.md`) |

Para conferir no fim:

```
ssh nutri "docker exec nutri-postgres psql -U nutri -d nutri -c 'select migration_name, executed_at from public.schema_migrations order by migration_name desc limit 16'"
```

A última da lista tem de ser a mais nova (hoje, a 035).

## 4. Conferir depois do deploy

**Nutrição:**
1. Entrar como nutricionista: o sino de avisos aparece na barra.
2. **Correção dos três pacientes** cadastrados como mensal (SPEC Plano Ativo; não há script):
   1. abrir o paciente › Editar;
   2. trocar "Plano contratado" para Semanal e Salvar;
   3. na confirmação, conferir o plano anterior e o novo, o ciclo e se o relatório será liberado hoje; Confirmar;
   4. se o cadastro já estiver como Semanal e o ciclo não, usar "Reaplicar o plano ao acompanhamento atual";
   5. a mensagem final diz se o relatório foi liberado e se o paciente tem avisos ativados no celular. Se não tiver, avisar o paciente por outro meio: o relatório liberado fica aberto só até 23h59 do dia.

**Treino:**
1. Módulo de Treino › Educadores físicos: cadastrar ou abrir um educador real.
2. **Com o educador:**
   - Planos: criar um plano e conferir a tolerância (padrão de 7 dias);
   - Meu perfil: nome, CREF, contato e logotipo.
3. **Ficha de um aluno:** os cartões Plano e pagamento, Anamnese do treino e Avaliações físicas aparecem.
4. **No celular do aluno:**
   - Meu treino abre;
   - com a internet desligada, a página continua e o registro fica na fila;
   - ao voltar a internet, o registro é enviado.

**Logs:**

```
ssh nutri "docker logs --since 10m nutri-app 2>&1 | tail -50"
```

## 5. Se precisar voltar

- **Código:** voltar ao commit anterior no `/opt/nutri` e rodar o `deploy.sh` de novo.
- **Banco:** as migrações só acrescentam tabelas e colunas, e o código antigo ignora o que não conhece. Para desfazer de verdade, use o `pg_dump` feito pelo deploy. Cada migração descreve a própria reversão no cabeçalho.

## 6. Depois

- Pedir ao técnico e ao nutricionista o teste de aceite (documento de aprovação em `Downloads\Arquivos`).
- O educador cadastra os próprios alunos e planos. Alunos sem contrato do Treino não são bloqueados (S3).
