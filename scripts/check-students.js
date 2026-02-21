// Script para verificar estudiantes en la tabla
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('id, email, full_name, code_expires_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('\n📋 Estudiantes en tabla students:')
  console.log('Total encontrados:', students.length)
  console.log('')
  students.forEach((s, i) => {
    console.log(`${i+1}. ${s.email} | code_expires_at: ${s.code_expires_at || 'null'}`)
  })
}

run()
