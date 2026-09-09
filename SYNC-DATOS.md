# Sync de datos — Control de gastos

## Usuarios = dueños de los datos

La pantalla **Usuarios** (`CG_USUARIO`) es la lista de logins.
El **nombre de usuario** (ej. `Carlos`, `Mon`) es el `PROPIETARIO` de gastos/ingresos/deudas.

`admin` era solo la semilla antigua: **Carlos = el mismo dueño**. Al bajar de la nube deben aparecer `Carlos` y `Mon`, no `admin`.

## Direcciones

| Acción | Script | Dirección |
|--------|--------|-----------|
| **Sube a la nube** | `scripts\sync-datos-incremental.ps1` | Local → ATP |
| **Baja de la nube** | `scripts\sync-datos-desde-nube.ps1` | ATP → Local (+ tabla Usuarios) |

Convenio: `A:\Programas-java\SYNC-BIDIRECCIONAL.md`.

## Incremental (por defecto)

Solo filas con `ID` mayor al máximo del destino (dueño = `-Propietario`, default `Carlos`).

| Incluye | No incluye |
|---------|------------|
| Datos nuevos del propietario | Edits a filas ya migradas / borrados |
| Al bajar: merge de `CG_USUARIO` | |

`-Full` = reexporta desde id 0.

## Comandos

```powershell
cd A:\Programas-java\control-gastos
# Docker Desktop + oracle-control-gastos healthy

# Subir (Carlos)
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1 -WalletPassword 'WalletPass2798Aa'

# Bajar (usuarios + datos de Carlos)
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1 -WalletPassword 'WalletPass2798Aa'

# Otro usuario
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1 -WalletPassword 'WalletPass2798Aa' -Propietario Mon
```
