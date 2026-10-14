// Contato do nutricionista, usado nos links de WhatsApp.
export const WHATSAPP_NUTRICIONISTA = "5514991066000";

export function linkWhatsApp(mensagem?: string) {
  const base = `https://wa.me/${WHATSAPP_NUTRICIONISTA}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
