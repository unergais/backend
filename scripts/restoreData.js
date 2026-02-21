
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import readline from 'readline'

// Configurar entorno
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Faltan variables de entorno.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ORDEN CRÍTICO DE RESTAURACIÓN (Para respetar Foreign Keys)
const TABLES_ORDER = [
  'users',               // Perfiles de usuario (depende de auth.users, que se asume existente)
  'evaluations_config',  // Configuración base
  'deadline_settings',   // Configuración base
  'evaluations_config',  // (Repetido por seguridad, o si hay dependencias circulares raras)
  'tutores_academicos',  // Independiente
  'tutores_empresariales',// Independiente
  'students',            // Depende de users
  'asignaciones_tutores',// Depende de students y tutores
  'student_evaluations', // Depende de students y config
  'student_submissions'  // Depende de students
]

const BACKUPS_DIR = path.join(__dirname, '../backups')

async function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

async function restore() {
  console.log('📦 HERRAMIENTA DE RESTAURACIÓN DE DATOS')
  console.log('=======================================')

  if (!fs.existsSync(BACKUPS_DIR)) {
    console.error('❌ No se encontró la carpeta de backups.')
    return
  }

  // 1. Listar backups disponibles
  const backups = fs.readdirSync(BACKUPS_DIR)
    .filter(file => fs.statSync(path.join(BACKUPS_DIR, file)).isDirectory())
    .sort()
    .reverse() // El más reciente primero

  if (backups.length === 0) {
    console.error('❌ No hay backups disponibles.')
    return
  }

  console.log('\nBackups disponibles:')
  backups.forEach((b, i) => console.log(`${i + 1}. ${b}`))

  // 2. Seleccionar backup
  const selection = await askQuestion('\nSelecciona el número del backup a restaurar (1): ') || '1'
  const index = parseInt(selection) - 1
  
  if (index < 0 || index >= backups.length) {
    console.error('❌ Selección inválida.')
    return
  }

  const selectedBackup = backups[index]
  const backupPath = path.join(BACKUPS_DIR, selectedBackup)
  console.log(`\n🔄 Restaurando desde: ${selectedBackup}...`)
  console.log('⚠️ ESTO SOBRESCRIBIRÁ DATOS EXISTENTES CON EL MISMO ID.')

  // 3. Confirmación
  const confirm = await askQuestion('¿Estás seguro? Escribe "SI" para continuar: ')
  if (confirm !== 'SI') {
    console.log('Cancelado.')
    return
  }

  // 4. Proceso de Restauración
  for (const table of TABLES_ORDER) {
    const filePath = path.join(backupPath, `${table}.json`)
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏩ Saltando ${table} (no existe en backup).`)
      continue
    }

    try {
      const rawData = fs.readFileSync(filePath, 'utf8')
      const records = JSON.parse(rawData)

      if (records.length === 0) {
        console.log(`⏩ Saltando ${table} (vacía).`)
        continue
      }

      console.log(`📥 Importando ${table} (${records.length} registros)...`)

      // Insertar por lotes (upsert)
      const { error } = await supabase
        .from(table)
        .upsert(records, { onConflict: 'id' }) // Asume que 'id' es la PK
        .select()

      if (error) {
        console.error(`❌ Error en ${table}:`, error.message)
      } else {
        console.log(`✅ ${table} restaurada.`)
      }

    } catch (err) {
      console.error(`❌ Error procesando ${table}:`, err.message)
    }
  }

  console.log('\n✨ Restauración completada.')
}

restore()
