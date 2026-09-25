/**
 * Reparte un monto en N partes en pesos enteros (suma = total redondeado).
 * Índice 0 = persona principal (tú): siempre el piso (paga menos o igual).
 * El sobrante de $1 va a los demás.
 * Ej. 399 / 5 → [79, 80, 80, 80, 80]
 */
export function repartirPesosEnteros(total: number, personas: number): number[] {
  if (personas < 1) {
    throw new Error('Se necesita al menos 1 persona');
  }
  const pesos = Array.from({ length: personas }, () => 1);
  return repartirPesosPonderado(total, pesos);
}

/**
 * Reparto ponderado (perfiles / días). Índice 0 = principal si aplica.
 * Extras de $1 van primero a los no-principal.
 */
export function repartirPesosPonderado(total: number, pesos: number[]): number[] {
  if (!pesos?.length) {
    throw new Error('Se necesita al menos 1 persona');
  }
  const monto = Math.round(Math.abs(Number(total) || 0));
  const n = pesos.length;
  let sumW = 0;
  const w = pesos.map((p) => {
    const v = Math.max(1, Math.round(Number(p) || 1));
    sumW += v;
    return v;
  });
  const parts = new Array<number>(n);
  let assigned = 0;
  for (let i = 0; i < n; i++) {
    parts[i] = Math.floor((monto * w[i]) / sumW);
    assigned += parts[i];
  }
  let rem = monto - assigned;
  for (let i = 1; rem > 0 && i < n; i++) {
    parts[i]++;
    rem--;
  }
  if (rem > 0) {
    parts[0] += rem;
  }
  return parts;
}
