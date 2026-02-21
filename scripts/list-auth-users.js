// Script para listar usuarios en Auth
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('\n📋 Usuarios en Supabase Auth:')
  console.log('Total:', data.users.length)
  console.log('')
  data.users.forEach((u, i) => {
    console.log(`${i+1}. ${u.email}`)
  })
}

run()
