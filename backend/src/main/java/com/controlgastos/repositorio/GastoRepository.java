package com.controlgastos.repositorio;

import com.controlgastos.modelo.Gasto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface GastoRepository extends JpaRepository<Gasto, Long> {
    List<Gasto> findAllByOrderByFechaDescIdDesc();
    List<Gasto> findByFechaBetweenOrderByFechaDescIdDesc(LocalDate desde, LocalDate hasta);

    @Query("select coalesce(sum(g.monto), 0) from Gasto g")
    BigDecimal sumaTotal();

    @Query("select coalesce(sum(g.monto), 0) from Gasto g where g.fecha between ?1 and ?2")
    BigDecimal sumaEntre(LocalDate desde, LocalDate hasta);

    @Query("select g.categoria, coalesce(sum(g.monto), 0) from Gasto g group by g.categoria order by sum(g.monto) desc")
    List<Object[]> sumaPorCategoria();
}
