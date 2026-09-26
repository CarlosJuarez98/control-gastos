# Sync nube → local (control-gastos)
# Baja filas nuevas de ATP a Oracle Docker local.
#
# Uso:
#   $env:CG_WALLET_PASSWORD = '…'   # passphrase del zip Wallet ATP (no SSH)
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-datos-desde-nube.ps1 -WalletPassword '…'
#
# Requiere: Docker (oracle-control-gastos healthy), SSH, wallet ATP.

param(
  [string]$SshKey = "A:\Descargas\ssh-key-2026-09-07.key",
  [string]$SshHost = "opc@163.192.146.143",
  [string]$Propietario = "Carlos",
  [string]$WalletPassword = $env:CG_WALLET_PASSWORD,
  [switch]$Full
)

$ErrorActionPreference = "Stop"
if (-not $WalletPassword) {
  throw "Pasa -WalletPassword o define `$env:CG_WALLET_PASSWORD (contraseña del wallet ATP, no la SSH)"
}
$Root = Split-Path -Parent $PSScriptRoot
$MigrateDir = Join-Path $Root "_migrate"
$PullDir = Join-Path $MigrateDir "from_cloud"
$RemoteOut = "~/control-gastos/_migrate_out"
$SshOpts = @("-i", $SshKey, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")
$Oracle = "oracle-control-gastos"
$SqlPlus = "controlgastos/ControlGastos2026@XEPDB1"

$Tables = @(
  "CG_CUENTA",
  "CG_INGRESO",
  "CG_GASTO_MENSUAL",
  "CG_MOVIMIENTO",
  "CG_GASTO",
  "CG_SALDO",
  "CG_DENOMINACION",
  "CG_HISTORIAL_ANUAL",
  "CG_PERSONA_COMPARTIDA",
  "CG_SERVICIO_FIJO_COMPARTIDO",
  "CG_GASTO_COMPARTIDO",
  "CG_PARTE_GASTO_COMPARTIDO",
  "CG_MOV_PERSONA_COMPARTIDA"
)

New-Item -ItemType Directory -Force -Path $PullDir | Out-Null
Get-ChildItem $PullDir -Filter "*.sql" -ErrorAction SilentlyContinue | Remove-Item -Force

function Invoke-LocalSql([string]$sql) {
  $sql | docker exec -i $Oracle sqlplus -S $SqlPlus
}

Write-Host "== Sync nube → local ==" -ForegroundColor Cyan
Write-Host "Propietario: $Propietario  Full=$Full"

$health = docker inspect -f "{{.State.Health.Status}}" $Oracle 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Oracle local no disponible. Abre Docker Desktop."
}
if ($health -and $health -ne "healthy") {
  Write-Host "Aviso: health='$health' (se intenta igual)" -ForegroundColor Yellow
}

# 1) Max IDs locales (0 si la tabla aún no existe, p.ej. CG_HISTORIAL_ANUAL)
$localMax = [ordered]@{}
foreach ($t in $Tables) {
  $existsRaw = (Invoke-LocalSql "SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF;`nSELECT COUNT(*) FROM user_tables WHERE table_name='$t';`nEXIT;") | Select-Object -Last 1
  $exists = 0
  [void][int]::TryParse(("$existsRaw".Trim()), [ref]$exists)
  if ($exists -lt 1) {
    $localMax[$t] = [int64]0
    Write-Host ("  ${t}: tabla local ausente (max=0)")
    continue
  }
  if ($t -eq 'CG_PARTE_GASTO_COMPARTIDO') {
    $raw = (Invoke-LocalSql "SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF;`nSELECT NVL(MAX(p.ID),0) FROM CG_PARTE_GASTO_COMPARTIDO p JOIN CG_GASTO_COMPARTIDO g ON g.ID = p.GASTO_COMPARTIDO_ID WHERE NVL(g.PROPIETARIO,'$Propietario')='$Propietario';`nEXIT;") | Select-Object -Last 1
  } else {
    $raw = (Invoke-LocalSql "SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF;`nSELECT NVL(MAX(ID),0) FROM $t WHERE NVL(PROPIETARIO,'$Propietario')='$Propietario';`nEXIT;") | Select-Object -Last 1
  }
  $parsed = 0L
  if (-not [int64]::TryParse(("$raw".Trim()), [ref]$parsed)) { $parsed = 0 }
  $localMax[$t] = $parsed
}
Write-Host ("Max IDs local: " + ($localMax | ConvertTo-Json -Compress))

# 1b) Siempre bajar tabla Usuarios (CG_USUARIO) — fuente de logins / propietarios
$usersPy = @'
import oracledb, os, json

wallet = os.path.expanduser("~/control-gastos/wallet")
wp = os.environ.get("WALLET_PASSWORD", "")
kwargs = dict(user="controlgastos", password="CgApp#2798Cloud!", dsn="cgatodb_tp",
              config_dir=wallet, wallet_location=wallet)
if wp:
    kwargs["wallet_password"] = wp
conn = oracledb.connect(**kwargs)
cur = conn.cursor()
cur.execute("SELECT ID, USUARIO, PASSWORD_HASH, ROL, ACTIVO FROM CG_USUARIO ORDER BY ID")
rows = []
for r in cur.fetchall():
    rows.append({
        "id": int(r[0]),
        "usuario": r[1],
        "passwordHash": r[2],
        "rol": r[3] or "USER",
        "activo": 1 if r[4] else 0,
    })
out = os.path.expanduser("~/control-gastos/_migrate_out/usuarios.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False)
print("USERS", len(rows), [u["usuario"] for u in rows])
conn.close()
'@
$usersPyPath = Join-Path $MigrateDir "export_users_cloud.py"
Set-Content -Path $usersPyPath -Value $usersPy -Encoding UTF8
ssh @SshOpts $SshHost "mkdir -p $RemoteOut"
scp @SshOpts $usersPyPath "${SshHost}:/tmp/export_users_cloud.py" | Out-Null
ssh @SshOpts $SshHost "WALLET_PASSWORD='$WalletPassword' python3 /tmp/export_users_cloud.py"
scp @SshOpts "${SshHost}:${RemoteOut}/usuarios.json" (Join-Path $PullDir "usuarios.json") | Out-Null

$usersJsonPath = Join-Path $PullDir "usuarios.json"
if (Test-Path $usersJsonPath) {
  $users = Get-Content $usersJsonPath -Raw | ConvertFrom-Json
  Write-Host ("Usuarios nube: " + (($users | ForEach-Object { $_.usuario }) -join ", "))
  # Merge local: por nombre de usuario (no por id). Fuente de verdad = nube al bajar.
  $mergeSql = @"
SET FEEDBACK OFF DEFINE OFF
ALTER TABLE CG_USUARIO MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
"@
  foreach ($u in $users) {
    $nombre = ($u.usuario -replace "'", "''")
    $hash = ($u.passwordHash -replace "'", "''")
    $rol = ($u.rol -replace "'", "''")
    $activo = [int]$u.activo
    $id = [int64]$u.id
    $mergeSql += @"

MERGE INTO CG_USUARIO t
USING (SELECT '$nombre' AS USUARIO FROM dual) s
ON (UPPER(t.USUARIO) = UPPER(s.USUARIO))
WHEN MATCHED THEN UPDATE SET
  t.PASSWORD_HASH = '$hash',
  t.ROL = '$rol',
  t.ACTIVO = $activo
WHEN NOT MATCHED THEN INSERT (ID, USUARIO, PASSWORD_HASH, ROL, ACTIVO)
  VALUES ($id, '$nombre', '$hash', '$rol', $activo);
"@
  }
  $mergeSql += @"

ALTER TABLE CG_USUARIO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
COMMIT;
EXIT
"@
  $mergeFile = Join-Path $PullDir "_merge_users.sql"
  Set-Content -Path $mergeFile -Value $mergeSql -Encoding ASCII
  docker cp $mergeFile "${Oracle}:/tmp/_merge_users.sql" | Out-Null
  $mout = docker exec $Oracle sqlplus -S $SqlPlus "@/tmp/_merge_users.sql" 2>&1 | Out-String
  if ($mout -match "ORA-") {
    Write-Host "Aviso al mergear usuarios:" -ForegroundColor Yellow
    Write-Host ($mout.Substring(0, [Math]::Min(400, $mout.Length)))
  } else {
    Write-Host "Usuarios locales actualizados desde la nube." -ForegroundColor Green
  }
}

# 2) Export datos en la VM desde ATP (mins vía archivo JSON)
$mins = [ordered]@{}
foreach ($t in $Tables) {
  $mins[$t] = if ($Full) { 0 } else { [int64]$localMax[$t] }
}
$minsPath = Join-Path $MigrateDir "pull_mins.json"
($mins | ConvertTo-Json -Compress) | Set-Content -Path $minsPath -Encoding ascii

$exportPy = @'
import oracledb, os, json

wallet = os.path.expanduser("~/control-gastos/wallet")
wp = os.environ.get("WALLET_PASSWORD", "")
prop = os.environ.get("PROP", "Carlos")
out_dir = os.path.expanduser("~/control-gastos/_migrate_out")
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "pull_mins.json"), encoding="utf-8") as f:
    mins = json.load(f)

kwargs = dict(user="controlgastos", password="CgApp#2798Cloud!", dsn="cgatodb_tp",
              config_dir=wallet, wallet_location=wallet)
if wp:
    kwargs["wallet_password"] = wp
conn = oracledb.connect(**kwargs)
cur = conn.cursor()

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def date_sql(d):
    if d is None:
        return "NULL"
    return "DATE '" + d.strftime("%Y-%m-%d") + "'"

queries = [
  ("01_CG_CUENTA", "CG_CUENTA", "ID,NOMBRE,TIPO,SALDO_ACTUAL,PROPIETARIO",
   lambda r: f"INSERT INTO CG_CUENTA (ID,NOMBRE,TIPO,SALDO_ACTUAL,PROPIETARIO) VALUES ({r[0]},{esc(r[1])},{esc(r[2])},{r[3]},{esc(r[4] or prop)});"),
  ("02_CG_INGRESO", "CG_INGRESO", "ID,FECHA,CONCEPTO,MONTO,PROPIETARIO",
   lambda r: f"INSERT INTO CG_INGRESO (ID,FECHA,CONCEPTO,MONTO,PROPIETARIO) VALUES ({r[0]},{date_sql(r[1])},{esc(r[2])},{r[3]},{esc(r[4] or prop)});"),
  ("03_CG_GASTO_MENSUAL", "CG_GASTO_MENSUAL", "ID,MOTIVO,MONTO,ACTIVO,MESES_TOTALES,MESES_RESTANTES,MONTO_TOTAL,GASTO_ORIGEN_ID,SERVICIO_FIJO_COMPARTIDO_ID,DIA_PAGO,PROPIETARIO",
   lambda r: f"INSERT INTO CG_GASTO_MENSUAL (ID,MOTIVO,MONTO,ACTIVO,MESES_TOTALES,MESES_RESTANTES,MONTO_TOTAL,GASTO_ORIGEN_ID,SERVICIO_FIJO_COMPARTIDO_ID,DIA_PAGO,PROPIETARIO) VALUES ({r[0]},{esc(r[1])},{r[2]},{1 if r[3] else 0},{r[4] if r[4] is not None else 'NULL'},{r[5] if r[5] is not None else 'NULL'},{r[6] if r[6] is not None else 'NULL'},{r[7] if r[7] is not None else 'NULL'},{r[8] if r[8] is not None else 'NULL'},{r[9] if r[9] is not None else 'NULL'},{esc(r[10] or prop)});"),
  ("04_CG_MOVIMIENTO", "CG_MOVIMIENTO", "ID,CUENTA_ID,FECHA,TIPO,MONTO,CONCEPTO,PROPIETARIO",
   lambda r: f"INSERT INTO CG_MOVIMIENTO (ID,CUENTA_ID,FECHA,TIPO,MONTO,CONCEPTO,PROPIETARIO) VALUES ({r[0]},{r[1]},{date_sql(r[2])},{esc(r[3])},{r[4]},{esc(r[5]) if r[5] is not None else 'NULL'},{esc(r[6] or prop)});"),
  ("05_CG_GASTO", "CG_GASTO", "ID,FECHA,CATEGORIA,MONTO,MOTIVO,FORMA_PAGO,CUENTA_ID,MOVIMIENTO_ID,MESES,CUOTA_MENSUAL,PROPIETARIO",
   lambda r: f"INSERT INTO CG_GASTO (ID,FECHA,CATEGORIA,MONTO,MOTIVO,FORMA_PAGO,CUENTA_ID,MOVIMIENTO_ID,MESES,CUOTA_MENSUAL,PROPIETARIO) VALUES ({r[0]},{date_sql(r[1])},{esc(r[2])},{r[3]},{esc(r[4]) if r[4] is not None else 'NULL'},{esc(r[5]) if r[5] is not None else 'NULL'},{r[6] if r[6] is not None else 'NULL'},{r[7] if r[7] is not None else 'NULL'},{r[8] if r[8] is not None else 'NULL'},{r[9] if r[9] is not None else 'NULL'},{esc(r[10] or prop)});"),
  ("06_CG_SALDO", "CG_SALDO", "ID,FECHA,SALDO_TOTAL,TOTAL_FISICO,DINERO_BBVA,DINERO_MERCADO_LIBRE,DINERO_NU,DINERO_DIDI,ULTIMO_INGRESO_ID,ULTIMO_GASTO_ID,ULTIMO_MOVIMIENTO_ID,PROPIETARIO",
   lambda r: "INSERT INTO CG_SALDO (ID,FECHA,SALDO_TOTAL,TOTAL_FISICO,DINERO_BBVA,DINERO_MERCADO_LIBRE,DINERO_NU,DINERO_DIDI,ULTIMO_INGRESO_ID,ULTIMO_GASTO_ID,ULTIMO_MOVIMIENTO_ID,PROPIETARIO) VALUES (" + ",".join([
      str(r[0]), date_sql(r[1]), str(r[2] or 0),
      "NULL" if r[3] is None else str(r[3]),
      "NULL" if r[4] is None else str(r[4]),
      "NULL" if r[5] is None else str(r[5]),
      "NULL" if r[6] is None else str(r[6]),
      "NULL" if r[7] is None else str(r[7]),
      "NULL" if r[8] is None else str(r[8]),
      "NULL" if r[9] is None else str(r[9]),
      "NULL" if r[10] is None else str(r[10]),
      esc(r[11] or prop)
    ]) + ");"),
  ("07_CG_DENOMINACION", "CG_DENOMINACION", "ID,VALOR,CANTIDAD,PROPIETARIO",
   lambda r: f"INSERT INTO CG_DENOMINACION (ID,VALOR,CANTIDAD,PROPIETARIO) VALUES ({r[0]},{r[1]},{r[2]},{esc(r[3] or prop)});"),
  ("08_CG_HISTORIAL_ANUAL", "CG_HISTORIAL_ANUAL", "ID,PROPIETARIO,ANIO,TOTAL_INGRESOS,TOTAL_GASTOS",
   lambda r: f"INSERT INTO CG_HISTORIAL_ANUAL (ID,PROPIETARIO,ANIO,TOTAL_INGRESOS,TOTAL_GASTOS) VALUES ({r[0]},{esc(r[1] or prop)},{r[2]},{r[3] or 0},{r[4] or 0});"),
  ("09_CG_PERSONA_COMPARTIDA", "CG_PERSONA_COMPARTIDA", "ID,NOMBRE,PROPIETARIO,ACTIVA,EFECTIVO_GUARDADO",
   lambda r: f"INSERT INTO CG_PERSONA_COMPARTIDA (ID,NOMBRE,PROPIETARIO,ACTIVA,EFECTIVO_GUARDADO) VALUES ({r[0]},{esc(r[1])},{esc(r[2] or prop)},{1 if r[3] else 0},{r[4] or 0});"),
  ("10_CG_SERVICIO_FIJO_COMPARTIDO", "CG_SERVICIO_FIJO_COMPARTIDO", "ID,CONCEPTO,MONTO,PROPIETARIO,PERSONA_IDS,DIA_COBRO,INCLUYE_PRINCIPAL,YO_PAGO,PERFILES_PRINCIPAL,PERSONA_PESOS,ACTIVO",
   lambda r: f"INSERT INTO CG_SERVICIO_FIJO_COMPARTIDO (ID,CONCEPTO,MONTO,PROPIETARIO,PERSONA_IDS,DIA_COBRO,INCLUYE_PRINCIPAL,YO_PAGO,PERFILES_PRINCIPAL,PERSONA_PESOS,ACTIVO) VALUES ({r[0]},{esc(r[1])},{r[2]},{esc(r[3] or prop)},{esc(r[4] or '-')},{r[5] if r[5] is not None else 1},{1 if (r[6] is None or r[6]) else 0},{1 if (r[7] is None or r[7]) else 0},{r[8] if r[8] is not None else 1},{esc(r[9] or '-')},{1 if r[10] else 0});"),
  ("11_CG_GASTO_COMPARTIDO", "CG_GASTO_COMPARTIDO", "ID,TIPO,CONCEPTO,MONTO_TOTAL,FECHA,PROPIETARIO,FORMA_PAGO,CUENTA_ID,MESES,GASTO_ID,SERVICIO_FIJO_ID,PERIODO,ANULADO",
   lambda r: f"INSERT INTO CG_GASTO_COMPARTIDO (ID,TIPO,CONCEPTO,MONTO_TOTAL,FECHA,PROPIETARIO,FORMA_PAGO,CUENTA_ID,MESES,GASTO_ID,SERVICIO_FIJO_ID,PERIODO,ANULADO) VALUES ({r[0]},{esc(r[1])},{esc(r[2])},{r[3]},{date_sql(r[4])},{esc(r[5] or prop)},{esc(r[6])},{r[7] if r[7] is not None else 'NULL'},{r[8] if r[8] is not None else 'NULL'},{r[9] if r[9] is not None else 'NULL'},{r[10] if r[10] is not None else 'NULL'},{esc(r[11]) if r[11] is not None else 'NULL'},{1 if r[12] else 0});"),
  ("12_CG_PARTE_GASTO_COMPARTIDO", "CG_PARTE_GASTO_COMPARTIDO", "ID,GASTO_COMPARTIDO_ID,PERSONA_ID,ES_PRINCIPAL,MONTO,PERFILES",
   lambda r: f"INSERT INTO CG_PARTE_GASTO_COMPARTIDO (ID,GASTO_COMPARTIDO_ID,PERSONA_ID,ES_PRINCIPAL,MONTO,PERFILES) VALUES ({r[0]},{r[1]},{r[2] if r[2] is not None else 'NULL'},{1 if r[3] else 0},{r[4]},{r[5] if r[5] is not None else 1});"),
  ("13_CG_MOV_PERSONA_COMPARTIDA", "CG_MOV_PERSONA_COMPARTIDA", "ID,PERSONA_ID,PROPIETARIO,FECHA,TIPO,MONTO,CONCEPTO,GASTO_COMPARTIDO_ID,INGRESO_ID,DESDE_GUARDADO,CONCEPTO_DESTINO,DESDE_ANTICIPO,ANULADO",
   lambda r: f"INSERT INTO CG_MOV_PERSONA_COMPARTIDA (ID,PERSONA_ID,PROPIETARIO,FECHA,TIPO,MONTO,CONCEPTO,GASTO_COMPARTIDO_ID,INGRESO_ID,DESDE_GUARDADO,CONCEPTO_DESTINO,DESDE_ANTICIPO,ANULADO) VALUES ({r[0]},{r[1]},{esc(r[2] or prop)},{date_sql(r[3])},{esc(r[4])},{r[5]},{esc(r[6]) if r[6] is not None else 'NULL'},{r[7] if r[7] is not None else 'NULL'},{r[8] if r[8] is not None else 'NULL'},{1 if r[9] else 0},{esc(r[10]) if r[10] is not None else 'NULL'},{1 if r[11] else 0},{1 if r[12] else 0});"),
]

counts = {}
for fname, table, cols, fmt in queries:
    min_id = int(mins.get(table, 0))
    path = os.path.join(out_dir, f"{fname}.sql")
    try:
        if table == "CG_PARTE_GASTO_COMPARTIDO":
            sql = (
                f"SELECT p.ID, p.GASTO_COMPARTIDO_ID, p.PERSONA_ID, p.ES_PRINCIPAL, p.MONTO, p.PERFILES "
                f"FROM CG_PARTE_GASTO_COMPARTIDO p "
                f"JOIN CG_GASTO_COMPARTIDO g ON g.ID = p.GASTO_COMPARTIDO_ID "
                f"WHERE p.ID > :m AND NVL(g.PROPIETARIO, :p) = :p ORDER BY p.ID"
            )
        else:
            sql = f"SELECT {cols} FROM {table} WHERE ID > :m AND NVL(PROPIETARIO, :p) = :p ORDER BY ID"
        cur.execute(sql, m=min_id, p=prop)
        rows = cur.fetchall()
    except Exception as e:
        print(f"{table}: SKIP ({e})")
        open(path, "w", encoding="utf-8").close()
        counts[table] = 0
        continue
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(fmt(r) + "\n")
    counts[table] = len(rows)
    print(f"{table}: {len(rows)} (id>{min_id})")
print("JSON", json.dumps(counts))
conn.close()
'@

$exportPyPath = Join-Path $MigrateDir "export_from_cloud.py"
Set-Content -Path $exportPyPath -Value $exportPy -Encoding UTF8

ssh @SshOpts $SshHost "mkdir -p $RemoteOut; rm -f $RemoteOut/*.sql"
scp @SshOpts $minsPath "${SshHost}:${RemoteOut}/pull_mins.json" | Out-Null
scp @SshOpts $exportPyPath "${SshHost}:/tmp/export_from_cloud.py" | Out-Null
$exportOut = ssh @SshOpts $SshHost "PROP='$Propietario' WALLET_PASSWORD='$WalletPassword' python3 /tmp/export_from_cloud.py"
Write-Host $exportOut

# 3) Bajar SQL e importar en local
scp @SshOpts "${SshHost}:${RemoteOut}/*.sql" "$PullDir/"
$sqlFiles = @(Get-ChildItem $PullDir -Filter "*.sql" | Sort-Object Name)
if (-not $sqlFiles.Count) {
  Write-Host "No hay SQL nuevos desde la nube (¿nube vacía o ya sincronizado?)." -ForegroundColor Yellow
  exit 0
}

$alterDefault = @"
SET FEEDBACK OFF
ALTER TABLE CG_CUENTA MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_INGRESO MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_GASTO_MENSUAL MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_MOVIMIENTO MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_GASTO MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_SALDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE CG_DENOMINACION MODIFY ID GENERATED BY DEFAULT AS IDENTITY;
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_HISTORIAL_ANUAL MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_PERSONA_COMPARTIDA MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_SERVICIO_FIJO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_GASTO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_PARTE_GASTO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_MOV_PERSONA_COMPARTIDA MODIFY ID GENERATED BY DEFAULT AS IDENTITY'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
EXIT
"@
Invoke-LocalSql $alterDefault | Out-Null

$totalOk = 0
foreach ($f in $sqlFiles) {
  $stmts = @(Get-Content $f.FullName | Where-Object { $_ -match '^INSERT ' })
  Write-Host ("  archivo " + $f.Name + " " + $f.Length + " bytes, " + $stmts.Count + " inserts")
  if (-not $stmts.Count) { continue }
  $batch = "SET FEEDBACK OFF DEFINE OFF`n" + ($stmts -join "`n") + "`nCOMMIT;`nEXIT;`n"
  $tmpIn = Join-Path $PullDir "_run.sql"
  Set-Content -Path $tmpIn -Value $batch -Encoding ASCII
  docker cp $tmpIn "${Oracle}:/tmp/_pull_run.sql" | Out-Null
  $out = docker exec $Oracle sqlplus -S $SqlPlus "@/tmp/_pull_run.sql" 2>&1 | Out-String
  if ($out -match "ORA-00001") {
    Write-Host "$($f.Name): algunos duplicados omitidos" -ForegroundColor Yellow
  } elseif ($out -match "ORA-") {
    Write-Host "$($f.Name): posible error" -ForegroundColor Yellow
    Write-Host ($out.Substring(0, [Math]::Min(500, $out.Length)))
  }
  Write-Host "$($f.Name): $($stmts.Count) intentados"
  $totalOk += $stmts.Count
}

$alterLimit = @"
SET FEEDBACK OFF
ALTER TABLE CG_CUENTA MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_INGRESO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_GASTO_MENSUAL MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_MOVIMIENTO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_GASTO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_SALDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
ALTER TABLE CG_DENOMINACION MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_HISTORIAL_ANUAL MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_PERSONA_COMPARTIDA MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_SERVICIO_FIJO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_GASTO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_PARTE_GASTO_COMPARTIDO MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'ALTER TABLE CG_MOV_PERSONA_COMPARTIDA MODIFY ID GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
EXIT
"@
Invoke-LocalSql $alterLimit | Out-Null

Write-Host "TOTAL_OK $totalOk" -ForegroundColor Green
Write-Host "Listo. Sync nube → local terminado." -ForegroundColor Green
