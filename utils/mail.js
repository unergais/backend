// backend/utils/mail.js
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config()

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

/**
 * sendVerificationEmail
 * @param {string} to - email destinatario
 * @param {string} code - código de verificación (texto)
 * @returns {Promise}
 */
export async function sendVerificationEmail(to, code) {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to,
    subject: 'Código de verificación - Pasantías UNERG',
    text: `Tu código de verificación es: ${code}. Expira en 15 minutos.`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.4; color:#111;">
        <p>Hola,</p>
        <p>Tu código de verificación para el sistema de Pasantías UNERG es:</p>
        <h2 style="letter-spacing:4px; color:#0b63d6;">${code}</h2>
        <p>Este código expira en 15 minutos.</p>
        <p>Si no solicitaste este código, ignora este correo.</p>
        <hr/>
        <p style="font-size:12px; color:#666;">Pasantías UNERG</p>
      </div>
    `
  }

  return transporter.sendMail(mailOptions)
}

/**
 * sendPasswordResetEmail
 * @param {string} to - email destinatario
 * @param {string} resetLink - enlace de recuperación
 * @returns {Promise}
 */
export async function sendPasswordResetEmail(to, resetLink) {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to,
    subject: 'Recuperación de contraseña - Pasantías UNERG',
    text: `Para restablecer tu contraseña, haz clic en el siguiente enlace: ${resetLink}. Si no solicitaste esto, ignora este correo.`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.4; color:#111; max-width: 600px; margin: 0 auto;">
        <h2 style="color:#0b63d6;">Recuperación de Contraseña</h2>
        <p>Hola,</p>
        <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el sistema de Pasantías UNERG.</p>
        <p>Para continuar, haz clic en el siguiente botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0b63d6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
        </div>
        <p style="font-size: 14px;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
        <p style="font-size: 12px; color: #555; word-break: break-all;">${resetLink}</p>
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;"/>
        <p style="font-size:12px; color:#666;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
      </div>
    `
  }

  return transporter.sendMail(mailOptions)
}
