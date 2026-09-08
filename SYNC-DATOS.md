# Sync de datos local → nube (rápido)

## Acuerdo de trabajo

1. Desarrollas y registras en **local**.
2. Cuando digas **“sube a la nube”**, se sube:
   - **código** (solo si cambió; Docker usa caché → más rápido)
   - **datos nuevos** (incremental, no toda la BD)

## Sync incremental (por defecto)

Solo filas con `ID` mayor al máximo que ya existe en la nube (por tabla, dueño `admin`).

| Incluye | No incluye (por defecto) |
|---------|---------------------------|
| Gastos / ingresos / cuentas nuevos | Edits a filas viejas ya migradas |
| | Borrados en local |
| | Usuarios de login (`CG_USUARIO`) |

Si editaste registros viejos y quieres reflejarlos: di **“sube datos completos”**.

## Por qué es rápido

- ~segundos si solo hay decenas/cientos de filas nuevas
- No reenvía los ~1000+ gastos históricos cada vez
- Rebuild Docker solo cuando cambió código

## Script

```powershell
cd A:\Programas-java\control-gastos
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1
```

Modo completo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1 -Full
```

Requisitos: Docker local (`oracle-control-gastos`), SSH a la VM, wallet ATP en `~/control-gastos/wallet`.

Estado local del último sync: `_migrate/sync-state.json` (no va a git).
