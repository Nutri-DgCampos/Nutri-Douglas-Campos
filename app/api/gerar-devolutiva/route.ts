import OpenAI from "openai";
import { NextResponse } from "next/server";
import { exigirNutricionista } from "@/lib/servidor/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    // Criado a cada chamada: a chave só existe em tempo de execução, não no build.
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const dados = await request.json();

    const resposta = await openai.responses.create({
  model: "gpt-5.4-mini",
  input: `
Você é um assistente de um nutricionista e deve escrever uma devolutiva semanal para o paciente.

Use somente as informações fornecidas abaixo.
Não invente informações.
Não altere pontuações, classificações ou conclusões já calculadas pelo sistema.
Escreva em português do Brasil.
Use linguagem acolhedora, profissional, clara e objetiva.
Fale diretamente com o paciente.
Valorize os pontos positivos, mas dê atenção clara ao que precisa melhorar.
Quando houver relação útil entre diferentes informações, conecte-as de forma natural.
Considere a pontuação e a classificação geral para definir o tom da devolutiva.
Se a classificação indicar baixa adesão ou atenção, reconheça os acertos, mas deixe claro que o resultado geral da semana precisa melhorar.
Não minimize pontos de atenção apenas porque existem pontos positivos.
Ao relacionar fatores, use linguagem prudente, como "pode contribuir", "pode estar relacionado" ou "pode influenciar", evitando afirmar causalidade com certeza.
Quando houver refeição fora do plano e o paciente informar quais alimentos consumiu e suas quantidades, estime aproximadamente as calorias consumidas nessa refeição e deixe sempre explícito que o valor é apenas uma estimativa. Se as informações fornecidas forem insuficientes para uma estimativa razoável, não invente quantidades nem calorias. Quando a estimativa for inferior a 500 kcal, explique de forma tranquilizadora que, embora tenha sido uma refeição fora do planejamento, esse episódio isolado tende a ter impacto limitado no resultado geral quando o restante do plano é seguido adequadamente. Quando a estimativa for igual ou superior a 500 kcal, sinalize com prudência que esse consumo representa um aporte energético mais relevante e, especialmente se ocorrer com frequência, pode comprometer a evolução e os resultados do planejamento alimentar. Não trate 500 kcal como um limite clínico exato nem afirme que uma única refeição determina o resultado da semana.Não prometa que o nutricionista fará ajustes, mudanças ou intervenções futuras.
Não diga "vamos ajustar", "vou ajustar" ou expressões semelhantes.
Não faça diagnóstico médico.
Não prescreva medicamentos.
Não mencione que você é uma inteligência artificial.
Escreva uma mensagem curta, adequada para ser enviada por WhatsApp.
Não use título.
Não utilize formatação Markdown.
Não utilize asteriscos, hashtags ou símbolos para destacar palavras.
Escreva todo o conteúdo em texto simples, pronto para ser enviado ao paciente.

Paciente: ${dados.paciente}
Pontuação de adesão: ${dados.pontuacao}/100
Classificação da adesão: ${dados.classificacao}

Pontos positivos:
${dados.pontosPositivos?.length
  ? dados.pontosPositivos.map((ponto: string) => `- ${ponto}`).join("\n")
  : "- Nenhum ponto positivo destacado pelo sistema."}

Pontos de atenção:
${dados.pontosAtencao?.length
  ? dados.pontosAtencao.map((ponto: string) => `- ${ponto}`).join("\n")
  : "- Nenhum ponto de atenção destacado pelo sistema."}

  Refeições fora do plano:
Quantidade: ${dados.offPlanCount ?? "Não informado"}
Alimentos e quantidades informados: ${dados.offPlanFoods || "Não informado"}

Observações escritas pelo paciente:
${dados.observacoes || "Nenhuma observação adicional."}
`,
});

        const mensagemWhatsApp = `

💚 Ficou com alguma dúvida sobre sua devolutiva ou precisa de alguma orientação? Estou à disposição!

📲 Fale comigo pelo WhatsApp:
https://wa.me/551499106600`;

    const devolutivaFinal =
      resposta.output_text.trim() + mensagemWhatsApp;

    return NextResponse.json({
      texto: devolutivaFinal,
    });
  } catch (error) {
  console.error("Erro ao gerar devolutiva:", error);

  const mensagem =
    error instanceof Error
      ? error.message
      : String(error);

  return NextResponse.json(
    {
      erro: "Não foi possível gerar a devolutiva.",
      detalhe: mensagem,
    },
    { status: 500 }
  );
}
}