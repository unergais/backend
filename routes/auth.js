// backend/routes/auth.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { sendPasswordResetEmail } from '../utils/mail.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/forgot-password
 * Genera un link de recuperación y lo envía usando nuestro mailer personalizado
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, redirectTo } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    // 1. Generar el link de recuperación (bypaseando el envío de correo de Supabase)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo || process.env.FRONTEND_URL || 'http://localhost:5173/reset-password'
      }
    });

    if (error) {
      console.error('Error generando link:', error);
      // Validar si el usuario no existe para no dar pistas (seguridad)
      // Aunque para UX a veces es mejor ser explícito. Supabase suele ser explícito.
      return res.status(400).json({ error: 'No se pudo generar el enlace. Verifica el correo.' });
    }

    const { action_link } = data.properties;

    // 2. Enviar el correo usando nuestro servicio (Gmail)
    // No usamos await para responder rápido al cliente (optimista)
    setImmediate(async () => {
      try {
        await sendPasswordResetEmail(email, action_link);
        console.log(`✅ Email de recuperación enviado a: ${email}`);
      } catch (mailError) {
        console.error(`❌ Error enviando email de recuperación a ${email}:`, mailError.message);
      }
    });

    return res.json({ ok: true, message: 'Correo de recuperación enviado' });

  } catch (err) {
    console.error('forgot-password error', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
