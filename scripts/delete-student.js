// Script temporal para listar y borrar estudiantes (correr con node)
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  // 1. Listar estudiantes recientes
  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('id, user_id, email, full_name, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('\n📋 Estudiantes recientes:')
  students.forEach((s, i) => {
    console.log(`${i+1}. ${s.full_name} (${s.email}) - ID: ${s.id}`)
  })

  // 2. Si hay estudiantes, borrar el más reciente
  if (students.length > 0) {
    const toDelete = students[0]
    console.log(`\n🗑️ Borrando: ${toDelete.full_name}...`)
    
    // Borrar de student_evaluations
    await supabaseAdmin.from('student_evaluations').delete().eq('student_id', toDelete.id)
    
    // Borrar de students
    const { error: delErr } = await supabaseAdmin.from('students').delete().eq('id', toDelete.id)
    if (delErr) console.error('Error borrando de students:', delErr)
    
    // Borrar de auth.users
    if (toDelete.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(toDelete.user_id)
      if (authErr) console.error('Error borrando de auth:', authErr)
    }
    
    console.log('✅ Estudiante eliminado correctamente')
  }
}

run()
