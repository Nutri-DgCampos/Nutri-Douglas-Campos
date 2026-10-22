import { redirect } from "next/navigation";

// As avaliações físicas passaram para a aba Dietas (seção "Avaliações
// Físicas"); links e avisos antigos continuam funcionando.
export default function AvaliacoesPage() {
  redirect("/area-paciente/dietas");
}
