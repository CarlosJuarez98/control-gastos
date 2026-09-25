package com.controlgastos.repositorio;

import com.controlgastos.modelo.ServicioFijoCompartido;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ServicioFijoCompartidoRepository extends JpaRepository<ServicioFijoCompartido, Long> {

    @Query("""
            select s from ServicioFijoCompartido s
            where s.propietario = ?1
              and (s.activo = true or s.activo is null)
            order by lower(s.concepto) asc, s.id asc
            """)
    List<ServicioFijoCompartido> findActivosByPropietario(String propietario);

    Optional<ServicioFijoCompartido> findByIdAndPropietario(Long id, String propietario);
}
