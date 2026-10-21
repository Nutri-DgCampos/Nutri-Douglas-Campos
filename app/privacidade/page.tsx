import type { Metadata } from "next";
import { linkWhatsApp } from "@/lib/contato";

export const metadata: Metadata = { title: "Política de privacidade" };

// Política de privacidade (pública). Inclui o uso de inteligência artificial
// decidido na validação da Fase 7 (7.3 e 7.5, opção B). Texto a revisar pelo
// advogado do cliente; ao mudar, atualizar a data da versão.
const VERSAO = "21/10/2026";

const SECOES: { titulo: string; paragrafos: string[] }[] = [
  {
    titulo: "Quem cuida dos seus dados",
    paragrafos: [
      "Este aplicativo é usado pelo nutricionista Douglas Campos para o seu acompanhamento nutricional. Ele é o responsável pelo tratamento dos dados aqui descritos.",
    ],
  },
  {
    titulo: "Quais dados usamos",
    paragrafos: [
      "Dados de cadastro e de contato (nome, e-mail, telefone, data de nascimento) e de acesso ao aplicativo.",
      "Dados de saúde do acompanhamento: peso, medidas, avaliações físicas, respostas da anamnese e do recordatório alimentar, exames enviados, relatórios semanais, fotos, treinos, dietas, orientações e prescrições.",
    ],
  },
  {
    titulo: "Para que usamos",
    paragrafos: [
      "Somente para o seu acompanhamento nutricional: avaliar, montar e ajustar o plano alimentar, acompanhar a sua evolução, enviar documentos e avisos pelo aplicativo e cuidar dos pagamentos do plano.",
    ],
  },
  {
    titulo: "Uso de inteligência artificial",
    paragrafos: [
      "Para apoiar o trabalho do nutricionista, o aplicativo usa um serviço de inteligência artificial (OpenAI). Os resultados são sempre revisados e aprovados pelo nutricionista; a inteligência artificial não toma decisões sobre o seu tratamento.",
      "No apoio à elaboração da dieta e no resumo da anamnese, vão somente dados sem identificação: sexo, idade, peso, altura, gasto energético, o plano alimentar, as metas e, quando o nutricionista escolhe, alergias, restrições e preferências da anamnese. O seu nome, contato e data de nascimento não são enviados.",
      "Na leitura do exame de sangue, do treino e do laudo de bioimpedância, o arquivo enviado vai para análise e pode conter o seu nome impresso.",
      "Pelas regras da OpenAI para esse tipo de uso, os dados enviados não são usados para treinar os modelos e ficam guardados por um período limitado para controle de abuso. O processamento pode ocorrer fora do Brasil.",
    ],
  },
  {
    titulo: "Com quem compartilhamos",
    paragrafos: [
      "Não vendemos nem cedemos os seus dados. Eles passam apenas pelos serviços necessários para o aplicativo funcionar: o servidor onde o aplicativo fica hospedado e o serviço de inteligência artificial descrito acima.",
    ],
  },
  {
    titulo: "Segurança e guarda",
    paragrafos: [
      "O acesso é protegido por senha, e cada pessoa vê somente o que lhe diz respeito. O sistema mantém cópias de segurança. Os dados ficam guardados enquanto durar o acompanhamento e pelo prazo exigido para registros de atendimento.",
    ],
  },
  {
    titulo: "Seus direitos",
    paragrafos: [
      "Você pode pedir a confirmação e o acesso aos seus dados, a correção de dados errados ou desatualizados, informações sobre o compartilhamento e, quando a lei permitir, a exclusão. Fale com o nutricionista pelos canais de atendimento.",
    ],
  },
];

export default function PrivacidadePage() {
  return (
    <div className="min-h-dvh bg-gray-100">
      <header className="bg-primary-900 px-5 pb-10 pt-[calc(2rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-3xl">
          <p className="font-[family-name:var(--fonte-titulo)] text-xl font-bold">Douglas Campos</p>
          <p className="text-sm text-white/65">Acompanhamento nutricional</p>
          <h1 className="mt-8 text-3xl font-bold leading-tight">Política de privacidade</h1>
          <p className="mt-2 text-sm text-white/70">Versão de {VERSAO}</p>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-3xl px-4 pb-16 sm:px-5">
        <div className="cartao space-y-6 p-5 sm:p-7">
          {SECOES.map((secao) => (
            <section key={secao.titulo}>
              <h2 className="text-lg font-bold text-gray-900">{secao.titulo}</h2>
              {secao.paragrafos.map((paragrafo) => (
                <p key={paragrafo.slice(0, 40)} className="mt-2 leading-relaxed text-gray-700">
                  {paragrafo}
                </p>
              ))}
            </section>
          ))}
          <p className="border-t border-gray-200 pt-4 text-sm text-gray-600">
            Dúvidas?{" "}
            <a href={linkWhatsApp("Olá! Tenho uma dúvida sobre a política de privacidade.")} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 underline">
              Fale com o nutricionista pelo WhatsApp
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
