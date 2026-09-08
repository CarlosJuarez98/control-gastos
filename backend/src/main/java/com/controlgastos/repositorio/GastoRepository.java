package com.controlgastos.repositorio;

import com.controlgastos.modelo.Gasto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface GastoRepository extends JpaRepository<Gasto, Long> {
    List<Gasto> findByPropietarioOrderByFechaDescIdDesc(String propietario);

    List<Gasto> findByPropietarioAndFechaBetweenOrderByFechaDescIdDesc(
            String propietario, LocalDate desde, LocalDate hasta);

    @Query("select coalesce(sum(g.monto), 0) from Gasto g where g.propietario = ?1")
    BigDecimal sumaTotal(String propietario);

    @Query("select coalesce(sum(g.monto), 0) from Gasto g where g.propietario = ?1 and g.fecha between ?2 and ?3")
    BigDecimal sumaEntre(String propietario, LocalDate desde, LocalDate hasta);

    /** Gastos que sí restan de liquidez (efectivo / sin forma = viejos). */
    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where g.propietario = ?1
              and (g.formaPago is null or upper(g.formaPago) <> 'TARJETA')
            """)
    BigDecimal sumaLiquidaTotal(String propietario);

    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where g.propietario = ?1
              and (g.formaPago is null or upper(g.formaPago) <> 'TARJETA')
              and g.fecha between ?2 and ?3
            """)
    BigDecimal sumaLiquidaEntre(String propietario, LocalDate desde, LocalDate hasta);

    @Query("""
            select g.categoria, coalesce(sum(g.monto), 0) from Gasto g
            where g.propietario = ?1
            group by g.categoria order by sum(g.monto) desc
            """)
    List<Object[]> sumaPorCategoria(String propietario);

    @Query("""
            select g.categoria, coalesce(sum(g.monto), 0) from Gasto g
            where g.propietario = ?1 and g.fecha between ?2 and ?3
            group by g.categoria order by sum(g.monto) desc
            """)
    List<Object[]> sumaPorCategoriaEntre(String propietario, LocalDate desde, LocalDate hasta);

    @Query("select coalesce(max(g.id), 0) from Gasto g where g.propietario = ?1")
    Long maxId(String propietario);

    @Query("select coalesce(max(g.id), 0) from Gasto g where g.propietario = ?1 and g.fecha < ?2")
    Long maxIdAntesDe(String propietario, LocalDate fecha);

    @Query("""
            select coalesce(sum(g.monto), 0) from Gasto g
            where g.propietario = ?1
              and g.id > ?2
              and (g.formaPago is null or upper(g.formaPago) <> 'TARJETA')
            """)
    BigDecimal sumaLiquidaDespuesDeId(String propietario, Long id);
}
