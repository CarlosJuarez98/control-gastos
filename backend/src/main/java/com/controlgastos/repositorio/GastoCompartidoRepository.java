package com.controlgastos.repositorio;

import com.controlgastos.modelo.GastoCompartido;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface GastoCompartidoRepository extends JpaRepository<GastoCompartido, Long> {

    @Query("""
            select g from GastoCompartido g
            where g.propietario = ?1
              and (g.anulado = false or g.anulado is null)
            order by g.fecha desc, g.id desc
            """)
    List<GastoCompartido> findActivosByPropietario(String propietario);

    Optional<GastoCompartido> findByIdAndPropietario(Long id, String propietario);

    @Query("""
            select g from GastoCompartido g
            where g.propietario = ?1
              and g.servicioFijoId = ?2
              and g.periodo = ?3
              and (g.anulado = false or g.anulado is null)
            """)
    Optional<GastoCompartido> findActivoByServicioYPeriodo(
            String propietario, Long servicioFijoId, String periodo);
}
