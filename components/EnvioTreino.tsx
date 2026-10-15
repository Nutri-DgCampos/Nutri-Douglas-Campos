"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";

export type TreinoEnviado = {
  id: string;
  status: "pendente" | "processando" | "concluido" | "falhou";
  file_name: string | null;
  created_at: string;
};

const TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

const ACEITOS = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.txt," + Object.keys(TIPOS).join(",");

// Tipo pelo conteúdo informado pelo navegador ou, na falta dele, pela extensão.
function extensaoDoArquivo(arquivo: File) {
  if (TIPOS[arquivo.type]) return TIPOS[arquivo.type];

  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  return extensao === "jpeg" ? "jpg" : Object.values(TIPOS).includes(extensao) ? extensao : null;
}

// Envio do treino pelo paciente. A IA organiza por dia da semana.
export default function EnvioTreino({ pacienteId }: { pacienteId: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [treino, setTreino] = useState<TreinoEnviado | null | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await api
      .from("treinos")
      .select("id, status, file_name, created_at")
      .eq("patient_id", pacienteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setTreino((data as TreinoEnviado | null) ?? null);
  }, [pacienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Acompanha a leitura pela IA.
  const lendo = treino?.status === "pendente" || treino?.status === "processando";

  useEffect(() => {
    if (!lendo) return;

    const intervalo = setInterval(carregar, 4000);
    return () => clearInterval(intervalo);
  }, [lendo, carregar]);

  async function registrar(corpo: Record<string, string>) {
    const resposta = await fetch("/api/treinos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => null);
      throw new Error(resultado?.erro ?? "Não foi possível registrar o treino.");
    }

    avisar("Treino enviado! Estamos organizando por dia da semana.", "success");
    await carregar();
  }

  async function enviarArquivo(arquivo: File) {
    const extensao = extensaoDoArquivo(arquivo);

    if (!extensao) {
      avisar("Envie o treino em PDF, Word, Excel, imagem (JPG ou PNG) ou texto.", "warn");
      return;
    }

    if (arquivo.size > 20 * 1024 * 1024) {
      avisar("O arquivo deve ter no máximo 20 MB.", "warn");
      return;
    }

    setEnviando(true);

    try {
      const caminho = `${pacienteId}/${crypto.randomUUID()}.${extensao}`;
      const tipo = Object.entries(TIPOS).find(([, valor]) => valor === extensao)![0];

      const { error } = await api.storage
        .from("treinos")
        .upload(caminho, arquivo, { contentType: tipo });

      if (error) throw new Error(error.message);

      await registrar({ caminho, nome: arquivo.name });
    } catch (erro) {
      console.error("Erro ao enviar treino:", erro);
      avisar("Não foi possível enviar o treino. Tente novamente.", "error");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function enviarTexto() {
    if (texto.trim().length < 10) {
      avisar("Cole o texto do seu treino.", "warn");
      return;
    }

    setEnviando(true);

    try {
      await registrar({ texto });
      setColando(false);
      setTexto("");
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : "Não foi possível enviar o treino.", "error");
    } finally {
      setEnviando(false);
    }
  }

  async function tentarDeNovo() {
    if (!treino) return;

    await fetch(`/api/treinos/${treino.id}/analisar`, { method: "POST" });
    await carregar();
  }

  return (
    <section className="cartao mt-4 p-4">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <i className="pi pi-bolt text-lg" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900">Treino</h2>
          <p className="text-sm text-gray-500">
            {lendo
              ? "Organizando seu treino por dia da semana..."
              : treino?.status === "concluido"
                ? "Seu treino organizado, com volume e gasto estimado."
                : treino?.status === "falhou"
                  ? "Não conseguimos ler o treino enviado."
                  : "Anexe seu treino para organizarmos por dia da semana."}
          </p>
        </div>
      </div>

      <input
        ref={entrada}
        type="file"
        accept={ACEITOS}
        className="sr-only"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) enviarArquivo(arquivo);
        }}
      />

      {lendo ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
          <i className="pi pi-spin pi-spinner" aria-hidden />
          Lendo o treino, isso leva alguns segundos.
        </div>
      ) : (
        <>
          {treino?.status === "concluido" && (
            <Link href="/area-paciente/treino" className="p-button mt-4 flex w-full justify-center gap-2 font-bold">
              <i className="pi pi-list" aria-hidden />
              Ver meu treino
            </Link>
          )}

          {treino?.status === "falhou" && (
            <Button
              type="button"
              icon="pi pi-refresh"
              label="Tentar ler novamente"
              className="mt-4 w-full"
              onClick={tentarDeNovo}
            />
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              icon="pi pi-upload"
              label={enviando ? "Enviando..." : treino ? "Novo arquivo" : "Anexar treino"}
              loading={enviando}
              outlined
              onClick={() => entrada.current?.click()}
            />
            <Button
              type="button"
              icon="pi pi-clipboard"
              label="Colar texto"
              outlined
              disabled={enviando}
              onClick={() => setColando(true)}
            />
          </div>

          <p className="mt-2 text-center text-xs text-gray-500">PDF, Word, Excel, foto ou texto copiado.</p>
        </>
      )}

      <Dialog
        header="Colar treino"
        visible={colando}
        onHide={() => !enviando && setColando(false)}
        className="w-[36rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined onClick={() => setColando(false)} />
            <Button type="button" label="Enviar" icon="pi pi-send" loading={enviando} onClick={enviarTexto} />
          </div>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          Cole aqui o treino que você recebeu (por mensagem, e-mail ou aplicativo).
        </p>
        <InputTextarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={10}
          autoResize={false}
          maxLength={30000}
          className="w-full"
          placeholder={"Treino A - Peito\nSupino reto 4x10\nCrucifixo 3x12..."}
        />
      </Dialog>
    </section>
  );
}
