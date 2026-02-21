import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// Configurar entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del backend (dos niveles arriba de scripts/ o un nivel arriba)
// Asumiendo que estamos en backend/scripts/, el .env está en backend/
dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Necesitamos Service Role para leer todo

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Tablas a respaldar
const TABLES = [
  "users",
  "students",
  "student_evaluations",
  "student_submissions",
  "evaluations_config",
  "deadline_settings",
  "asignaciones_tutores",
  "tutores_academicos",
  "tutores_empresariales",
  "cohortes_config", // Si existe
];

// Directorio de salida
const BACKUP_DIR = path.join(__dirname, "../backups");

async function backup() {
  console.log("📦 Iniciando respaldo de datos...");

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(BACKUP_DIR, `backup_${timestamp}`);
  fs.mkdirSync(sessionDir);

  for (const table of TABLES) {
    try {
      console.log(`Descargando tabla: ${table}...`);

      const { data, error } = await supabase.from(table).select("*");

      if (error) {
        // Algunas tablas pueden no existir, solo advertimos
        console.warn(`⚠️ Advertencia en ${table}: ${error.message}`);
        continue;
      }

      const filePath = path.join(sessionDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ ${table}: ${data.length} registros guardados.`);
    } catch (err) {
      console.error(`❌ Error inesperado en ${table}:`, err.message);
    }
  }

  console.log("\n✨ Respaldo completado exitosamente.");
  console.log(`📁 Directorio: ${sessionDir}`);
}

backup();
