
"use client";


import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";


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
      avisar("Selecione um comprovante primeiro.");
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
      avisar("Selecione um PDF, JPG ou PNG de até 20 MB.");
      return;
    }

    setEnviandoComprovante(true);

    try {
      const { data: authData, error: authError } =
        await api.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Paciente não autenticado.");
      }

      const { data: paciente, error: pacienteError } =
        await api
          .from("patients")
          .select("id")
          .eq("auth_user_id", authData.user.id)
          .single();

      if (pacienteError || !paciente) {
        throw new Error("Cadastro do paciente não encontrado.");
      }

      const { data: pagamento, error: pagamentoError } =
  await api
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

      const { error: uploadError } = await api.storage
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

      const { error: atualizarError } = await api
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
      avisar("Comprovante enviado com sucesso!");
    } catch (erro) {
      console.error(erro);
      avisar(
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
        await api.auth.getUser();

      if (erroUsuario || !usuario.user) {
        setErroHistorico("Não foi possível identificar o paciente.");
        setCarregandoHistorico(false);
        return;
      }

      const { data, error } = await api
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
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina
          titulo="Pagamentos"
          descricao="Envie seu comprovante e acompanhe seus pagamentos."
        />

        <section className="cartao mt-6 p-5">
          <h2 className="text-lg font-bold text-gray-900">Enviar comprovante</h2>

          <label
            htmlFor="arquivo-comprovante"
            className={`mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition ${
              arquivoComprovante
                ? "border-primary-400 bg-primary-50"
                : "border-gray-300 hover:border-primary-400 hover:bg-gray-50"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700">
              <i
                className={`pi ${arquivoComprovante ? "pi-check" : "pi-upload"} text-lg`}
                aria-hidden
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-gray-900">
                {arquivoComprovante
                  ? arquivoComprovante.name
                  : "Selecionar comprovante"}
              </span>
              <span className="block text-sm text-gray-500">
                PDF, JPG ou PNG. Máximo de 20 MB.
              </span>
            </span>

            <input
              id="arquivo-comprovante"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={(e) => {
                const arquivo = e.target.files?.[0] ?? null;

                if (arquivo && arquivo.size > 20 * 1024 * 1024) {
                  avisar("O arquivo deve ter no máximo 20 MB.");
                  e.target.value = "";
                  setArquivoComprovante(null);
                  return;
                }

                setArquivoComprovante(arquivo);
              }}
            />
          </label>

          <Button
            type="button"
            onClick={enviarComprovante}
            disabled={!arquivoComprovante}
            loading={enviandoComprovante}
            label={
              enviandoComprovante ? "Enviando comprovante..." : "Enviar comprovante"
            }
            className="mt-4 w-full"
          />
        </section>

        <section className="cartao mt-4 p-5">
          <h2 className="text-lg font-bold text-gray-900">
            Histórico de pagamentos
          </h2>

          {carregandoHistorico ? (
            <Skeleton height="3.5rem" borderRadius="12px" className="mt-4" />
          ) : erroHistorico ? (
            <Message
              severity="error"
              text={erroHistorico}
              className="mt-4 w-full justify-start"
            />
          ) : historico.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              Nenhum pagamento confirmado até o momento.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-200">
              {historico.map((pagamento) => {
                const confirmado = pagamento.status === "confirmado";
                const data = confirmado
                  ? pagamento.confirmed_at
                  : pagamento.receipt_uploaded_at;

                return (
                  <li
                    key={pagamento.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {confirmado ? "Pagamento confirmado" : "Comprovante enviado"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {data
                          ? new Date(data).toLocaleDateString("pt-BR")
                          : "data não informada"}
                        {!confirmado && ", aguardando confirmação do nutricionista"}
                      </p>
                    </div>

                    <Tag
                      value={confirmado ? "Confirmado" : "Em análise"}
                      severity={confirmado ? "success" : "warning"}
                      className="selo-status"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
