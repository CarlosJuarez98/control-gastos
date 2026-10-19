import { repartirPesosEnteros, repartirPesosPonderado } from './reparto-enteros.util';

describe('repartirPesosEnteros', () => {
  it('399 entre 5: principal paga el piso', () => {
    expect(repartirPesosEnteros(399, 5)).toEqual([79, 80, 80, 80, 80]);
  });

  it('suma exacta', () => {
    const partes = repartirPesosEnteros(100, 3);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('rechaza 0 personas y acepta 1', () => {
    expect(() => repartirPesosEnteros(10, 0)).toThrow();
    expect(repartirPesosEnteros(10, 1)).toEqual([10]);
  });
});

describe('repartirPesosPonderado', () => {
  it('streaming 1+3+1 sobre 399 (enteros)', () => {
    expect(repartirPesosPonderado(399, [1, 3, 1])).toEqual([79, 240, 80]);
  });

  it('Netflix 370 con perfiles 1+2+1 en centavos', () => {
    expect(repartirPesosPonderado(370, [1, 2, 1], true)).toEqual([92.5, 185, 92.5]);
  });
});
