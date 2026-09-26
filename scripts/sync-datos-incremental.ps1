# Sync incremental de datos: Oracle local → ATP (nube).
# Solo exporta filas con ID mayor al último sync (rápido).
#
# Uso (desde la raíz del proyecto):
#   $env:CG_WALLET_PASSWORD = '…'   # passphrase del zip Wallet ATP (no SSH)
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1 -WalletPassword '…'
#
# Requiere: Docker (oracle-control-gastos), SSH a la VM, wallet en la VM.
# No incluye CG_USUARIO (cuentas de login se gestionan en la app).

param(
  [string]$SshKey = "A:\Descargas\ssh-key-2026-09-07.key",
  [string]$SshHost = "opc@163.192.146.143",
  [string]$Propietario = "Carlos",
  [string]$WalletPassword = $env:CG_WALLET_PASSWORD,
  [switch]$Full
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MigrateDir = Join-Path $Root "_migrate"
$StateFile = Join-Path $MigrateDir "sync-state.json"
$RemoteDir = "~/control-gastos/_migrate_in"
$SshOpts = @("-i", $SshKey, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")

$Tables = @(
  @{ Name = "CG_CUENTA";        File = "01_CG_CUENTA.sql";        Order = 1 },
  @{ Name = "CG_INGRESO";       File = "02_CG_INGRESO.sql";       Order = 2 },
  @{ Name = "CG_GASTO_MENSUAL"; File = "03_CG_GASTO_MENSUAL.sql"; Order = 3 },
  @{ Name = "CG_MOVIMIENTO";    File = "04_CG_MOVIMIENTO.sql";    Order = 4 },
  @{ Name = "CG_GASTO";         File = "05_CG_GASTO.sql";         Order = 5 },
  @{ Name = "CG_SALDO";         File = "06_CG_SALDO.sql";         Order = 6 },
  @{ Name = "CG_DENOMINACION";  File = "07_CG_DENOMINACION.sql";  Order = 7 },
  @{ Name = "CG_HISTORIAL_ANUAL"; File = "08_CG_HISTORIAL_ANUAL.sql"; Order = 8 },
  @{ Name = "CG_PERSONA_COMPARTIDA"; File = "09_CG_PERSONA_COMPARTIDA.sql"; Order = 9 },
  @{ Name = "CG_SERVICIO_FIJO_COMPARTIDO"; File = "10_CG_SERVICIO_FIJO_COMPARTIDO.sql"; Order = 10 },
  @{ Name = "CG_GASTO_COMPARTIDO"; File = "11_CG_GASTO_COMPARTIDO.sql"; Order = 11 },
  @{ Name = "CG_PARTE_GASTO_COMPARTIDO"; File = "12_CG_PARTE_GASTO_COMPARTIDO.sql"; Order = 12 },
  @{ Name = "CG_MOV_PERSONA_COMPARTIDA"; File = "13_CG_MOV_PERSONA_COMPARTIDA.sql"; Order = 13 }
)

New-Item -ItemType Directory -Force -Path $MigrateDir | Out-Null

function Get-State {
  if (-not (Test-Path $StateFile)) {
    return @{ lastLocalMaxId = @{} }
  }
  return Get-Content $StateFile -Raw | ConvertFrom-Json | ConvertTo-HashtableDeep
}

function ConvertTo-HashtableDeep($obj) {
  if ($null -eq $obj) { return @{} }
  if ($obj -is [System.Collections.IDictionary]) { return $obj }
  $h = @{}
  foreach ($p in $obj.PSObject.Properties) {
    if ($p.Value -is [System.Management.Automation.PSCustomObject]) {
      $h[$p.Name] = ConvertTo-HashtableDeep $p.Value
    } else {
      $h[$p.Name] = $p.Value
    }
  }
  return $h
}

function Save-State($state) {
  $state | ConvertTo-Json -Depth 5 | Set-Content -Path $StateFile -Encoding UTF8
}

function Invoke-LocalSql([string]$sql) {
  $sql | docker exec -i oracle-control-gastos sqlplus -S controlgastos/ControlGastos2026@XEPDB1
}

Write-Host "== Sync incremental local → nube ==" -ForegroundColor Cyan
Write-Host "Propietario: $Propietario  Full=$Full"

# 1) Max IDs en la nube (ATP) vía SSH + Python
# ewallet.pem está cifrado: hace falta -WalletPassword (la del zip ATP en OCI), no la de SSH.
$pyMax = @"
import oracledb, os, json
wallet = os.path.expanduser("~/control-gastos/wallet")
wp = os.environ.get("WALLET_PASSWORD", "")
kwargs = dict(
    user="controlgastos",
    password="CgApp#2798Cloud!",
    dsn="cgatodb_tp",
    config_dir=wallet,
    wallet_location=wallet,
)
if wp:
    kwargs["wallet_password"] = wp
conn = oracledb.connect(**kwargs)
cur = conn.cursor()
tables = ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION","CG_HISTORIAL_ANUAL","CG_PERSONA_COMPARTIDA","CG_SERVICIO_FIJO_COMPARTIDO","CG_GASTO_COMPARTIDO","CG_PARTE_GASTO_COMPARTIDO","CG_MOV_PERSONA_COMPARTIDA"]
out = {}
prop = os.environ.get("PROP", "Carlos")
for t in tables:
    try:
        if t == "CG_PARTE_GASTO_COMPARTIDO":
            cur.execute(
                "select nvl(max(p.id),0) from CG_PARTE_GASTO_COMPARTIDO p "
                "join CG_GASTO_COMPARTIDO g on g.id = p.gasto_compartido_id "
                "where nvl(g.propietario, :p) = :p",
                p=prop,
            )
        else:
            cur.execute(f"select nvl(max(id),0) from {t} where nvl(propietario, :p) = :p", p=prop)
        out[t] = int(cur.fetchone()[0])
    except Exception:
        out[t] = 0
print(json.dumps(out))
conn.close()
"@
$pyMaxPath = Join-Path $MigrateDir "cloud_max_ids.py"
Set-Content -Path $pyMaxPath -Value $pyMax -Encoding UTF8
scp @SshOpts $pyMaxPath "${SshHost}:/tmp/cloud_max_ids.py" | Out-Null
if (-not $WalletPassword) {
  Write-Host "Falta wallet: define `$env:CG_WALLET_PASSWORD o pasa -WalletPassword (zip ATP en OCI, no SSH)." -ForegroundColor Yellow
  throw "Falta CG_WALLET_PASSWORD / -WalletPassword"
}
$cloudJson = ssh @SshOpts $SshHost "PROP='$Propietario' WALLET_PASSWORD='$WalletPassword' python3 /tmp/cloud_max_ids.py"
if (-not $cloudJson) { throw "No se pudieron leer max IDs de la nube (¿wallet password incorrecta o pip install oracledb?)" }
Write-Host "Max IDs nube: $cloudJson"
$cloudMax = $cloudJson | ConvertFrom-Json

# 2) Export local solo id > cloudMax (o full)
$exportSqlPath = Join-Path $MigrateDir "export_incremental.sql"
# Reuse existing export approach: call docker with a generated script
# For speed we export via a small Python on host if oracledb available, else sqlplus spool of IDs

$state = Get-State
if (-not $state.lastLocalMaxId) { $state.lastLocalMaxId = @{} }

# Install/check oracledb on VM for import later
ssh @SshOpts $SshHost "pip3 install --user oracledb -q 2>/dev/null; mkdir -p $RemoteDir"

# Generate incremental inserts using local sqlplus (same style as previous full export)
$gen = @"
SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF ECHO OFF TRIMSPOOL ON LINESIZE 32767 LONG 100000
"@

foreach ($t in ($Tables | Sort-Object Order)) {
  $name = $t.Name
  $file = Join-Path $MigrateDir $t.File
  $minId = 0
  if (-not $Full) {
    $minId = [int64]($cloudMax.$name)
  }
  Write-Host "Export $name where id > $minId ..."

  # Table-specific INSERT generators (columns must match entities)
  $select = switch ($name) {
    "CG_CUENTA" {
      @"
SELECT 'INSERT INTO CG_CUENTA (ID,NOMBRE,TIPO,SALDO_ACTUAL,PROPIETARIO) VALUES ('||ID||','''||REPLACE(NOMBRE,'''','''''')||''','''||REPLACE(NVL(TIPO,''),'''','''''')||''','||SALDO_ACTUAL||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_CUENTA WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_INGRESO" {
      @"
SELECT 'INSERT INTO CG_INGRESO (ID,FECHA,CONCEPTO,MONTO,PROPIETARIO) VALUES ('||ID||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||REPLACE(CONCEPTO,'''','''''')||''','||MONTO||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_INGRESO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_GASTO_MENSUAL" {
      @"
SELECT 'INSERT INTO CG_GASTO_MENSUAL (ID,MOTIVO,MONTO,ACTIVO,MESES_TOTALES,MESES_RESTANTES,MONTO_TOTAL,GASTO_ORIGEN_ID,SERVICIO_FIJO_COMPARTIDO_ID,DIA_PAGO,PROPIETARIO) VALUES ('||ID||','''||REPLACE(MOTIVO,'''','''''')||''','||MONTO||','||CASE WHEN ACTIVO=1 THEN '1' ELSE '0' END||','||CASE WHEN MESES_TOTALES IS NULL THEN 'NULL' ELSE TO_CHAR(MESES_TOTALES) END||','||CASE WHEN MESES_RESTANTES IS NULL THEN 'NULL' ELSE TO_CHAR(MESES_RESTANTES) END||','||CASE WHEN MONTO_TOTAL IS NULL THEN 'NULL' ELSE TO_CHAR(MONTO_TOTAL) END||','||CASE WHEN GASTO_ORIGEN_ID IS NULL THEN 'NULL' ELSE TO_CHAR(GASTO_ORIGEN_ID) END||','||CASE WHEN SERVICIO_FIJO_COMPARTIDO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(SERVICIO_FIJO_COMPARTIDO_ID) END||','||CASE WHEN DIA_PAGO IS NULL THEN 'NULL' ELSE TO_CHAR(DIA_PAGO) END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_GASTO_MENSUAL WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_MOVIMIENTO" {
      @"
SELECT 'INSERT INTO CG_MOVIMIENTO (ID,CUENTA_ID,FECHA,TIPO,MONTO,CONCEPTO,PROPIETARIO) VALUES ('||ID||','||CUENTA_ID||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||TIPO||''','||MONTO||','||CASE WHEN CONCEPTO IS NULL THEN 'NULL' ELSE ''''||REPLACE(CONCEPTO,'''','''''')||'''' END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_MOVIMIENTO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_GASTO" {
      @"
SELECT 'INSERT INTO CG_GASTO (ID,FECHA,CATEGORIA,MONTO,MOTIVO,FORMA_PAGO,CUENTA_ID,MOVIMIENTO_ID,MESES,CUOTA_MENSUAL,PROPIETARIO) VALUES ('||ID||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||REPLACE(CATEGORIA,'''','''''')||''','||MONTO||','||CASE WHEN MOTIVO IS NULL THEN 'NULL' ELSE ''''||REPLACE(MOTIVO,'''','''''')||'''' END||','||CASE WHEN FORMA_PAGO IS NULL THEN 'NULL' ELSE ''''||FORMA_PAGO||'''' END||','||CASE WHEN CUENTA_ID IS NULL THEN 'NULL' ELSE TO_CHAR(CUENTA_ID) END||','||CASE WHEN MOVIMIENTO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(MOVIMIENTO_ID) END||','||CASE WHEN MESES IS NULL THEN 'NULL' ELSE TO_CHAR(MESES) END||','||CASE WHEN CUOTA_MENSUAL IS NULL THEN 'NULL' ELSE TO_CHAR(CUOTA_MENSUAL) END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_GASTO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_SALDO" {
      @"
SELECT 'INSERT INTO CG_SALDO (ID,FECHA,SALDO_TOTAL,TOTAL_FISICO,DINERO_BBVA,DINERO_MERCADO_LIBRE,DINERO_NU,DINERO_DIDI,ULTIMO_INGRESO_ID,ULTIMO_GASTO_ID,ULTIMO_MOVIMIENTO_ID,PROPIETARIO) VALUES ('||ID||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','||NVL(SALDO_TOTAL,0)||','||CASE WHEN TOTAL_FISICO IS NULL THEN 'NULL' ELSE TO_CHAR(TOTAL_FISICO) END||','||CASE WHEN DINERO_BBVA IS NULL THEN 'NULL' ELSE TO_CHAR(DINERO_BBVA) END||','||CASE WHEN DINERO_MERCADO_LIBRE IS NULL THEN 'NULL' ELSE TO_CHAR(DINERO_MERCADO_LIBRE) END||','||CASE WHEN DINERO_NU IS NULL THEN 'NULL' ELSE TO_CHAR(DINERO_NU) END||','||CASE WHEN DINERO_DIDI IS NULL THEN 'NULL' ELSE TO_CHAR(DINERO_DIDI) END||','||CASE WHEN ULTIMO_INGRESO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(ULTIMO_INGRESO_ID) END||','||CASE WHEN ULTIMO_GASTO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(ULTIMO_GASTO_ID) END||','||CASE WHEN ULTIMO_MOVIMIENTO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(ULTIMO_MOVIMIENTO_ID) END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_SALDO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_DENOMINACION" {
      @"
SELECT 'INSERT INTO CG_DENOMINACION (ID,VALOR,CANTIDAD,PROPIETARIO) VALUES ('||ID||','||VALOR||','||CANTIDAD||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
FROM CG_DENOMINACION WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_HISTORIAL_ANUAL" {
      @"
SELECT 'INSERT INTO CG_HISTORIAL_ANUAL (ID,PROPIETARIO,ANIO,TOTAL_INGRESOS,TOTAL_GASTOS) VALUES ('||ID||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''','||ANIO||','||NVL(TOTAL_INGRESOS,0)||','||NVL(TOTAL_GASTOS,0)||');'
FROM CG_HISTORIAL_ANUAL WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_PERSONA_COMPARTIDA" {
      @"
SELECT 'INSERT INTO CG_PERSONA_COMPARTIDA (ID,NOMBRE,PROPIETARIO,ACTIVA,EFECTIVO_GUARDADO) VALUES ('||ID||','''||REPLACE(NOMBRE,'''','''''')||''','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''','||CASE WHEN ACTIVA=1 THEN '1' ELSE '0' END||','||NVL(EFECTIVO_GUARDADO,0)||');'
FROM CG_PERSONA_COMPARTIDA WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_SERVICIO_FIJO_COMPARTIDO" {
      @"
SELECT 'INSERT INTO CG_SERVICIO_FIJO_COMPARTIDO (ID,CONCEPTO,MONTO,PROPIETARIO,PERSONA_IDS,DIA_COBRO,INCLUYE_PRINCIPAL,YO_PAGO,PERFILES_PRINCIPAL,PERSONA_PESOS,ACTIVO) VALUES ('||ID||','''||REPLACE(CONCEPTO,'''','''''')||''','||MONTO||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''','''||REPLACE(NVL(PERSONA_IDS,'-'),'''','''''')||''','||NVL(DIA_COBRO,1)||','||CASE WHEN NVL(INCLUYE_PRINCIPAL,1)=1 THEN '1' ELSE '0' END||','||CASE WHEN NVL(YO_PAGO,1)=1 THEN '1' ELSE '0' END||','||NVL(PERFILES_PRINCIPAL,1)||','''||REPLACE(NVL(PERSONA_PESOS,'-'),'''','''''')||''','||CASE WHEN ACTIVO=1 THEN '1' ELSE '0' END||');'
FROM CG_SERVICIO_FIJO_COMPARTIDO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_GASTO_COMPARTIDO" {
      @"
SELECT 'INSERT INTO CG_GASTO_COMPARTIDO (ID,TIPO,CONCEPTO,MONTO_TOTAL,FECHA,PROPIETARIO,FORMA_PAGO,CUENTA_ID,MESES,GASTO_ID,SERVICIO_FIJO_ID,PERIODO,ANULADO) VALUES ('||ID||','''||TIPO||''','''||REPLACE(CONCEPTO,'''','''''')||''','||MONTO_TOTAL||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''','''||FORMA_PAGO||''','||CASE WHEN CUENTA_ID IS NULL THEN 'NULL' ELSE TO_CHAR(CUENTA_ID) END||','||CASE WHEN MESES IS NULL THEN 'NULL' ELSE TO_CHAR(MESES) END||','||CASE WHEN GASTO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(GASTO_ID) END||','||CASE WHEN SERVICIO_FIJO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(SERVICIO_FIJO_ID) END||','||CASE WHEN PERIODO IS NULL THEN 'NULL' ELSE ''''||PERIODO||'''' END||','||CASE WHEN ANULADO=1 THEN '1' ELSE '0' END||');'
FROM CG_GASTO_COMPARTIDO WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_PARTE_GASTO_COMPARTIDO" {
      @"
SELECT 'INSERT INTO CG_PARTE_GASTO_COMPARTIDO (ID,GASTO_COMPARTIDO_ID,PERSONA_ID,ES_PRINCIPAL,MONTO,PERFILES) VALUES ('||p.ID||','||p.GASTO_COMPARTIDO_ID||','||CASE WHEN p.PERSONA_ID IS NULL THEN 'NULL' ELSE TO_CHAR(p.PERSONA_ID) END||','||CASE WHEN p.ES_PRINCIPAL=1 THEN '1' ELSE '0' END||','||p.MONTO||','||NVL(p.PERFILES,1)||');'
FROM CG_PARTE_GASTO_COMPARTIDO p
JOIN CG_GASTO_COMPARTIDO g ON g.ID = p.GASTO_COMPARTIDO_ID
WHERE p.ID > $minId AND NVL(g.PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
    "CG_MOV_PERSONA_COMPARTIDA" {
      @"
SELECT 'INSERT INTO CG_MOV_PERSONA_COMPARTIDA (ID,PERSONA_ID,PROPIETARIO,FECHA,TIPO,MONTO,CONCEPTO,GASTO_COMPARTIDO_ID,INGRESO_ID,DESDE_GUARDADO,CONCEPTO_DESTINO,DESDE_ANTICIPO,ANULADO) VALUES ('||ID||','||PERSONA_ID||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||TIPO||''','||MONTO||','||CASE WHEN CONCEPTO IS NULL THEN 'NULL' ELSE ''''||REPLACE(CONCEPTO,'''','''''')||'''' END||','||CASE WHEN GASTO_COMPARTIDO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(GASTO_COMPARTIDO_ID) END||','||CASE WHEN INGRESO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(INGRESO_ID) END||','||CASE WHEN NVL(DESDE_GUARDADO,0)=1 THEN '1' ELSE '0' END||','||CASE WHEN CONCEPTO_DESTINO IS NULL THEN 'NULL' ELSE ''''||REPLACE(CONCEPTO_DESTINO,'''','''''')||'''' END||','||CASE WHEN NVL(DESDE_ANTICIPO,0)=1 THEN '1' ELSE '0' END||','||CASE WHEN ANULADO=1 THEN '1' ELSE '0' END||');'
FROM CG_MOV_PERSONA_COMPARTIDA WHERE ID > $minId AND NVL(PROPIETARIO,'$Propietario') = '$Propietario';
"@
    }
  }

  $script = @"
SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF ECHO OFF TRIMSPOOL ON LINESIZE 32767
SPOOL /tmp/$($t.File)
$select
SPOOL OFF
EXIT
"@
  $script | docker exec -i oracle-control-gastos sqlplus -S controlgastos/ControlGastos2026@XEPDB1 | Out-Null
  docker cp "oracle-control-gastos:/tmp/$($t.File)" $file
  $lines = 0
  if (Test-Path $file) {
    $lines = @(Get-Content $file | Where-Object { $_ -match '^INSERT ' }).Count
  }
  Write-Host "  -> $lines inserts"
}

# 3) SCP + import on VM
scp @SshOpts (Join-Path $MigrateDir "*.sql") "${SshHost}:${RemoteDir}/"

$importPy = @"
import oracledb, os, glob
wallet = os.path.expanduser("~/control-gastos/wallet")
wp = os.environ.get("WALLET_PASSWORD", "")
kwargs = dict(user="controlgastos", password="CgApp#2798Cloud!", dsn="cgatodb_tp",
              config_dir=wallet, wallet_location=wallet)
if wp:
    kwargs["wallet_password"] = wp
conn = oracledb.connect(**kwargs)
cur = conn.cursor()
for t in ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION","CG_HISTORIAL_ANUAL","CG_PERSONA_COMPARTIDA","CG_SERVICIO_FIJO_COMPARTIDO","CG_GASTO_COMPARTIDO","CG_PARTE_GASTO_COMPARTIDO","CG_MOV_PERSONA_COMPARTIDA"]:
    try:
        cur.execute(f"ALTER TABLE {t} MODIFY ID GENERATED BY DEFAULT AS IDENTITY")
    except Exception:
        pass
files = sorted(glob.glob(os.path.expanduser("~/control-gastos/_migrate_in/*.sql")))
total = 0
for f in files:
    if os.path.basename(f).startswith("export"):
        continue
    sql = open(f, encoding="utf-8", errors="ignore").read()
    stmts = [s.strip() for s in sql.split(";") if s.strip().upper().startswith("INSERT")]
    ok = 0
    for s in stmts:
        try:
            cur.execute(s)
            ok += 1
        except Exception as e:
            msg = str(e)
            if "ORA-00001" in msg:
                continue
            print("ERR", f, msg[:200])
    conn.commit()
    print(f"{os.path.basename(f)}: {ok}/{len(stmts)}")
    total += ok
for t in ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION","CG_HISTORIAL_ANUAL","CG_PERSONA_COMPARTIDA","CG_SERVICIO_FIJO_COMPARTIDO","CG_GASTO_COMPARTIDO","CG_PARTE_GASTO_COMPARTIDO","CG_MOV_PERSONA_COMPARTIDA"]:
    try:
        cur.execute(f"ALTER TABLE {t} MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)")
    except Exception:
        pass
conn.commit()
print("TOTAL_OK", total)
conn.close()
"@

$importPy | ssh @SshOpts $SshHost "cat > /tmp/import_inc.py && WALLET_PASSWORD='$WalletPassword' python3 /tmp/import_inc.py"

# 4) Update local sync state with local max ids
foreach ($t in $Tables) {
  $maxLocal = (Invoke-LocalSql "SET PAGESIZE 0 FEEDBACK OFF;`nSELECT NVL(MAX(ID),0) FROM $($t.Name);`nEXIT;") | Select-Object -Last 1
  $state.lastLocalMaxId[$t.Name] = [int64]("$maxLocal".Trim())
}
$state.lastSyncUtc = (Get-Date).ToUniversalTime().ToString("o")
Save-State $state
Write-Host "Estado guardado en $StateFile" -ForegroundColor Green
Write-Host "Listo. Sync incremental terminado." -ForegroundColor Green
