package com.controlgastos.repositorio;

import com.controlgastos.modelo.Ingreso;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface IngresoRepository extends JpaRepository<Ingreso, Long> {
    List<Ingreso> findAllByOrderByFechaDescIdDesc();
    List<Ingreso> findByFechaBetweenOrderByFechaDescIdDesc(LocalDate desde, LocalDate hasta);

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i")
    BigDecimal sumaTotal();

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i where i.fecha between ?1 and ?2")
    BigDecimal sumaEntre(LocalDate desde, LocalDate hasta);

    @Query("select coalesce(max(i.id), 0) from Ingreso i")
    Long maxId();

    @Query("select coalesce(max(i.id), 0) from Ingreso i where i.fecha < ?1")
    Long maxIdAntesDe(LocalDate fecha);

    @Query("select coalesce(sum(i.monto), 0) from Ingreso i where i.id > ?1")
    BigDecimal sumaDespuesDeId(Long id);
}
