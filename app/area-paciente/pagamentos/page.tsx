
"use client";


import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";


export default function PagamentosPacientePage() {
    
  const [historico, setHistorico] = useState<
  {
    id: string;
    status: string;
    confirmed_at: string | null;
    receipt_uploaded_at: string | null;
  }[]
>([]);

  const [carregandoHistorico, setCarregandoHistorico] =
    useState(true);

  const [erroHistorico, setErroHistorico] = useState("");
  
  const [arquivoComprovante, setArquivoComprovante] =
    useState<File | null>(null);

    
  const [enviandoComprovante, setEnviandoComprovante] =
    useState(false);

  async function enviarComprovante() {
    if (!arquivoComprovante) {
      alert("Selecione um comprovante primeiro.");
      return;
    }

    const tiposPermitidos = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (
      !tiposPermitidos.includes(arquivoComprovante.type) ||
      arquivoComprovante.size > 20 * 1024 * 1024
    ) {
      alert("Selecione um PDF, JPG ou PNG de até 20 MB.");
      return;
    }

    setEnviandoComprovante(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Paciente não autenticado.");
      }

      const { data: paciente, error: pacienteError } =
        await supabase
          .from("patients")
          .select("id")
          .eq("auth_user_id", authData.user.id)
          .single();

      if (pacienteError || !paciente) {
        throw new Error("Cadastro do paciente não encontrado.");
      }

      const { data: pagamento, error: pagamentoError } =
  await supabase
    .from("payments")
    .select("id")
    .eq("patient_id", paciente.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

      if (pagamentoError || !pagamento) {
        throw new Error("Pagamento pendente não encontrado.");
      }

      const extensao =
        arquivoComprovante.type === "application/pdf"
          ? "pdf"
          : arquivoComprovante.type === "image/png"
            ? "png"
            : "jpg";

      const caminho =
        `${authData.user.id}/${pagamento.id}/${crypto.randomUUID()}.${extensao}`;

      const { error: uploadError } = await supabase.storage
        .from("comprovantes")
        .upload(caminho, arquivoComprovante, {
          contentType: arquivoComprovante.type,
          upsert: false,
        });

      if (uploadError) {
  console.error("Erro no Storage:", uploadError);

  throw new Error(
    `Não foi possível enviar o arquivo: ${uploadError.message}`
  );
}

      const { error: atualizarError } = await supabase
        .from("payments")
        .update({
          status: "comprovante_enviado",
          receipt_file_path: caminho,
          receipt_uploaded_at: new Date().toISOString(),
        })
        .eq("id", pagamento.id)
        .eq("status", "pendente");

      if (atualizarError) {
        throw new Error(
          "Arquivo enviado, mas não foi possível registrar o pagamento."
        );
      }

      setArquivoComprovante(null);
      alert("Comprovante enviado com sucesso!");
    } catch (erro) {
      console.error(erro);
      alert(
        erro instanceof Error
          ? erro.message
          : "Erro ao enviar comprovante."
      );
    } finally {
      setEnviandoComprovante(false);
    }
  }



  
  useEffect(() => {
    async function carregarHistorico() {
      setCarregandoHistorico(true);
      setErroHistorico("");

      const { data: usuario, error: erroUsuario } =
        await supabase.auth.getUser();

      if (erroUsuario || !usuario.user) {
        setErroHistorico("Não foi possível identificar o paciente.");
        setCarregandoHistorico(false);
        return;
      }

      const { data, error } = await supabase
  .from("payments")
  .select("id, status, confirmed_at, receipt_uploaded_at")
  .in("status", ["confirmado", "comprovante_enviado"])
  .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setErroHistorico("Não foi possível carregar o histórico.");
      } else {
        setHistorico(data ?? []);
      }

      setCarregandoHistorico(false);
    }

    carregarHistorico();
  }, []);


  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900">
          Pagamentos
          
<button
  type="button"
  onClick={() => window.location.assign("/area-paciente")}
  className="mb-6 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-200"
>
  ← Voltar
</button>

        </h1>

        <p className="mt-2 text-gray-600">
          Envie seu comprovante e acompanhe seus pagamentos.
        </p>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Enviar comprovante
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Anexe seu comprovante de pagamento.
          </p>

          
<div className="mt-4">
  <label
    htmlFor="arquivo-comprovante"
    className="mb-2 block text-sm font-semibold text-gray-700"
  >
    Selecionar comprovante
  </label>

  <input
    id="arquivo-comprovante"
    type="file"
    accept=".pdf,.jpg,.jpeg,.png"
    onChange={(e) => {
      const arquivo = e.target.files?.[0] ?? null;

      if (arquivo && arquivo.size > 20 * 1024 * 1024) {
        alert("O arquivo deve ter no máximo 20 MB.");
        e.target.value = "";
        setArquivoComprovante(null);
        return;
      }

      setArquivoComprovante(arquivo);
    }}
    className="block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-700"
  />

  {arquivoComprovante && (
    <p className="mt-3 text-sm text-green-700">
      ✓ Arquivo selecionado: {arquivoComprovante.name}
    </p>
  )}

  <p className="mt-2 text-xs text-gray-500">
    Formatos aceitos: PDF, JPG e PNG. Máximo de 20 MB.
  </p>
</div>

<button
  type="button"
  onClick={enviarComprovante}
  disabled={!arquivoComprovante || enviandoComprovante}
  className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
>
  {enviandoComprovante
    ? "Enviando comprovante..."
    : "Enviar comprovante"}
</button>


        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Histórico de pagamentos
          </h2>

          
{carregandoHistorico ? (
  <p className="mt-3 text-sm text-gray-500">
    Carregando histórico...
  </p>
) : erroHistorico ? (
  <p className="mt-3 text-sm text-red-600">
    {erroHistorico}
  </p>
) : historico.length === 0 ? (
  <p className="mt-3 text-sm text-gray-500">
    Nenhum pagamento confirmado até o momento.
  </p>
) : (
  <div className="mt-4 space-y-3">
  {historico.map((pagamento) => {
    const confirmado = pagamento.status === "confirmado";

    return (
      <div
        key={pagamento.id}
        className={`rounded-lg border p-4 ${
          confirmado
            ? "border-green-200 bg-green-50"
            : "border-yellow-200 bg-yellow-50"
        }`}
      >
        {confirmado ? (
          <p className="text-sm font-semibold text-green-700">
            ✓ Pagamento confirmado em{" "}
            {pagamento.confirmed_at
              ? new Date(pagamento.confirmed_at).toLocaleDateString("pt-BR")
              : "data não informada"}
          </p>
        ) : (
          <p className="text-sm font-semibold text-yellow-800">
            ⏳ Comprovante enviado em{" "}
            {pagamento.receipt_uploaded_at
              ? new Date(pagamento.receipt_uploaded_at).toLocaleDateString("pt-BR")
              : "data não informada"}
            {" — "}aguardando confirmação do nutricionista.
          </p>
        )}
      </div>
    );
  })}
</div>
)}

        </div>
      </div>
    </main>
  );
}
