package com.controlgastos.repositorio;

import com.controlgastos.modelo.MovimientoPersonaCompartida;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface MovimientoPersonaCompartidaRepository extends JpaRepository<MovimientoPersonaCompartida, Long> {

    @Query("""
            select m from MovimientoPersonaCompartida m
            where m.propietario = ?1
              and (m.anulado = false or m.anulado is null)
            order by m.fecha desc, m.id desc
            """)
    List<MovimientoPersonaCompartida> findActivosByPropietario(String propietario);

    @Query("""
            select m from MovimientoPersonaCompartida m
            where m.persona.id = ?1
              and m.propietario = ?2
              and (m.anulado = false or m.anulado is null)
            order by m.fecha desc, m.id desc
            """)
    List<MovimientoPersonaCompartida> findActivosByPersonaAndPropietario(Long personaId, String propietario);

    List<MovimientoPersonaCompartida> findByGastoCompartidoIdAndPropietario(Long gastoCompartidoId, String propietario);

    Optional<MovimientoPersonaCompartida> findByIdAndPropietario(Long id, String propietario);
}
