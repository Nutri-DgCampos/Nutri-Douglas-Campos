"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import PainelTreino, { type RegistroDoDia } from "@/components/PainelTreino";
import AtividadesDoAluno from "@/components/treino/AtividadesDoAluno";
import FilaDoTreino from "@/components/treino/FilaDoTreino";
import PlanoDoAluno from "@/components/treino/PlanoDoAluno";
import { avisar } from "@/lib/avisos";
import { DIAS, planoComRegistros, type ChaveDia, type RelatoDeDesconforto, type ExercicioRegistrado, type PlanoDeTreino, type SessaoRegistrada } from "@/lib/treino";
import { aoEnviar, buscarComCopia, enviarOuGuardar, guardarDados } from "@/lib/treinoOffline";

type Treino = {
  prescricao: { id: string; origem: "externa" | "profissional"; plano: PlanoDeTreino };
  datas: Record<ChaveDia, string>;
  sessoes: Partial<Record<ChaveDia, SessaoRegistrada>>;
  ultimos: Record<string, Record<number, ExercicioRegistrado>>;
  anteriores: Partial<Record<ChaveDia, Record<number, { carga_kg: number; data: string }>>>;
};

type Resposta = { treino: Treino | null; caloriasInformadas: number | null; bloqueado?: boolean };

const CHAVE = "meu-treino";

// Treino do aluno por dia: o que ele informa (séries, repetições, carga,
// descanso, situação, calorias e observação) é registrado na semana, sem
// alterar o treino prescrito. Corrida e ciclismo têm registro próprio (T4b).
// Sem internet (T5): mostra a última cópia guardada no aparelho, e os
// registros ficam na fila até a conexão voltar.
export default function TreinoPacientePage() {
  const router = useRouter();
  const [dados, setDados] = useState<Resposta | null | undefined>(undefined);
  const [copiaDe, setCopiaDe] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const buscar = useCallback(() => buscarComCopia<Resposta>("/api/area-paciente/treino", CHAVE), []);
  const aplicar = useCallback((r: Awaited<ReturnType<typeof buscar>>) => {
    setDados(r?.dados ?? { treino: null, caloriasInformadas: null });
    setCopiaDe(r?.copiaDe ?? null);
  }, []);

  useEffect(() => {
    buscar().then(aplicar);
    // A fila enviou: os dados do servidor passam a valer de novo.
    return aoEnviar(() => {
      buscar().then(aplicar);
      setVersao((v) => v + 1);
    });
  }, [buscar, aplicar]);

  const treino = dados?.treino ?? null;

  async function registrar(registro: RegistroDoDia) {
    if (!treino) return false;
    const resultado = await enviarOuGuardar<Resposta>({
      tipo: "registro_musculacao",
      url: "/api/area-paciente/treino",
      metodo: "PUT",
      corpo: { ...registro, prescricaoId: treino.prescricao.id, dataPlanejada: treino.datas[registro.dia], registradaEm: new Date().toISOString() },
      descricao: `treino de ${DIAS.find((d) => d.chave === registro.dia)?.nome.toLowerCase()}`,
    });

    if (resultado.ok === false) {
      avisar(resultado.erro, "error");
      return false;
    }
    if (resultado.ok === "na_fila") {
      // Mostra já o que o aluno registrou; o servidor confirma quando a
      // internet voltar.
      const atual = treino.sessoes[registro.dia];
      const sessao: SessaoRegistrada = {
        id: atual?.id ?? `local-${registro.dia}`,
        dia: registro.dia,
        data_planejada: treino.datas[registro.dia],
        situacao: registro.situacao,
        data_efetiva: registro.dataEfetiva,
        motivo: registro.motivo,
        observacao: registro.observacao,
        kcal: registro.kcal,
        atualizado_em: new Date().toISOString(),
        exercicios: registro.exercicios,
      };
      const novo: Resposta = { ...dados!, treino: { ...treino, sessoes: { ...treino.sessoes, [registro.dia]: sessao } } };
      setDados(novo);
      void guardarDados(CHAVE, novo);
      avisar("Sem internet: o registro ficou guardado no aparelho e será enviado sozinho quando a conexão voltar.", "warn");
      return true;
    }
    setDados(resultado.dados);
    setCopiaDe(null);
    void guardarDados(CHAVE, resultado.dados);
    avisar("Treino registrado.", "success");
    return true;
  }

  // Devolve null quando gravado, "na_fila" quando ficou no aparelho, ou a
  // mensagem de erro. Sem conexão, nunca afirma que o profissional foi avisado.
  async function relatarDesconforto(relato: RelatoDeDesconforto) {
    const resultado = await enviarOuGuardar({
      tipo: "desconforto",
      url: "/api/area-paciente/treino/desconforto",
      metodo: "POST",
      corpo: relato,
      descricao: `relato de desconforto (${relato.regiao})`,
    });
    if (resultado.ok === "na_fila") return "na_fila";
    return resultado.ok ? null : resultado.erro;
  }

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md lg:max-w-5xl">
        <BotaoVoltar rotulo="Voltar para o início" onClick={() => router.push("/area-paciente")} />

        <CabecalhoPagina
          titulo="Meu treino"
          descricao="Toque em um dia para ver os exercícios e ajustar séries, repetições, carga e descanso. Corridas e pedais ficam logo abaixo."
        />

        <div className="mt-6 space-y-4">
          <FilaDoTreino copiaDe={copiaDe} />

          <PlanoDoAluno />

          {dados === undefined ? (
            <Skeleton height="24rem" borderRadius="16px" />
          ) : dados?.bloqueado ? (
            <div className="cartao p-6 text-center">
              <i className="pi pi-lock text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">Treino da semana indisponível até a renovação do plano.</p>
              <p className="mt-1 text-sm text-gray-500">Relatórios e devolutivas continuam disponíveis. Fale com o seu profissional.</p>
            </div>
          ) : !treino ? (
            <div className="cartao p-6 text-center">
              <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">Nenhum treino de musculação organizado ainda.</p>
              <p className="mt-1 text-sm text-gray-500">Anexe seu treino na tela inicial ou aguarde o envio do seu profissional.</p>
            </div>
          ) : (
            <PainelTreino
              plano={planoComRegistros(treino.prescricao.plano, treino.ultimos)}
              prescricao={treino.prescricao.plano}
              sessoes={treino.sessoes}
              anteriores={treino.anteriores}
              datas={treino.datas}
              onRegistrar={registrar}
              onRelatarDesconforto={relatarDesconforto}
              caloriasInformadas={dados?.caloriasInformadas ?? null}
            />
          )}

          {dados !== undefined ? (
            <AtividadesDoAluno key={versao} onRelatarDesconforto={relatarDesconforto} onAlterado={() => buscar().then(aplicar)} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
