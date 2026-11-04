"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Perfil = { nome: string; cref: string | null; telefone: string | null; email_contato: string | null; tem_logo: boolean };

// Perfil do educador físico (T6, R8): a identidade dos PDFs que ele gera
// (treinos, planilhas e avaliações físicas). Nome e CREF no rodapé; telefone
// e e-mail no cabeçalho; logotipo opcional.
export default function PerfilDoEducadorPage() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [salvando, setSalvando] = useState(false);
  const [versaoDoLogo, setVersaoDoLogo] = useState(0);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/treino/perfil", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPerfil(d?.perfil ?? null))
      .catch(() => setPerfil(null));
  }, []);

  async function salvar() {
    if (!perfil) return;
    setSalvando(true);
    const r = await fetch("/api/treino/perfil", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(perfil) }).catch(() => null);
    setSalvando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Não foi possível salvar.", "error");
      return;
    }
    setPerfil(d.perfil);
    avisar("Perfil salvo. Os próximos PDFs saem com estes dados.", "success");
  }

  async function enviarLogo(imagem: File) {
    const dados = new FormData();
    dados.append("arquivo", imagem);
    const r = await fetch("/api/treino/perfil/logo", { method: "POST", body: dados }).catch(() => null);
    if (!r?.ok) {
      avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível enviar o logotipo.", "error");
      return;
    }
    setPerfil((p) => (p ? { ...p, tem_logo: true } : p));
    setVersaoDoLogo((v) => v + 1);
    avisar("Logotipo salvo.", "success");
  }

  async function removerLogo() {
    if (!(await pedirConfirmacao("Remover o logotipo dos seus PDFs?", { aceitar: "Remover", rejeitar: "Cancelar" }))) return;
    const r = await fetch("/api/treino/perfil/logo", { method: "DELETE" }).catch(() => null);
    if (r?.ok) setPerfil((p) => (p ? { ...p, tem_logo: false } : p));
  }

  const campo = (rotulo: string, chave: keyof Omit<Perfil, "tem_logo">, limite: number, placeholder?: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{rotulo}</span>
      <InputText
        value={(perfil?.[chave] as string | null) ?? ""}
        maxLength={limite}
        placeholder={placeholder}
        onChange={(e) => setPerfil((p) => (p ? { ...p, [chave]: e.target.value } : p))}
        className="w-full"
        aria-label={rotulo}
      />
    </label>
  );

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <CabecalhoPagina titulo="Meu perfil" descricao="Seus dados nos PDFs de treino, planilhas e avaliações físicas que você gera." />
        {perfil === undefined ? (
          <Skeleton height="16rem" borderRadius="16px" />
        ) : perfil === null ? (
          <div className="cartao p-6 text-center text-sm text-gray-600">O perfil é do educador físico. O administrador usa a identidade visual da clínica, em Configurações.</div>
        ) : (
          <>
            <section className="cartao space-y-3 p-5">
              {campo("Nome", "nome", 120)}
              <div className="grid gap-3 sm:grid-cols-2">
                {campo("CREF", "cref", 30, "Ex.: 123456-G/SP")}
                {campo("Telefone", "telefone", 30)}
              </div>
              {campo("E-mail de contato", "email_contato", 120)}
              <div className="flex justify-end">
                <Button type="button" icon="pi pi-check" label="Salvar" loading={salvando} onClick={salvar} />
              </div>
            </section>
            <section className="cartao space-y-3 p-5" aria-label="Logotipo">
              <h2 className="font-bold text-gray-900">Logotipo (opcional)</h2>
              <p className="text-sm text-gray-500">PNG ou JPG, até 5 MB. Aparece no topo dos seus PDFs.</p>
              {perfil.tem_logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/treino/perfil/logo?v=${versaoDoLogo}`} alt="Seu logotipo" className="max-h-24 max-w-xs rounded border border-gray-200 bg-white object-contain p-2" />
              ) : null}
              <input
                ref={arquivo}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                aria-label="Arquivo do logotipo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void enviarLogo(f);
                }}
              />
              <div className="flex gap-2">
                <Button type="button" icon="pi pi-upload" label={perfil.tem_logo ? "Trocar logotipo" : "Enviar logotipo"} outlined onClick={() => arquivo.current?.click()} />
                {perfil.tem_logo ? <Button type="button" label="Remover" text severity="danger" onClick={removerLogo} /> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
