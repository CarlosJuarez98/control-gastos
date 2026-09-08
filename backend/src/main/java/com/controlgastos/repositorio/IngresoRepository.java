package com.controlgastos.repositorio;

import com.controlgastos.modelo.Ingreso;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface IngresoRepository extends JpaRepository<Ingreso, Long> {
    List<Ingreso> findByPropietarioOrderByFechaDescIdDesc(String propietario);

    List<Ingreso> findByPropietarioAndFechaBetweenOrderByFechaDescIdDesc(
            String propietario, LocalDate desde, LocalDate hasta);

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i where i.propietario = ?1")
    BigDecimal sumaTotal(String propietario);

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i where i.propietario = ?1 and i.fecha between ?2 and ?3")
    BigDecimal sumaEntre(String propietario, LocalDate desde, LocalDate hasta);

    @Query("select coalesce(max(i.id), 0) from Ingreso i where i.propietario = ?1")
    Long maxId(String propietario);

    @Query("select coalesce(max(i.id), 0) from Ingreso i where i.propietario = ?1 and i.fecha < ?2")
    Long maxIdAntesDe(String propietario, LocalDate fecha);

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i where i.propietario = ?1 and i.id > ?2")
    BigDecimal sumaDespuesDeId(String propietario, Long id);
}
