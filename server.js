// backend/server.js
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import verificationRoutes from './routes/verification.js'
import authRoutes from './routes/auth.js'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { processGrade } from './utils/gradeUtils.js'


dotenv.config()
const app = express()
const port = process.env.PORT || 4000
app.use(cors({
  origin: '*', // En producción deberías poner tu dominio específico
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json())

// =============================================
// RATE LIMITING - Protección contra abuso
// =============================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // límite de 300 requests por IP (más permisivo)
  message: JSON.stringify({ error: 'Demasiadas solicitudes desde esta IP, intenta más tarde' }),
  standardHeaders: true,
  legacyHeaders: false,
})

// Aplicar rate limiting a todas las rutas API
app.use('/api/', limiter)

// Rate limiting más estricto para operaciones sensibles
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 requests cada 15 minutos (más permisivo)
  message: JSON.stringify({ error: 'Demasiados intentos, intenta más tarde' })
})

// =============================================
// MIDDLEWARE DE AUTENTICACIÓN
// =============================================
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
    }

    const token = authHeader.split(' ')[1]

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' })
    }

    // Adjuntar usuario al request para uso posterior
    req.user = user
    next()
  } catch (error) {
    console.error('Error en verificación de token:', error)
    res.status(500).json({ error: 'Error al verificar autenticación' })
  }
}

// ¡Esta es tu "llave maestra" (Master Key)!
// La usaremos SÓLO aquí en el backend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =============================================
// HEALTH CHECK - Diagnóstico rápido del deploy
// =============================================

/**
 * GET /
 * Ruta raíz para verificar que el servidor está corriendo.
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'UNERG Pasantías Backend is running',
    port: port,
    timestamp: new Date().toISOString()
  })
})

/**
 * GET /health
 * Health check con diagnóstico de variables de entorno.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    nodeVersion: process.version,
    env: {
      PORT: process.env.PORT ? '✅ configured' : '❌ missing',
      SUPABASE_URL: process.env.SUPABASE_URL ? '✅ configured' : '❌ missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ configured' : '❌ missing',
      GMAIL_USER: process.env.GMAIL_USER ? '✅ configured' : '❌ missing',
      GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ? '✅ configured' : '❌ missing'
    },
    timestamp: new Date().toISOString()
  })
})

// =============================================
// RUTAS DE VERIFICACIÓN
// =============================================
app.use('/api', verificationRoutes)
app.use('/api', authRoutes)

// =============================================
// RUTAS DE SUPERADMIN (Gestión de Admins)
// =============================================

/**
 * POST /api/create-admin
 * Crea un nuevo admin/superadmin.
 */
app.post('/api/create-admin', verifyToken, async (req, res) => {
  try {
    const { email, password, full_name, ci, phone, role } = req.body

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('User already exists')) {
        throw new Error('El correo electrónico ya está en uso en el sistema de autenticación.')
      }
      throw new Error(`Error en Auth: ${authError.message}`)
    }
    if (!authData.user) throw new Error('No se pudo crear el usuario en Auth.')

    // 2. Crear perfil en 'users'
    const { error: createError } = await supabaseAdmin
      .from('users')
      .insert([{
        user_id: authData.user.id,
        full_name: full_name,
        ci: ci,
        phone: phone,
        email: email,
        role: role,
        created_at: new Date().toISOString()
      }])

    if (createError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Error en DB: ${createError.message}`)
    }

    res.json({ ok: true, message: 'Administrador creado con éxito' })
  } catch (err) {
    console.error('Error en /api/create-admin:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/delete-admin
 * Elimina un admin/superadmin.
 */
app.delete('/api/delete-admin', verifyToken, async (req, res) => {
  try {
    const { profileId, authUserId } = req.body
    if (!profileId || !authUserId) return res.status(400).json({ error: 'Faltan datos' })

    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', profileId)

    if (deleteError) throw new Error(`Error en DB: ${deleteError.message}`)

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
    if (authError) throw new Error(`Error en Auth: ${authError.message}`)

    res.json({ ok: true, message: 'Administrador eliminado con éxito' })
  } catch (err) {
    console.error('Error en /api/delete-admin:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/update-admin
 * Actualiza los datos de un admin.
 */
app.put('/api/update-admin', verifyToken, async (req, res) => {
  try {
    const { id, full_name, ci, phone, email, role } = req.body
    if (!id) return res.status(400).json({ error: 'Falta el id' })

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ full_name, ci, phone, email, role })
      .eq('id', id)

    if (updateError) throw new Error(`Error en DB: ${updateError.message}`)

    res.json({ ok: true, message: 'Administrador actualizado con éxito' })
  } catch (err) {
    console.error('Error en /api/update-admin:', err)
    res.status(500).json({ error: err.message })
  }
})


// =============================================
// RUTAS DE ADMIN (Gestión de Estudiantes y Notas)
// =============================================

/**
 * DELETE /api/delete-student
 * Elimina a un estudiante por completo.
 */
app.delete('/api/delete-student', verifyToken, async (req, res) => {
  try {
    const { profileId, authUserId } = req.body
    if (!profileId || !authUserId) return res.status(400).json({ error: 'Faltan datos' })

    // 1. Borrar evaluaciones del estudiante
    const { error: evalsError } = await supabaseAdmin
      .from('student_evaluations')
      .delete()
      .eq('student_id', profileId)
    if (evalsError) throw new Error(`Error en DB (student_evaluations): ${evalsError.message}`)

    // 2. Borrar perfil (students)
    const { error: studentError } = await supabaseAdmin
      .from('students')
      .delete()
      .eq('id', profileId)
    if (studentError) throw new Error(`Error en DB (students): ${studentError.message}`)

    // 3. Borrar usuario de Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
    if (authError) throw new Error(`Error en Auth: ${authError.message}`)

    res.json({ ok: true, message: 'Estudiante eliminado con éxito' })
  } catch (err) {
    console.error('Error en /api/delete-student:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/grade-submission
 * Califica una entrega
 */
app.post('/api/grade-submission', verifyToken, async (req, res) => {
  try {
    const { submissionId, studentId, evaluationId, grade, observaciones } = req.body

    // Validar datos requeridos
    if (!submissionId || !studentId || !evaluationId || grade === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos (submissionId, studentId, evaluationId, grade)' })
    }

    // Validar y procesar la nota (escala 0-10, redondeo automático de .5)
    const gradeResult = processGrade(grade)

    if (!gradeResult.valid) {
      return res.status(400).json({ error: gradeResult.error })
    }

    const finalGrade = gradeResult.grade

    // 1. Verificar si ya existe un registro para este estudiante/evaluación
    const { data: existingEval, error: checkError } = await supabaseAdmin
      .from('student_evaluations')
      .select('id')
      .eq('student_id', studentId)
      .eq('evaluation_id', evaluationId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (es esperado si no existe)
      throw new Error(`Error verificando evaluación existente: ${checkError.message}`)
    }

    // 2. Insertar o actualizar en student_evaluations
    if (existingEval) {
      // Actualizar registro existente
      const { error: updateError } = await supabaseAdmin
        .from('student_evaluations')
        .update({
          nota: finalGrade,
          observaciones: observaciones || null,
          calificado: true,
          fecha_calificacion: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingEval.id)

      if (updateError) throw new Error(`Error actualizando calificación: ${updateError.message}`)
    } else {
      // Crear nuevo registro
      const { error: insertError } = await supabaseAdmin
        .from('student_evaluations')
        .insert({
          student_id: studentId,
          evaluation_id: evaluationId,
          nota: finalGrade,
          observaciones: observaciones || null,
          calificado: true,
          fecha_calificacion: new Date().toISOString()
        })

      if (insertError) throw new Error(`Error creando calificación: ${insertError.message}`)
    }
    // 3. Sincronizar con student_submissions para el historial
    // Evitar duplicados: si ya existe un registro (student_id + evaluation_id), actualizar el más reciente.
    // Si no existe, insertar.
    const legacyEvaColumnByEvaluationId = {
      2: 'eva1',
      3: 'eva2',
      4: 'eva3',
      5: 'eva4',
      6: 'eva5',
      7: 'eva6',
      8: 'eva7',
      9: 'eva8',
      10: 'eva9'
    }

    const legacyEvaColumn = legacyEvaColumnByEvaluationId[Number(evaluationId)] || null

    if (req.body.source === 'new') {
      const { data: existingSubs, error: findSubError } = await supabaseAdmin
        .from('student_submissions')
        .select('id')
        .eq('student_id', studentId)
        .eq('evaluation_id', evaluationId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (findSubError) {
        console.warn('Error buscando historial legacy (no crítico):', findSubError)
      }

      if (existingSubs && existingSubs.length > 0) {
        const { error: updateSubError } = await supabaseAdmin
          .from('student_submissions')
          .update({
            status: 'approved',
            file_url: 'APROBADO',
            ...(legacyEvaColumn ? { eva_column: legacyEvaColumn } : {})
          })
          .eq('id', existingSubs[0].id)

        if (updateSubError) console.warn('Error actualizando historial (no crítico):', updateSubError)
      } else {
        const fallbackEvaColumn = legacyEvaColumn || `eva${Math.max(1, Number(evaluationId) - 1)}`
        const { error: insertSubError } = await supabaseAdmin
          .from('student_submissions')
          .insert({
            student_id: studentId,
            eva_column: fallbackEvaColumn,
            evaluation_id: evaluationId,
            file_url: 'APROBADO',
            status: 'approved'
          })

        if (insertSubError) console.warn('Error insertando en historial (no crítico):', insertSubError)
      }
    } else {
      // Legacy: actualizar registro existente por id
      const { error: subError } = await supabaseAdmin
        .from('student_submissions')
        .update({ status: 'approved' })
        .eq('id', submissionId)

      if (subError) console.warn('Error actualizando estado de entrega (no crítico):', subError)
    }

    res.json({
      ok: true,
      message: 'Entrega calificada y aprobada con éxito',
      grade: finalGrade
    })

  } catch (err) {
    console.error('Error en /api/grade-submission:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/reject-submission
 * Rechaza una entrega: Solo marca la entrega como 'rejected'.
 */
app.post('/api/reject-submission', async (req, res) => {
  try {
    const { submissionId } = req.body

    if (!submissionId) return res.status(400).json({ error: 'Falta submissionId' })

    const { error: subError } = await supabaseAdmin
      .from('student_submissions')
      .update({ status: 'rejected' })
      .eq('id', submissionId)

    if (subError) throw new Error(`Error rechazando entrega: ${subError.message}`)

    res.json({ ok: true, message: 'Entrega rechazada' })

  } catch (err) {
    console.error('Error en /api/reject-submission:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/calculate-totals
 * Calcula la nota final
 */
app.post('/api/calculate-totals', verifyToken, async (req, res) => {
  try {
    const { cohorte } = req.body // ej: "2025-1" o "all"

    // 1. Obtener configuración de evaluaciones (solo las que ponderan)
    const { data: evalConfigs, error: configError } = await supabaseAdmin
      .from('evaluations_config')
      .select('id, porcentaje')
      .eq('tiene_ponderacion', true)
      .eq('activo', true)

    if (configError) throw new Error(`Error obteniendo configuración: ${configError.message}`)

    // 2. Obtener estudiantes de la cohorte
    let studentsQuery = supabaseAdmin.from('students').select('id')
    if (cohorte && cohorte !== 'all') {
      studentsQuery = studentsQuery.eq('cohorte', cohorte)
    }

    const { data: students, error: studentsError } = await studentsQuery
    if (studentsError) throw new Error(`Error obteniendo estudiantes: ${studentsError.message}`)

    if (!students || students.length === 0) {
      return res.json({ ok: true, message: 'No se encontraron estudiantes para calcular.' })
    }

    // Función para aplicar redondeo: decimales >= 0.5 suben al siguiente entero
    const roundGrade = (value) => {
      const decimal = value - Math.floor(value)
      if (decimal >= 0.5) {
        return Math.ceil(value)
      }
      return Math.floor(value)
    }

    // 3. Calcular nota final para cada estudiante
    let updatedCount = 0
    for (const student of students) {
      // Obtener todas las calificaciones del estudiante
      const { data: evaluaciones, error: evalError } = await supabaseAdmin
        .from('student_evaluations')
        .select('evaluation_id, nota')
        .eq('student_id', student.id)
        .eq('calificado', true)

      if (evalError) continue

      // Calcular nota ponderada
      let notaFinal = 0
      for (const evaluacion of evaluaciones || []) {
        // Buscar el porcentaje de esta evaluación
        const config = evalConfigs.find(c => c.id === evaluacion.evaluation_id)
        if (config && evaluacion.nota !== null) {
          // Fórmula: nota (0-10) * porcentaje (ej: 5) / 100 = contribución al total
          // Ejemplo: 10 * 5 / 100 = 0.5 puntos; 10 * 30 / 100 = 3 puntos
          notaFinal += (Number(evaluacion.nota) * Number(config.porcentaje)) / 100
        }
      }

      // Aplicar redondeo: decimales >= 0.5 suben al siguiente entero
      const notaFinalRedondeada = roundGrade(notaFinal)

      // 4. Actualizar el total en la tabla students
      const { error: updateError } = await supabaseAdmin
        .from('students')
        .update({ nota_final: notaFinalRedondeada })
        .eq('id', student.id)

      if (!updateError) updatedCount++
    }

    res.json({ ok: true, message: `Se calcularon los totales para ${updatedCount} estudiantes. Notas redondeadas (decimales ≥0.5 suben al siguiente entero).` })

  } catch (err) {
    console.error('Error en /api/calculate-totals:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/delete-cohorte-files
 * Borra TODOS los archivos de una carpeta específica en Storage.
 * ¡Cuidado! Acción destructiva.
 */
app.delete('/api/delete-cohorte-files', async (req, res) => {
  try {
    const { cohorte } = req.body
    if (!cohorte || cohorte === 'all') {
      return res.status(400).json({ error: 'Se requiere una cohorte específica' })
    }

    const bucketName = 'recaudos_estudiantes'
    const folderPath = `${cohorte}` // La carpeta tiene el nombre de la cohorte

    // 1. Listar todos los archivos dentro de la carpeta de la cohorte
    const { data: files, error: listError } = await supabaseAdmin
      .storage
      .from(bucketName)
      .list(folderPath, { limit: 1000 }) // Listamos hasta 1000 archivos

    if (listError) throw new Error(`Error listando archivos: ${listError.message}`)

    if (!files || files.length === 0) {
      return res.json({ ok: true, message: 'No se encontraron archivos para borrar.' })
    }

    // 2. Preparar array de rutas para borrar
    const filesToDelete = files.map(file => `${folderPath}/${file.name}`)

    // 3. Borrar los archivos
    const { error: deleteError } = await supabaseAdmin
      .storage
      .from(bucketName)
      .remove(filesToDelete)

    if (deleteError) throw new Error(`Error borrando archivos: ${deleteError.message}`)

    res.json({ ok: true, message: `Se borraron ${filesToDelete.length} archivos de la cohorte ${cohorte}.` })

  } catch (err) {
    console.error('Error en /api/delete-cohorte-files:', err)
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// VALIDACIÓN DE FECHAS LÍMITE
// =============================================

/**
 * GET /api/check-deadline/:studentId/:evaluationId
 * Verifica si un estudiante puede entregar una evaluación basándose en:
 * 1. La fecha límite general de la cohorte (deadline_settings)
 * 2. Si tiene una prórroga individual (student_evaluations.fecha_limite_extendida)
 * 
 * Retorna: { canSubmit: boolean, deadline: Date, reason: string }
 */
app.get('/api/check-deadline/:studentId/:evaluationId', async (req, res) => {
  try {
    const { studentId, evaluationId } = req.params
    const now = new Date()

    // 1. Obtener la cohorte del estudiante
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('cohorte')
      .eq('id', studentId)
      .single()

    if (studentError || !student) {
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }

    // 2. Verificar si tiene prórroga individual
    const { data: studentEval } = await supabaseAdmin
      .from('student_evaluations')
      .select('fecha_limite_extendida, calificado')
      .eq('student_id', studentId)
      .eq('evaluation_id', evaluationId)
      .single()

    // Si ya está calificado, no puede volver a entregar
    if (studentEval?.calificado) {
      return res.json({
        canSubmit: false,
        deadline: null,
        reason: 'Esta evaluación ya fue calificada y no puede ser modificada.'
      })
    }

    // 3. Usar prórroga individual si existe
    if (studentEval?.fecha_limite_extendida) {
      const extendedDeadline = new Date(studentEval.fecha_limite_extendida)
      if (now <= extendedDeadline) {
        return res.json({
          canSubmit: true,
          deadline: extendedDeadline.toISOString(),
          reason: 'Tienes una prórroga especial para esta entrega.',
          hasExtension: true
        })
      } else {
        return res.json({
          canSubmit: false,
          deadline: extendedDeadline.toISOString(),
          reason: 'Tu prórroga especial ha expirado.',
          hasExtension: true
        })
      }
    }

    // 4. Buscar fecha límite general de la cohorte
    const { data: deadlineSetting } = await supabaseAdmin
      .from('deadline_settings')
      .select('fecha_limite, permite_entrega_tardia')
      .eq('cohorte', student.cohorte)
      .eq('evaluation_id', evaluationId)
      .single()

    // Si no hay fecha límite configurada, permitir entrega
    if (!deadlineSetting) {
      return res.json({
        canSubmit: true,
        deadline: null,
        reason: 'No hay fecha límite configurada para esta evaluación.'
      })
    }

    const deadline = new Date(deadlineSetting.fecha_limite)

    if (now <= deadline) {
      return res.json({
        canSubmit: true,
        deadline: deadline.toISOString(),
        reason: 'Entrega dentro del plazo.',
        daysRemaining: Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
      })
    } else {
      // Fecha pasada
      if (deadlineSetting.permite_entrega_tardia) {
        return res.json({
          canSubmit: true,
          deadline: deadline.toISOString(),
          reason: 'Fecha límite pasada, pero se permiten entregas tardías.',
          isLate: true
        })
      } else {
        return res.json({
          canSubmit: false,
          deadline: deadline.toISOString(),
          reason: 'La fecha límite ha pasado y no se permiten entregas tardías.'
        })
      }
    }

  } catch (err) {
    console.error('Error en /api/check-deadline:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/submit-evaluation
 * Endpoint protegido para que estudiantes envíen entregas.
 */
app.post('/api/submit-evaluation', verifyToken, async (req, res) => {
  try {
    const { studentId, evaluationId, fileUrl, fileName, fileType, fileSize } = req.body

    if (!studentId || !evaluationId) {
      return res.status(400).json({ error: 'Faltan datos requeridos (studentId, evaluationId)' })
    }

    // 1. Validar fecha límite (reutilizamos la lógica)
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('cohorte')
      .eq('id', studentId)
      .single()

    if (!student) {
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }

    // Verificar prórroga individual
    const { data: studentEval } = await supabaseAdmin
      .from('student_evaluations')
      .select('fecha_limite_extendida, calificado')
      .eq('student_id', studentId)
      .eq('evaluation_id', evaluationId)
      .single()

    if (studentEval?.calificado) {
      return res.status(403).json({
        error: 'Esta evaluación ya fue calificada y no puede ser modificada.'
      })
    }

    const now = new Date()
    let canSubmit = true
    let effectiveDeadline = null

    // Verificar prórroga individual primero
    if (studentEval?.fecha_limite_extendida) {
      effectiveDeadline = new Date(studentEval.fecha_limite_extendida)
      canSubmit = now <= effectiveDeadline
    } else {
      // Buscar deadline general
      const { data: deadlineSetting } = await supabaseAdmin
        .from('deadline_settings')
        .select('fecha_limite, permite_entrega_tardia')
        .eq('cohorte', student.cohorte)
        .eq('evaluation_id', evaluationId)
        .single()

      if (deadlineSetting) {
        effectiveDeadline = new Date(deadlineSetting.fecha_limite)
        canSubmit = now <= effectiveDeadline || deadlineSetting.permite_entrega_tardia
      }
    }

    if (!canSubmit) {
      return res.status(403).json({
        error: 'La fecha límite ha pasado y no se permiten entregas tardías.',
        deadline: effectiveDeadline?.toISOString()
      })
    }

    // 2. Crear o actualizar el registro en student_evaluations
    const { data: existing } = await supabaseAdmin
      .from('student_evaluations')
      .select('id')
      .eq('student_id', studentId)
      .eq('evaluation_id', evaluationId)
      .single()

    const evaluationData = {
      student_id: studentId,
      evaluation_id: evaluationId,
      archivo_url: fileUrl,
      archivo_nombre: fileName,
      archivo_tipo: fileType,
      archivo_size: fileSize,
      fecha_entrega: now.toISOString(),
      updated_at: now.toISOString()
    }

    if (existing) {
      // Actualizar
      const { error: updateError } = await supabaseAdmin
        .from('student_evaluations')
        .update(evaluationData)
        .eq('id', existing.id)

      if (updateError) throw new Error(`Error actualizando entrega: ${updateError.message}`)
    } else {
      // Insertar
      const { error: insertError } = await supabaseAdmin
        .from('student_evaluations')
        .insert(evaluationData)

      if (insertError) throw new Error(`Error creando entrega: ${insertError.message}`)
    }

    res.json({
      ok: true,
      message: 'Entrega registrada exitosamente',
      isLate: effectiveDeadline && now > effectiveDeadline
    })

  } catch (err) {
    console.error('Error en /api/submit-evaluation:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/grant-extension
 * Permite al Admin otorgar una prórroga individual a un estudiante.
 */
app.post('/api/grant-extension', verifyToken, async (req, res) => {
  try {
    const { studentId, evaluationId, newDeadline } = req.body

    if (!studentId || !evaluationId || !newDeadline) {
      return res.status(400).json({ error: 'Faltan datos (studentId, evaluationId, newDeadline)' })
    }

    // Verificar si ya existe un registro
    const { data: existing } = await supabaseAdmin
      .from('student_evaluations')
      .select('id')
      .eq('student_id', studentId)
      .eq('evaluation_id', evaluationId)
      .single()

    if (existing) {
      // Actualizar prórroga
      const { error } = await supabaseAdmin
        .from('student_evaluations')
        .update({
          fecha_limite_extendida: newDeadline,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      if (error) throw error
    } else {
      // Crear registro con prórroga
      const { error } = await supabaseAdmin
        .from('student_evaluations')
        .insert({
          student_id: studentId,
          evaluation_id: evaluationId,
          fecha_limite_extendida: newDeadline
        })

      if (error) throw error
    }

    res.json({ ok: true, message: 'Prórroga otorgada exitosamente' })

  } catch (err) {
    console.error('Error en /api/grant-extension:', err)
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// RUTAS DE HABILITACIÓN/INHABILITACIÓN DE USUARIOS
// =============================================

/**
 * PUT /api/toggle-student-status
 * Cambia el estado de habilitación de un estudiante.
 */
app.put('/api/toggle-student-status', verifyToken, async (req, res) => {
  try {
    const { studentId, habilitado } = req.body

    // Validar datos requeridos
    if (!studentId || habilitado === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos (studentId, habilitado)' })
    }

    // Actualizar estado en la tabla students
    const { error: updateError } = await supabaseAdmin
      .from('students')
      .update({ habilitado: Boolean(habilitado) })
      .eq('id', studentId)

    if (updateError) {
      throw new Error(`Error actualizando estudiante: ${updateError.message}`)
    }

    const action = habilitado ? 'habilitado' : 'inhabilitado'
    res.json({ ok: true, message: `Estudiante ${action} exitosamente` })

  } catch (err) {
    console.error('Error en /api/toggle-student-status:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/toggle-user-status
 * Cambia el estado de habilitación de un usuario (admin/superadmin).
 */
app.put('/api/toggle-user-status', verifyToken, async (req, res) => {
  try {
    const { userId, habilitado } = req.body

    // Validar datos requeridos
    if (!userId || habilitado === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos (userId, habilitado)' })
    }

    // Actualizar estado en la tabla users
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ habilitado: Boolean(habilitado) })
      .eq('id', userId)

    if (updateError) {
      throw new Error(`Error actualizando usuario: ${updateError.message}`)
    }

    const action = habilitado ? 'habilitado' : 'inhabilitado'
    res.json({ ok: true, message: `Usuario ${action} exitosamente` })

  } catch (err) {
    console.error('Error en /api/toggle-user-status:', err)
    res.status(500).json({ error: err.message })
  }
})

// =============================================
// INICIAR SERVIDOR
// =============================================
app.listen(port, '0.0.0.0', () => console.log(`Server listening on port ${port}`))
