import nodemailer from "nodemailer";

// Envio de e-mail por SMTP (usado na redefinição de senha).

export function emailConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_REMETENTE);
}

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  texto: string
) {
  const porta = Number(process.env.SMTP_PORT ?? 587);

  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_SENHA }
      : undefined,
  });

  await transporte.sendMail({
    from: process.env.SMTP_REMETENTE,
    to: destinatario,
    subject: assunto,
    text: texto,
  });
}
