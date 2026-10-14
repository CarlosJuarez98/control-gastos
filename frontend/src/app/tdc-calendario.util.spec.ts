import {
  calendarioCompraTdc,
  desgloseSaldoTdc,
  proximoCorte,
  ultimoCorteCerrado,
} from './tdc-calendario.util';
import { Cuenta, Movimiento } from './modelos';

function tdc(nombre: string, diaCorte: number, saldo = 0): Cuenta {
  return {
    id: diaCorte,
    nombre,
    tipo: 'TDC',
    saldoActual: saldo,
    diaCorte,
    diaLimitePago: Math.min(28, diaCorte + 10),
  } as Cuenta;
}

function cargo(fecha: string, monto: number, meses?: number): Pick<Movimiento, 'fecha' | 'tipo' | 'monto' | 'meses'> {
  return { fecha, tipo: 'CARGO', monto, meses: meses ?? 1 };
}

describe('tdc-calendario cortes (N tarjetas)', () => {
  /** Hoy = 14-oct-2026: el día siguiente al corte 13. */
  const hoy14 = new Date(2026, 9, 14, 12, 0, 0);

  it('compra del 14 con corte 13 cae en noviembre (no octubre)', () => {
    const c = tdc('Mercado', 13);
    const cal = calendarioCompraTdc(c, '2026-10-14');
    expect(cal).toBeTruthy();
    expect(cal!.fechaCorte.getFullYear()).toBe(2026);
    expect(cal!.fechaCorte.getMonth()).toBe(10); // noviembre
    expect(cal!.fechaCorte.getDate()).toBe(13);
  });

  it('compra del 13 con corte 13 aún entra en octubre', () => {
    const c = tdc('Mercado', 13);
    const cal = calendarioCompraTdc(c, '2026-10-13');
    expect(cal!.fechaCorte.getMonth()).toBe(9); // octubre
    expect(cal!.fechaCorte.getDate()).toBe(13);
  });

  it('pasado el corte 13, el ciclo a pagar se etiqueta octubre (no noviembre)', () => {
    const c = tdc('Mercado', 13, 700);
    const movs = [
      cargo('2026-10-10', 350), // corte oct-13 → octubre
      cargo('2026-10-14', 350), // corte nov-13 → futuro
    ];
    const d = desgloseSaldoTdc(c, movs, hoy14);
    expect(d.etiquetaCiclo).toBe('octubre');
    expect(d.fechaCorte!.getMonth()).toBe(9);
    expect(d.fechaCorte!.getDate()).toBe(13);
    expect(d.alCorte).toBe(350);
    expect(d.despuesDelCorte).toBe(350);
    expect(d.futuros.map((f) => f.etiqueta)).toEqual(['noviembre']);
    expect(d.futuros[0].monto).toBe(350);
  });

  it('valida N TDC con distintos días de corte el 14-oct', () => {
    const tarjetas = [
      { dia: 5, compraAntes: '2026-10-05', compraDespues: '2026-10-06', cerrado: true },
      { dia: 13, compraAntes: '2026-10-13', compraDespues: '2026-10-14', cerrado: true },
      { dia: 20, compraAntes: '2026-10-20', compraDespues: '2026-10-21', cerrado: false },
      { dia: 28, compraAntes: '2026-10-28', compraDespues: '2026-10-29', cerrado: false },
    ];

    for (const t of tarjetas) {
      const c = tdc(`TDC-${t.dia}`, t.dia, 200);
      const ultimo = ultimoCorteCerrado(c, hoy14)!;
      const proximo = proximoCorte(c, hoy14)!;

      if (t.cerrado) {
        // Ya pasó el corte → umbral = corte de este mes; etiqueta = mes del cerrado.
        expect(ultimo.getDate()).toBe(t.dia);
        expect(ultimo.getMonth()).toBe(9);
        expect(proximo.getMonth()).toBe(10); // siguiente mes
        const d = desgloseSaldoTdc(
          c,
          [cargo(t.compraAntes, 100), cargo(t.compraDespues, 100)],
          hoy14,
        );
        expect(d.etiquetaCiclo).withContext(`corte ${t.dia}`).toBe('octubre');
        expect(d.alCorte).withContext(`corte ${t.dia} alCorte`).toBe(100);
        expect(d.despuesDelCorte).withContext(`corte ${t.dia} futuro`).toBe(100);
        expect(d.futuros[0].etiqueta).toBe('noviembre');
      } else {
        // Aún no corta → ciclo abierto = corte de octubre; compra del 14 sigue en octubre.
        expect(proximo.getDate()).toBe(t.dia);
        expect(proximo.getMonth()).toBe(9);
        const d = desgloseSaldoTdc(c, [cargo('2026-10-14', 200)], hoy14);
        expect(d.etiquetaCiclo).withContext(`corte ${t.dia}`).toBe('octubre');
        expect(d.alCorte).withContext(`corte ${t.dia} alCorte`).toBe(200);
        expect(d.despuesDelCorte).withContext(`corte ${t.dia} futuro`).toBe(0);
        expect(d.futuros.length).toBe(0);
      }
    }
  });
});
