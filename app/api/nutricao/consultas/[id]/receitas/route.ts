import fs from "node:fs/promises";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { resolverCaminho } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao } from "@/lib/servidor/pdf/documento";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Registra uma receita já gravada no bucket "receitas" (pasta do paciente).
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const dados = await request.json().catch(() => null);
  const c = await obterPool().query<{ patient_id: string }>("select patient_id from public.consultas where id = $1", [id]);
  if (!c.rows[0]) return recusar("Consulta não encontrada.", 404);
  const caminho = typeof dados?.caminho === "string" ? dados.caminho : "";
  const destino = resolverCaminho("receitas", caminho);
  if (!destino || !caminho.startsWith(`${c.rows[0].patient_id}/`)) return recusar("Arquivo inválido.", 400);
  try {
    await fs.access(destino);
  } catch {
    return recusar("Arquivo não encontrado.", 400);
  }
  const nome = typeof dados?.nome === "string" && dados.nome.trim() ? dados.nome.trim().slice(0, 200) : "receita";
  const prescritor = typeof dados?.prescritor === "string" ? dados.prescritor.slice(0, 200) : "";
  const r = await obterPool().query<{ id: string }>(
    "insert into public.receitas (patient_id, consulta_id, file_name, storage_path, prescritor, criada_por) values ($1, $2, $3, $4, $5, $6) returning id",
    [c.rows[0].patient_id, id, nome, caminho, prescritor, contexto.usuarioId]
  );
  return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
}

// "Baixar todas as receitas": ZIP com as receitas desta consulta, uma vez cada.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const receitas = await obterPool().query<{ file_name: string; storage_path: string }>(
    "select file_name, storage_path from public.receitas where consulta_id = $1 order by criada_em",
    [id]
  );
  if (!receitas.rowCount) return recusar("Nenhuma receita nesta consulta.", 404);
  const zip = new JSZip();
  const usados = new Set<string>();
  const faltando: string[] = [];
  for (const r of receitas.rows) {
    const destino = resolverCaminho("receitas", r.storage_path);
    try {
      if (!destino) throw new Error();
      let nome = r.file_name.replace(/[\\/:*?"<>|]/g, "");
      const extensao = r.storage_path.split(".").pop();
      if (!nome.toLowerCase().endsWith(`.${extensao}`)) nome += `.${extensao}`;
      let final = nome;
      for (let n = 2; usados.has(final); n++) final = nome.replace(/(\.[^.]+)$/, ` (${n})$1`);
      usados.add(final);
      zip.file(final, await fs.readFile(destino));
    } catch {
      faltando.push(r.file_name);
    }
  }
  if (faltando.length === receitas.rowCount) return recusar("Não foi possível ler as receitas.", 500);
  if (faltando.length) zip.file("LEIA-ME.txt", `Não foi possível incluir: ${faltando.join(", ")}`);
  const conteudo = await zip.generateAsync({ type: "uint8array" });
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disposicao("Receitas.zip", true),
      "Cache-Control": "private, no-store",
    },
  });
}
