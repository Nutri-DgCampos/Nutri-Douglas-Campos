"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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
    alert("Não foi possível abrir o PDF.");
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-md">
        <button
  type="button"
  onClick={() => (window.location.href = "/area-paciente")}
  className="mb-6 flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-gray-700 shadow-sm transition hover:bg-gray-200"
>
  ← Voltar
</button>
        <h1 className="text-2xl font-bold text-gray-900">
          Meus arquivos
        </h1>

        <p className="mt-2 text-gray-600">
          Consulte suas atualizações.
        </p>

        {carregando ? (
          <p className="mt-6 text-gray-600">Carregando dietas...</p>
        ) : (
          <div className="mt-6 space-y-4">
  {dietas.length === 0 ? (
    <p className="text-gray-600">
      Nenhuma dieta recebida até o momento.
    </p>
  ) : (
    dietas.map((dieta, index) => (
      <div
        key={dieta.id}
        className="rounded-2xl bg-white p-5 shadow-sm"
      >
        <h2 className="font-bold text-gray-900">
          Dieta {index + 1}
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Data da dieta:{" "}
          {dieta.diet_date.split("-").reverse().join("/")}
        </p>

        <div className="mt-4 space-y-2">
          {dieta.arquivos?.length > 0 ? (
            dieta.arquivos.map((arquivo: any) => (
              <div
                key={arquivo.id}
                className="rounded-xl border border-gray-200 p-3"
              >
                <span className="text-sm text-gray-800">
                  📄 {arquivo.file_name}
                </span>
                <button
  type="button"
  onClick={() => abrirPDF(arquivo.storage_path)}
  className="mt-3 block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
>
  Abrir PDF
</button>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              Nenhum PDF encontrado nesta entrega.
            </p>
          )}
        </div>
      </div>
    ))
  )}
</div>
        )}
      </div>
    </main>
  );
}