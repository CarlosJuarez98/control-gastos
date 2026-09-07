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

    /** Gastos que sí restan de liquidez (efectivo / sin forma = viejos). */
    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where g.formaPago is null or upper(g.formaPago) <> 'TARJETA'
            """)
    BigDecimal sumaLiquidaTotal();

    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where (g.formaPago is null or upper(g.formaPago) <> 'TARJETA')
              and g.fecha between ?1 and ?2
            """)
    BigDecimal sumaLiquidaEntre(LocalDate desde, LocalDate hasta);

    @Query("select g.categoria, coalesce(sum(g.monto), 0) from Gasto g group by g.categoria order by sum(g.monto) desc")
    List<Object[]> sumaPorCategoria();

    @Query("select g.categoria, coalesce(sum(g.monto), 0) from Gasto g where g.fecha between ?1 and ?2 group by g.categoria order by sum(g.monto) desc")
    List<Object[]> sumaPorCategoriaEntre(LocalDate desde, LocalDate hasta);

    @Query("select coalesce(max(g.id), 0) from Gasto g")
    Long maxId();

    @Query("select coalesce(max(g.id), 0) from Gasto g where g.fecha < ?1")
    Long maxIdAntesDe(LocalDate fecha);

    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where g.id > ?1
              and (g.formaPago is null or upper(g.formaPago) <> 'TARJETA')
            """)
    BigDecimal sumaLiquidaDespuesDeId(Long id);
}
