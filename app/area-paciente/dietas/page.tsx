"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import DietaEmTela from "@/components/DietaEmTela";

export default function MinhasDietasPage() {
  const [dietas, setDietas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDietas() {
      const { data: usuario } = await api.auth.getUser();

      if (!usuario.user) {
        window.location.href = "/login";
        return;
      }

      const { data: paciente, error: erroPaciente } = await api
        .from("patients")
        .select("id")
        .eq("auth_user_id", usuario.user.id)
        .single();

      if (erroPaciente || !paciente) {
        console.error("Erro ao localizar paciente:", erroPaciente);
        setCarregando(false);
        return;
      }

      const { data, error } = await api
        .from("diet_deliveries")
        .select("id, diet_date, created_at")
        .eq("patient_id", paciente.id)
        .order("created_at", { ascending: false })
        .limit(2);

      if (error) {
        console.error("Erro ao carregar dietas:", error);
      } else {
  const entregas = data ?? [];

  const entregasComArquivos = await Promise.all(
    entregas.map(async (entrega) => {
      const { data: arquivos, error: erroArquivos } = await api
        .from("diet_delivery_files")
        .select("id, file_name, storage_path")
        .eq("delivery_id", entrega.id)
        .order("created_at", { ascending: true });

      if (erroArquivos) {
        console.error("Erro ao buscar PDFs:", erroArquivos);
      }

      return {
        ...entrega,
        arquivos: arquivos ?? [],
      };
    })
  );

  setDietas(entregasComArquivos);

const idsDietas = entregasComArquivos
  .filter((entrega) => entrega.arquivos.length > 0)
  .map((entrega) => entrega.id);

if (idsDietas.length > 0) {
  const { error: erroVisualizacao } = await api
    .from("patient_update_views")
    .upsert(
      idsDietas.map((id) => ({
        patient_id: paciente.id,
        update_type: "dieta",
        reference_id: id,
      })),
      {
        onConflict: "patient_id,update_type,reference_id",
        ignoreDuplicates: true,
      }
    );

  if (erroVisualizacao) {
    console.error(
      "Erro ao registrar visualização das dietas:",
      erroVisualizacao
    );
  }
}
}

      setCarregando(false);
    }

    carregarDietas();
  }, []);

  async function abrirPDF(caminhoArquivo: string) {
  const { data, error } = await api.storage
    .from("dietas")
    .createSignedUrl(caminhoArquivo, 60);

  if (error || !data?.signedUrl) {
    console.error("Erro ao abrir PDF:", error);
    avisar("Não foi possível abrir o PDF.");
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina
          titulo="Meu plano"
          descricao="As dietas mais recentes enviadas pelo seu nutricionista."
        />

        <DietaEmTela />

        {carregando ? (
          <div className="mt-6 space-y-4">
            <Skeleton height="8rem" borderRadius="16px" />
            <Skeleton height="8rem" borderRadius="16px" />
          </div>
        ) : dietas.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-book text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">
              Nenhuma dieta recebida até o momento.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Quando o nutricionista enviar seu plano, ele aparece aqui.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {dietas.map((dieta, index) => (
              <section key={dieta.id} className="cartao p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-900">
                    Dieta {index + 1}
                  </h2>

                  {index === 0 && <Tag value="Mais recente" severity="success" />}
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Data da dieta: {dieta.diet_date.split("-").reverse().join("/")}
                </p>

                <div className="mt-4 space-y-2">
                  {dieta.arquivos?.length > 0 ? (
                    dieta.arquivos.map((arquivo: any) => (
                      <div
                        key={arquivo.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"
                      >
                        <i
                          className="pi pi-file-pdf text-xl text-primary-700"
                          aria-hidden
                        />

                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                          {arquivo.file_name}
                        </span>

                        <Button
                          type="button"
                          label="Abrir PDF"
                          size="small"
                          onClick={() => abrirPDF(arquivo.storage_path)}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">
                      Nenhum PDF encontrado nesta entrega.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
