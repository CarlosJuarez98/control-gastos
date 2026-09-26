# Sync de datos — Control de gastos

## Usuarios = dueños de los datos

La pantalla **Usuarios** (`CG_USUARIO`) es la lista de logins.
El **nombre de usuario** (ej. `Carlos`, `Mon`) es el `PROPIETARIO` de gastos/ingresos/deudas.

`admin` era solo la semilla antigua: **Carlos = el mismo dueño**. Al bajar de la nube deben aparecer `Carlos` y `Mon`, no `admin`.

## Fuente de verdad

- **Datos reales:** nube (ATP).
- **Local:** pruebas. No se suben datos al decir “sube a la nube”.

## Preferencia

- **Bajar datos** = lo habitual para contexto real en local.
- **Subir datos** = excepcional (solo cambios intencionales que deban vivir en prod).
- Nunca contaminar prod con datos de prueba locales.

## Direcciones

| Frase | Script | Dirección |
|-------|--------|-----------|
| **Sube datos** | `scripts\sync-datos-incremental.ps1` | Local → ATP |
| **Baja datos** / **baja de la nube** | `scripts\sync-datos-desde-nube.ps1` | ATP → Local (+ tabla Usuarios) |
| **Sube a la nube** | (código) | merge + deploy; **sin** sync de datos |

Convenio: `A:\Programas-java\SYNC-BIDIRECCIONAL.md`.

## Incremental (por defecto)

Solo filas con `ID` mayor al máximo del destino (dueño = `-Propietario`, default `Carlos`).

| Incluye | No incluye |
|---------|------------|
| Datos nuevos del propietario | Edits a filas ya migradas / borrados |
| Al bajar: merge de `CG_USUARIO` | |
| Compartido: personas, servicios fijos, gastos, partes, movimientos | |
| `CG_GASTO`: `MESES` y `CUOTA_MENSUAL` (total banco disposición) | |
| `CG_GASTO_MENSUAL`: MSI (`MESES_*`, `MONTO_TOTAL`, origen, día, servicio) | |

`-Full` = reexporta desde id 0 (sigue siendo **solo INSERT** de ids nuevos; no actualiza filas existentes).

Si editaste en local una fila que **ya existe** en ATP, el sync incremental **no** la corrige. Corrige a mano en la nube o vuelve a crear la fila.

## Wallet ATP (secreto)

La contraseña del wallet **no** va en git. Pásala por parámetro o por variable de entorno:

```powershell
$env:CG_WALLET_PASSWORD = '…'   # la del zip Wallet_*.zip en OCI (no la SSH)
```

## Comandos

```powershell
cd A:\Programas-java\control-gastos
# Docker Desktop + oracle-control-gastos healthy
# $env:CG_WALLET_PASSWORD ya definida (o pásala con -WalletPassword)

# Subir datos (Carlos)
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1

# Bajar datos (usuarios + datos de Carlos)
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1

# Otro usuario
powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1 -Propietario Mon
```
