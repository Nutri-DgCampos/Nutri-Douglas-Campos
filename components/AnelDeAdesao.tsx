// Anel que mostra o score de adesão (0 a 100): o número central do acompanhamento.

type Props = {
  valor: number | null;
  tamanho?: number;
  // Sobre fundo escuro (painel de entrada) as cores se invertem.
  claro?: boolean;
  rotulo?: string;
};

export function corDoScore(valor: number) {
  if (valor >= 80) return "#0e6b56";
  if (valor >= 60) return "#e8791d";
  return "#c8372d";
}

export default function AnelDeAdesao({
  valor,
  tamanho = 120,
  claro = false,
  rotulo = "de adesão",
}: Props) {
  const espessura = Math.max(6, Math.round(tamanho * 0.085));
  const raio = (tamanho - espessura) / 2;
  const comprimento = 2 * Math.PI * raio;
  const fracao = valor === null ? 0 : Math.min(Math.max(valor, 0), 100) / 100;
  const cor = claro ? "#ffffff" : valor === null ? "#c9d4ce" : corDoScore(valor);

  return (
    <div
      className="relative shrink-0"
      style={{ width: tamanho, height: tamanho }}
      role="img"
      aria-label={
        valor === null ? "Score de adesão ainda não disponível" : `Score de adesão: ${valor} de 100`
      }
    >
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={claro ? "rgb(255 255 255 / 0.18)" : "#edf2ef"}
          strokeWidth={espessura}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={`${comprimento * fracao} ${comprimento}`}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-[family-name:var(--fonte-titulo)] font-bold tabular-nums"
          style={{ fontSize: tamanho * 0.3, color: claro ? "#fff" : "#16241f" }}
        >
          {valor === null ? "–" : valor}
        </span>
        <span
          className="mt-1"
          style={{
            fontSize: Math.max(10, tamanho * 0.1),
            color: claro ? "rgb(255 255 255 / 0.7)" : "#5c6b65",
          }}
        >
          {rotulo}
        </span>
      </div>
    </div>
  );
}
