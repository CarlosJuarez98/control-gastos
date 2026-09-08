package com.controlgastos.repositorio;

import com.controlgastos.modelo.SaldoSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SaldoSnapshotRepository extends JpaRepository<SaldoSnapshot, Long> {
    Optional<SaldoSnapshot> findFirstByPropietarioOrderByFechaDescIdDesc(String propietario);

    List<SaldoSnapshot> findByPropietarioOrderByFechaDescIdDesc(String propietario);
}
