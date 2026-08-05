/**
 * Trae TODAS las filas de una consulta paginando con .range().
 *
 * PostgREST (Supabase) limita cada respuesta a 1000 filas por defecto y
 * trunca EN SILENCIO: sin esto, el historial de un usuario constante
 * desapareceria a partir de cierto volumen (sesiones vacias, estadisticas
 * mal calculadas). `page` recibe los indices [from, to] para pasar a .range()
 * y debe lanzar si la consulta devuelve error.
 */
const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const rows = await page(all.length, all.length + PAGE_SIZE - 1);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}
