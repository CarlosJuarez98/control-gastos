package com.controlgastos.repositorio;

import com.controlgastos.modelo.PersonaCompartida;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PersonaCompartidaRepository extends JpaRepository<PersonaCompartida, Long> {

    @Query("""
            select p from PersonaCompartida p
            where p.propietario = ?1
              and (p.activa = true or p.activa is null)
            order by lower(p.nombre) asc, p.id asc
            """)
    List<PersonaCompartida> findActivasByPropietario(String propietario);

    @Query("""
            select p from PersonaCompartida p
            where p.propietario = ?1
            order by p.activa desc, lower(p.nombre) asc, p.id asc
            """)
    List<PersonaCompartida> findAllByPropietario(String propietario);

    Optional<PersonaCompartida> findByIdAndPropietario(Long id, String propietario);
}
