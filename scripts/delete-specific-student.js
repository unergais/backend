// Script para borrar estudiante específico por email
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const emailToDelete = 'luisarturocruz57@gmail.com'

async function run() {
  console.log(`\n🔍 Buscando: ${emailToDelete}...`)
  
  // 1. Buscar en tabla students
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('id, user_id, full_name')
    .eq('email', emailToDelete)
    .single()

  if (student) {
    console.log(`📋 Encontrado en students: ${student.full_name} (ID: ${student.id})`)
    
    // Borrar de student_evaluations
    await supabaseAdmin.from('student_evaluations').delete().eq('student_id', student.id)
    
    // Borrar de students
    const { error: delErr } = await supabaseAdmin.from('students').delete().eq('id', student.id)
    if (delErr) console.error('Error borrando de students:', delErr)
    else console.log('✅ Eliminado de students')
    
    // Borrar de auth.users
    if (student.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(student.user_id)
      if (authErr) console.error('Error borrando de auth:', authErr)
      else console.log('✅ Eliminado de auth.users')
    }
  } else {
    console.log('❌ No encontrado en tabla students')
    
    // Buscar solo en Auth
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const authUser = users.find(u => u.email === emailToDelete)
    
    if (authUser) {
      console.log(`📋 Encontrado en Auth: ${authUser.id}`)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      if (error) console.error('Error:', error)
      else console.log('✅ Eliminado de auth.users')
    } else {
      console.log('❌ No encontrado en Auth tampoco')
    }
  }
  
  console.log('\n✅ Proceso completado')
}

run()
