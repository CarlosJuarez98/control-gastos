package com.controlgastos.servicio;

import com.controlgastos.dto.CompartidoDtos.FijoPendienteCobro;
import com.controlgastos.modelo.ServicioFijoCompartido;
import com.controlgastos.repositorio.GastoCompartidoRepository;
import com.controlgastos.repositorio.GastoRepository;
import com.controlgastos.repositorio.MovimientoPersonaCompartidaRepository;
import com.controlgastos.repositorio.PersonaCompartidaRepository;
import com.controlgastos.repositorio.ServicioFijoCompartidoRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CompartidoFijoVigenteTest {

    @Test
    void noMarcaAtrasadoSiDiaCobroFueAntesDeRegistrarElFijo() {
        ServicioFijoCompartidoRepository fijoRepo = mock(ServicioFijoCompartidoRepository.class);
        CompartidoService svc = new CompartidoService(
                mock(PersonaCompartidaRepository.class),
                mock(GastoCompartidoRepository.class),
                mock(MovimientoPersonaCompartidaRepository.class),
                fijoRepo,
                mock(GastoRepository.class),
                mock(FinanzasService.class),
                "Mon");

        LocalDate hoy = LocalDate.now();
        int diaPasado = Math.max(1, hoy.getDayOfMonth() - 5);
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setId(1L);
        s.setConcepto("Internet");
        s.setMonto(new BigDecimal("400.00"));
        s.setDiaCobro(diaPasado);
        s.setVigenteDesde(hoy);
        s.setYoPago(true);
        s.setActivo(true);

        when(fijoRepo.findActivosByPropietario("u")).thenReturn(List.of(s));

        List<FijoPendienteCobro> avisos = svc.listarFijosPendientesCobro("u", List.of());
        assertTrue(
                avisos.stream().noneMatch(a -> "VENCIDO".equals(a.estado()) && a.id().equals(1L)),
                "No debe marcar vencido el cobro anterior al alta");
    }
}
