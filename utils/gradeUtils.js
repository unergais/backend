// backend/utils/gradeUtils.js
/**
 * Utilidades para el manejo de calificaciones en escala 0-10
 */

/**
 * Redondea las notas que terminan en .5 hacia arriba
 * Ejemplos:
 *   5.5 → 6
 *   6.5 → 7
 *   7.0 → 7 (sin cambios)
 *   8.3 → 8.3 (sin cambios)
 *
 * @param {number} grade - La nota a redondear
 * @returns {number} - La nota redondeada
 */
export function roundGrade(grade) {
  const numGrade = Number(grade);

  // Verificar si la parte decimal es exactamente .5
  const decimal = numGrade - Math.floor(numGrade);

  if (Math.abs(decimal - 0.5) < 0.0001) {
    // Es .5, redondear hacia arriba
    return Math.ceil(numGrade);
  }

  // No es .5, devolver el número redondeado a 1 decimal
  return Math.round(numGrade * 10) / 10;
}

/**
 * Valida que una nota esté en el rango válido de 0-10
 *
 * @param {number} grade - La nota a validar
 * @returns {boolean} - true si es válida, false si no
 */
export function validateGrade(grade) {
  const numGrade = Number(grade);

  if (isNaN(numGrade)) {
    return false;
  }

  return numGrade >= 0 && numGrade <= 10;
}

/**
 * Determina si una nota es aprobatoria
 * Criterio: 5.5 o superior es aprobado
 *
 * @param {number} grade - La nota a evaluar
 * @returns {boolean} - true si es aprobatoria (≥5.5), false si no
 */
export function isPassingGrade(grade) {
  const numGrade = Number(grade);
  return numGrade >= 5.5;
}

/**
 * Procesa una nota: valida, redondea si es necesario
 *
 * @param {number} grade - La nota a procesar
 * @returns {object} - { valid: boolean, grade: number|null, error: string|null }
 */
export function processGrade(grade) {
  // Validar primero
  if (!validateGrade(grade)) {
    return {
      valid: false,
      grade: null,
      error: "La nota debe estar entre 0 y 10",
    };
  }

  // Redondear si es necesario
  const processedGrade = roundGrade(grade);

  return {
    valid: true,
    grade: processedGrade,
    error: null,
  };
}
