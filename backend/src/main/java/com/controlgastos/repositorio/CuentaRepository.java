package com.controlgastos.repositorio;

import com.controlgastos.modelo.Cuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface CuentaRepository extends JpaRepository<Cuenta, Long> {
    Optional<Cuenta> findByPropietarioAndNombreIgnoreCase(String propietario, String nombre);

    List<Cuenta> findByPropietarioOrderByNombreAsc(String propietario);

    @Query("""
            select c from Cuenta c
            where c.propietario = ?1
              and (c.archivada = false or c.archivada is null)
            order by c.nombre asc
            """)
    List<Cuenta> findActivasByPropietario(String propietario);

    @Query("""
            select coalesce(sum(c.saldoActual), 0) from Cuenta c
            where c.propietario = ?1
              and (c.archivada = false or c.archivada is null)
              and c.tipo <> 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaDeudas(String propietario);

    @Query("""
            select coalesce(sum(c.saldoActual), 0) from Cuenta c
            where c.propietario = ?1
              and (c.archivada = false or c.archivada is null)
              and c.tipo = 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaPrestamista(String propietario);
}
