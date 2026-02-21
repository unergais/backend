// backend/routes/verification.js
import express from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { sendVerificationEmail } from "../utils/mail.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// Inicializa supabase en backend con SERVICE ROLE KEY (solo en backend)
// Renombro la variable a 'supabaseAdmin' para que sea más claro
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * generateNumericCode(length)
 * genera un código numérico de 'length' dígitos
 */
function generateNumericCode(length = 6) {
  const buf = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) code += String(buf[i] % 10);
  return code;
}

/**
 * POST /api/send-verification
 * OPTIMIZADO: Responde inmediatamente y envía el correo en background
 * Esto reduce el tiempo de registro de ~5-8s a ~2s
 * Última actualización: optimización de velocidad
 */
router.post("/send-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requerido" });

    const { data: students, error: findErr } = await supabaseAdmin
      .from("students")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!students || students.length === 0)
      return res.status(404).json({ error: "Estudiante no encontrado" });

    const student = students[0];
    const code = generateNumericCode(6);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString(); // 15 minutos

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("students")
      .update({ email_verification_code: code, code_expires_at: expiresAt })
      .eq("id", student.id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // ✅ RESPONDER INMEDIATAMENTE AL CLIENTE
    res.json({ ok: true, message: "Código enviado" });

    // ✅ ENVIAR EL CORREO EN BACKGROUND (después de responder)
    // Usamos setImmediate para no bloquear y procesar en el siguiente tick
    setImmediate(async () => {
      try {
        await sendVerificationEmail(email, code);
        console.log(`✅ Email de verificación enviado a: ${email}`);
      } catch (mailError) {
        // Solo logueamos el error, el usuario ya recibió su respuesta
        console.error(`❌ Error enviando email a ${email}:`, mailError.message);
      }
    });
  } catch (err) {
    console.error("send-verification error", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

/**
 * GET /api/code-status
 * Retorna el estado del código de verificación para un email:
 * - expiresAt: fecha/hora de expiración del código
 * - codeGeneratedAt: fecha/hora aproximada de generación (expiresAt - 15min)
 * - isExpired: si el código ya expiró
 *
 * El frontend usa esto para calcular los contadores persistentes
 */
router.get("/code-status", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email requerido" });

    // Buscar el estudiante y sus datos de verificación
    const { data: student, error: findErr } = await supabaseAdmin
      .from("students")
      .select("code_expires_at")
      .eq("email", email)
      .single();

    if (findErr || !student) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    // Si no hay código pendiente
    if (!student.code_expires_at) {
      return res.json({
        hasCode: false,
        expiresAt: null,
        codeGeneratedAt: null,
        isExpired: true,
      });
    }

    // Asegurar que se interprete como UTC agregando 'Z' si falta
    // Postgres devuelve "YYYY-MM-DD HH:mm:ss.ms" para timestamp without time zone
    let expiresString = student.code_expires_at;
    if (!expiresString.endsWith("Z")) {
      expiresString += "Z";
    }
    const expiresAt = new Date(expiresString);
    const now = new Date();
    const isExpired = now > expiresAt;

    // Calcular cuándo se generó (expiresAt - 15 minutos)
    const codeGeneratedAt = new Date(expiresAt.getTime() - 15 * 60 * 1000);

    // Calcular el cooldown de reenvío (60 segundos desde la generación)
    // Se calcula en el servidor para evitar problemas de timezone
    const secondsSinceGenerated = Math.floor((now - codeGeneratedAt) / 1000);
    const resendCooldownRemaining = Math.max(0, 60 - secondsSinceGenerated);

    return res.json({
      hasCode: true,
      expiresAt: expiresAt.toISOString(),
      codeGeneratedAt: codeGeneratedAt.toISOString(),
      isExpired,
      // Tiempo restante en segundos (útil para el frontend)
      secondsRemaining: isExpired ? 0 : Math.floor((expiresAt - now) / 1000),
      // Cooldown de reenvío calculado en el servidor (60s desde generación)
      resendCooldownRemaining,
    });
  } catch (err) {
    console.error("code-status error", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

/**
 * POST /api/verify-code
 * body: { email, code }
 * - ¡AHORA ACTUALIZA AMBAS TABLAS!
 */
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ error: "Email y código son requeridos" });

    // 1. Buscar el perfil del estudiante
    const { data: students, error: findErr } = await supabaseAdmin
      .from("students")
      .select("id, user_id, email_verification_code, code_expires_at") // Pedimos los datos
      .eq("email", email)
      .limit(1);

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!students || students.length === 0)
      return res.status(404).json({ error: "Estudiante no encontrado" });

    const student = students[0];
    const now = new Date();

    // 2. Validar el código (igual que antes)
    if (!student.email_verification_code || !student.code_expires_at) {
      return res.status(400).json({ error: "No hay código pendiente" });
    }
    if (student.email_verification_code !== String(code)) {
      return res.status(400).json({ error: "Código incorrecto" });
    }
    // Asegurar interpretación UTC
    let expiresString = student.code_expires_at;
    if (!expiresString.endsWith("Z")) {
      expiresString += "Z";
    }
    if (new Date(expiresString) < now) {
      return res.status(400).json({ error: "Código expirado" });
    }

    // 3. Validar que el estudiante tenga un user_id
    if (!student.user_id) {
      return res
        .status(500)
        .json({
          error:
            "Error: El perfil del estudiante no está vinculado a un usuario de autenticación.",
        });
    }

    // --- ¡AQUÍ ESTÁ LA CORRECCIÓN! ---
    // 4. Actualizar la "bóveda" de auth
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.updateUserById(
        student.user_id,
        { email_confirm: true } // Marcamos el email como confirmado en la "bóveda"
      );

    if (authError) {
      console.error("Error actualizando auth.users:", authError);
      return res
        .status(500)
        .json({ error: `Error al verificar en Auth: ${authError.message}` });
    }

    // 5. Actualizar nuestra tabla de perfiles 'students' (como ya hacías)
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("students")
      .update({
        email_verified: true,
        email_verification_code: null,
        code_expires_at: null,
      })
      .eq("id", student.id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // ¡Éxito en ambos!
    return res.json({ ok: true });
  } catch (err) {
    console.error("verify-code error", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
