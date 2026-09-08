# Sync incremental de datos: Oracle local → ATP (nube).
# Solo exporta filas con ID mayor al último sync (rápido).
#
# Uso (desde la raíz del proyecto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-incremental.ps1
#
# Requiere: Docker (oracle-control-gastos), SSH a la VM, wallet en la VM.
# No incluye CG_USUARIO (cuentas de login se gestionan en la app).

param(
  [string]$SshKey = "A:\Descargas\ssh-key-2026-09-07.key",
  [string]$SshHost = "opc@163.192.146.143",
  [string]$Propietario = "admin",
  [switch]$Full
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MigrateDir = Join-Path $Root "_migrate"
$StateFile = Join-Path $MigrateDir "sync-state.json"
$RemoteDir = "~/control-gastos/_migrate_in"

$Tables = @(
  @{ Name = "CG_CUENTA";        File = "01_CG_CUENTA.sql";        Order = 1 },
  @{ Name = "CG_INGRESO";       File = "02_CG_INGRESO.sql";       Order = 2 },
  @{ Name = "CG_GASTO_MENSUAL"; File = "03_CG_GASTO_MENSUAL.sql"; Order = 3 },
  @{ Name = "CG_MOVIMIENTO";    File = "04_CG_MOVIMIENTO.sql";    Order = 4 },
  @{ Name = "CG_GASTO";         File = "05_CG_GASTO.sql";         Order = 5 },
  @{ Name = "CG_SALDO";         File = "06_CG_SALDO.sql";         Order = 6 },
  @{ Name = "CG_DENOMINACION";  File = "07_CG_DENOMINACION.sql";  Order = 7 }
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
$py = @'
import oracledb, os, json
wallet = os.path.expanduser("~/control-gastos/wallet")
conn = oracledb.connect(
    user="controlgastos",
    password="CgApp#2798Cloud!",
    dsn="cgatodb_tp",
    config_dir=wallet,
    wallet_location=wallet,
)
cur = conn.cursor()
tables = ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION"]
out = {}
for t in tables:
    cur.execute(f"select nvl(max(id),0) from {t} where propietario = :p", p=os.environ.get("PROP","admin"))
    out[t] = int(cur.fetchone()[0])
print(json.dumps(out))
conn.close()
'@

$envProp = $Propietario
$cloudJson = ssh -i $SshKey -o StrictHostKeyChecking=no $SshHost "PROP='$Propietario' python3 - <<'PY'
$py
PY"
if (-not $cloudJson) { throw "No se pudieron leer max IDs de la nube (¿pip install oracledb en la VM?)" }
Write-Host "Max IDs nube: $cloudJson"
$cloudMax = $cloudJson | ConvertFrom-Json

# 2) Export local solo id > cloudMax (o full)
$exportSqlPath = Join-Path $MigrateDir "export_incremental.sql"
# Reuse existing export approach: call docker with a generated script
# For speed we export via a small Python on host if oracledb available, else sqlplus spool of IDs

$state = Get-State
if (-not $state.lastLocalMaxId) { $state.lastLocalMaxId = @{} }

# Install/check oracledb on VM for import later
ssh -i $SshKey -o StrictHostKeyChecking=no $SshHost "pip3 install --user oracledb -q 2>/dev/null; mkdir -p $RemoteDir"

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
SELECT 'INSERT INTO CG_GASTO_MENSUAL (ID,MOTIVO,MONTO,ACTIVO,PROPIETARIO) VALUES ('||ID||','''||REPLACE(MOTIVO,'''','''''')||''','||MONTO||','||CASE WHEN ACTIVO=1 THEN '1' ELSE '0' END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
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
SELECT 'INSERT INTO CG_GASTO (ID,FECHA,CATEGORIA,MONTO,MOTIVO,FORMA_PAGO,CUENTA_ID,MOVIMIENTO_ID,PROPIETARIO) VALUES ('||ID||', DATE '''||TO_CHAR(FECHA,'YYYY-MM-DD')||''','''||REPLACE(CATEGORIA,'''','''''')||''','||MONTO||','||CASE WHEN MOTIVO IS NULL THEN 'NULL' ELSE ''''||REPLACE(MOTIVO,'''','''''')||'''' END||','||CASE WHEN FORMA_PAGO IS NULL THEN 'NULL' ELSE ''''||FORMA_PAGO||'''' END||','||CASE WHEN CUENTA_ID IS NULL THEN 'NULL' ELSE TO_CHAR(CUENTA_ID) END||','||CASE WHEN MOVIMIENTO_ID IS NULL THEN 'NULL' ELSE TO_CHAR(MOVIMIENTO_ID) END||','''||REPLACE(NVL(PROPIETARIO,'$Propietario'),'''','''''')||''');'
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
scp -i $SshKey -o StrictHostKeyChecking=no (Join-Path $MigrateDir "*.sql") "${SshHost}:${RemoteDir}/"

$importPy = @'
import oracledb, os, glob, re
wallet = os.path.expanduser("~/control-gastos/wallet")
conn = oracledb.connect(user="controlgastos", password="CgApp#2798Cloud!", dsn="cgatodb_tp",
                        config_dir=wallet, wallet_location=wallet)
cur = conn.cursor()
# allow explicit IDs on identity cols
for t in ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION"]:
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
            if "ORA-00001" in msg:  # duplicate
                continue
            print("ERR", f, msg[:200])
    conn.commit()
    print(f"{os.path.basename(f)}: {ok}/{len(stmts)}")
    total += ok
for t in ["CG_CUENTA","CG_INGRESO","CG_GASTO_MENSUAL","CG_MOVIMIENTO","CG_GASTO","CG_SALDO","CG_DENOMINACION"]:
    try:
        cur.execute(f"ALTER TABLE {t} MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)")
    except Exception:
        pass
conn.commit()
print("TOTAL_OK", total)
conn.close()
'@

$importPy | ssh -i $SshKey -o StrictHostKeyChecking=no $SshHost "cat > /tmp/import_inc.py && python3 /tmp/import_inc.py"

# 4) Update local sync state with local max ids
foreach ($t in $Tables) {
  $maxLocal = (Invoke-LocalSql "SET PAGESIZE 0 FEEDBACK OFF;`nSELECT NVL(MAX(ID),0) FROM $($t.Name);`nEXIT;") | Select-Object -Last 1
  $state.lastLocalMaxId[$t.Name] = [int64]("$maxLocal".Trim())
}
$state.lastSyncUtc = (Get-Date).ToUniversalTime().ToString("o")
Save-State $state
Write-Host "Estado guardado en $StateFile" -ForegroundColor Green
Write-Host "Listo. Sync incremental terminado." -ForegroundColor Green
