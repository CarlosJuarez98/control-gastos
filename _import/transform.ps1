$ErrorActionPreference = 'Stop'
$rawPath = Join-Path $PSScriptRoot 'excel-raw.json'
$raw = Get-Content $rawPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Parse-Money($cell) {
  if ($null -eq $cell) { return $null }
  $v = $cell.v
  if ($null -eq $v -or $v -eq '') { return $null }
  if ($v -is [double] -or $v -is [decimal] -or $v -is [int] -or $v -is [long] -or $v -is [float]) {
    return [double]$v
  }
  $t = [string]$cell.t
  if ([string]::IsNullOrWhiteSpace($t)) { return $null }
  $clean = ($t -replace '[^\d\-,\.]', '').Trim()
  if ($clean -eq '' -or $clean -eq '-') { return $null }
  if ($clean -match '^\d{1,3}(,\d{3})+(\.\d+)?$') { $clean = $clean -replace ',', '' }
  elseif ($clean -match '^\d{1,3}(\.\d{3})+(,\d+)?$') { $clean = ($clean -replace '\.', '') -replace ',', '.' }
  elseif ($clean -match ',\d{1,2}$' -and $clean -notmatch '\.') { $clean = $clean -replace ',', '.' }
  $n = 0.0
  if ([double]::TryParse($clean, [ref]$n)) { return $n }
  return $null
}

function Parse-Date($cell) {
  if ($null -eq $cell) { return $null }
  $v = $cell.v
  if ($null -eq $v -or $v -eq '') { return $null }
  if ($v -is [double] -or $v -is [decimal] -or $v -is [int] -or $v -is [long] -or $v -is [float]) {
    return ([datetime]'1899-12-30').AddDays([double]$v).ToString('yyyy-MM-dd')
  }
  $t = ([string]$cell.t).Trim()
  if ($t -match '^(\d{2})/(\d{2})/(\d{4})$') {
    return "{0}-{1}-{2}" -f $Matches[3], $Matches[2], $Matches[1]
  }
  return $null
}

function Str($cell) {
  if ($null -eq $cell) { return $null }
  $t = [string]$cell.t
  if ([string]::IsNullOrWhiteSpace($t)) {
    if ($null -ne $cell.v -and "$($cell.v)" -ne '') { return ([string]$cell.v).Trim() }
    return $null
  }
  return $t.Trim()
}

function Props($row) { @($row.PSObject.Properties) }

$seed = [ordered]@{
  gastosMensuales = [System.Collections.ArrayList]@()
  ingresos        = [System.Collections.ArrayList]@()
  gastos          = [System.Collections.ArrayList]@()
  cuentas         = [System.Collections.ArrayList]@()
  movimientos     = [System.Collections.ArrayList]@()
  saldo           = $null
  denominaciones  = [System.Collections.ArrayList]@()
  deudaTotal      = $null
}

function Add-Account([string]$nombre, [string]$tipo, $saldo, $linea) {
  [void]$seed.cuentas.Add([ordered]@{
    nombre      = $nombre
    tipo        = $tipo
    saldoActual = $(if ($null -eq $saldo) { 0.0 } else { [double]$saldo })
    lineaCredito = $linea
  })
}

function Add-Mov([string]$cuenta, $fecha, [string]$tipoMov, $monto, $concepto) {
  if (-not $fecha -or $null -eq $monto) { return }
  [void]$seed.movimientos.Add([ordered]@{
    cuenta   = $cuenta
    fecha    = $fecha
    tipo     = $tipoMov
    monto    = [double]$monto
    concepto = $(if ($concepto) { [string]$concepto } else { '' })
  })
}

# Gastos Mensuales
$gm = $raw.'Gastos Mensuales'
for ($i = 1; $i -lt $gm.Count; $i++) {
  $ps = Props $gm[$i]
  $motivo = Str $ps[0].Value
  $monto = Parse-Money $ps[1].Value
  if ($motivo) {
    [void]$seed.gastosMensuales.Add([ordered]@{
      motivo = $motivo
      monto  = $(if ($null -eq $monto) { 0.0 } else { $monto })
    })
  }
}

# Ingresos
$ing = $raw.Ingresos
for ($i = 1; $i -lt $ing.Count; $i++) {
  $ps = Props $ing[$i]
  $fecha = Parse-Date $ps[0].Value
  $concepto = Str $ps[1].Value
  $monto = Parse-Money $ps[2].Value
  if ($fecha -and $concepto -and $null -ne $monto) {
    [void]$seed.ingresos.Add([ordered]@{ fecha = $fecha; concepto = $concepto; monto = $monto })
  }
}

# Gastos adicionales
$ga = $raw.'Gastos adicionales'
for ($i = 1; $i -lt $ga.Count; $i++) {
  $ps = Props $ga[$i]
  $fecha = Parse-Date $ps[0].Value
  $cat = Str $ps[1].Value
  $monto = Parse-Money $ps[2].Value
  $motivo = if ($ps.Count -gt 3) { Str $ps[3].Value } else { '' }
  if ($fecha -and $cat -and $null -ne $monto) {
    [void]$seed.gastos.Add([ordered]@{
      fecha     = $fecha
      categoria = $cat
      monto     = $monto
      motivo    = $(if ($motivo) { $motivo } else { '' })
    })
  }
}

# Coopel
$co = $raw.Coopel
if ($co.Count -gt 1) {
  $ps = Props $co[1]
  Add-Account 'Coopel' 'TIENDA' (Parse-Money $ps[2].Value) $null
  if ($ps.Count -gt 10) {
    Add-Mov 'Coopel' (Parse-Date $ps[8].Value) 'ABONO' (Parse-Money $ps[9].Value) (Str $ps[10].Value)
  }
}
for ($i = 2; $i -lt $co.Count; $i++) {
  $ps = Props $co[$i]
  Add-Mov 'Coopel' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
  if ($ps.Count -gt 6) {
    Add-Mov 'Coopel' (Parse-Date $ps[4].Value) 'CARGO' (Parse-Money $ps[6].Value) (Str $ps[5].Value)
  }
}

# Liverpool
$lv = $raw.Liverpool
if ($lv.Count -gt 1) {
  $ps = Props $lv[1]
  $saldoLv = Parse-Money $ps[2].Value
  $lineaLv = $null
  foreach ($p in $ps) { if ($p.Name -match 'Credito|Crédito') { $lineaLv = Parse-Money $p.Value } }
  Add-Account 'Liverpool' 'TIENDA' $saldoLv $lineaLv
}
for ($i = 2; $i -lt $lv.Count; $i++) {
  $ps = Props $lv[$i]
  Add-Mov 'Liverpool' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
}

# BBVA
$bb = $raw.BBVA
if ($bb.Count -gt 1) {
  $ps = Props $bb[1]
  $sTdc = $null; $sP1 = $null; $sP2 = $null
  foreach ($p in $ps) {
    if ($p.Name -match 'Saldo Restante TDC') { $sTdc = Parse-Money $p.Value }
    elseif ($p.Name -match 'Saldo.*Prestamo\s*2') { $sP2 = Parse-Money $p.Value }
    elseif ($p.Name -match 'Saldo.*Prestamo' -and $p.Name -notmatch '2') { $sP1 = Parse-Money $p.Value }
  }
  Add-Account 'BBVA TDC' 'TDC' $sTdc $null
  Add-Account 'BBVA Prestamo 1' 'PRESTAMO' $sP1 $null
  Add-Account 'BBVA Prestamo 2' 'PRESTAMO' $sP2 $null
}
for ($i = 2; $i -lt $bb.Count; $i++) {
  $ps = Props $bb[$i]
  $f1 = Parse-Date $ps[0].Value
  $dest = Str $ps[1].Value
  $m1 = Parse-Money $ps[2].Value
  if ($dest -match 'Prestamo 2') { Add-Mov 'BBVA Prestamo 2' $f1 'ABONO' $m1 $dest }
  elseif ($dest -match 'Prestamo|Tio') { Add-Mov 'BBVA Prestamo 1' $f1 'ABONO' $m1 $(if ($dest) { $dest } else { 'Abono' }) }
  elseif ($dest -match 'TDC') { Add-Mov 'BBVA TDC' $f1 'ABONO' $m1 $dest }
  elseif ($f1 -and $null -ne $m1) { Add-Mov 'BBVA TDC' $f1 'ABONO' $m1 $(if ($dest) { $dest } else { 'Abono' }) }

  if ($ps.Count -gt 9) {
    $f2 = Parse-Date $ps[8].Value
    $motivo = Str $ps[9].Value
    $intTdc = if ($ps.Count -gt 10) { Parse-Money $ps[10].Value } else { $null }
    $intP1 = if ($ps.Count -gt 11) { Parse-Money $ps[11].Value } else { $null }
    $intP2 = if ($ps.Count -gt 12) { Parse-Money $ps[12].Value } else { $null }
    $reemb = if ($ps.Count -gt 13) { Parse-Money $ps[13].Value } else { $null }
    if ($null -ne $intTdc) { Add-Mov 'BBVA TDC' $f2 'INTERES' $intTdc $(if ($motivo) { $motivo } else { 'Interes TDC' }) }
    if ($null -ne $intP1) { Add-Mov 'BBVA Prestamo 1' $f2 'INTERES' $intP1 'Interes Prestamo' }
    if ($null -ne $intP2) { Add-Mov 'BBVA Prestamo 2' $f2 'INTERES' $intP2 'Interes Prestamo 2' }
    if ($null -ne $reemb) { Add-Mov 'BBVA TDC' $f2 'REEMBOLSO' $reemb $(if ($motivo) { $motivo } else { 'Reembolso' }) }
  }
}

# NU Bank
$nuKey = ($raw.PSObject.Properties | Where-Object { $_.Name -match 'NU' } | Select-Object -First 1).Name
if ($nuKey) {
  $nu = $raw.$nuKey
  if ($nu.Count -gt 1) {
    $ps = Props $nu[1]
    $s = $null; $linea = $null
    foreach ($p in $ps) {
      if ($p.Name -match 'Saldo Restante') { $s = Parse-Money $p.Value }
      if ($p.Name -match 'Linea|Línea|credito|crédito') { $linea = Parse-Money $p.Value }
    }
    Add-Account 'NU Bank' 'TDC' $s $linea
  }
  for ($i = 2; $i -lt $nu.Count; $i++) {
    $ps = Props $nu[$i]
    Add-Mov 'NU Bank' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
    if ($ps.Count -gt 8) {
      Add-Mov 'NU Bank' (Parse-Date $ps[7].Value) 'INTERES' (Parse-Money $ps[8].Value) 'Interes'
    }
  }
}

# Didi Card
$di = $raw.'Didi Card'
if ($di -and $di.Count -gt 1) {
  $ps = Props $di[1]
  $s = $null; $linea = $null
  foreach ($p in $ps) {
    if ($p.Name -match 'Saldo Restante') { $s = Parse-Money $p.Value }
    if ($p.Name -match 'Linea|Línea|credito|crédito') { $linea = Parse-Money $p.Value }
  }
  Add-Account 'Didi Card' 'TDC' $s $linea
}
if ($di) {
  for ($i = 2; $i -lt $di.Count; $i++) {
    $ps = Props $di[$i]
    Add-Mov 'Didi Card' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
  }
}

# Prestamista
$pr = $raw.Prestamista
$chemaSaldo = $null
if ($pr.Count -gt 1) {
  foreach ($p in (Props $pr[1])) {
    if ($p.Name -match 'Saldo Restante Chema') { $chemaSaldo = Parse-Money $p.Value }
  }
}
Add-Account 'Prestamista Chema' 'PRESTAMO_OTORGADO' $chemaSaldo $null
for ($i = 2; $i -lt $pr.Count; $i++) {
  $ps = Props $pr[$i]
  $quien = Str $ps[1].Value
  $f1 = Parse-Date $ps[0].Value
  $m1 = Parse-Money $ps[2].Value
  if ($quien -and $f1) {
    $cname = "Prestamista $quien"
    if (-not ($seed.cuentas | Where-Object { $_.nombre -eq $cname })) {
      Add-Account $cname 'PRESTAMO_OTORGADO' 0 $null
    }
    Add-Mov $cname $f1 'ABONO' $m1 "Abono de $quien"
  }
  if ($ps.Count -gt 13) {
    $f2 = Parse-Date $ps[10].Value
    $quien2 = Str $ps[11].Value
    $m2 = Parse-Money $ps[12].Value
    $mot = Str $ps[13].Value
    if ($quien2 -and $f2) {
      $cname = "Prestamista $quien2"
      if (-not ($seed.cuentas | Where-Object { $_.nombre -eq $cname })) {
        Add-Account $cname 'PRESTAMO_OTORGADO' 0 $null
      }
      Add-Mov $cname $f2 'CARGO' $m2 $(if ($mot) { $mot } else { 'Prestamo otorgado' })
    }
  }
}

# Deudor
$de = $raw.Deudor
if ($de.Count -gt 1) {
  $ps = Props $de[1]
  $s = $null
  foreach ($p in $ps) { if ($p.Name -match 'Saldo Restante') { $s = Parse-Money $p.Value } }
  Add-Account 'Deudor Papa' 'PRESTAMO' $s $null
  if ($ps.Count -gt 8) {
    Add-Mov 'Deudor Papa' (Parse-Date $ps[5].Value) 'CARGO' (Parse-Money $ps[7].Value) (Str $ps[8].Value)
  }
}

# Mercado libre
$mlKey = ($raw.PSObject.Properties | Where-Object { $_.Name -match 'Mercado' } | Select-Object -First 1).Name
$ml = $raw.$mlKey
if ($ml.Count -gt 1) {
  $ps = Props $ml[1]
  $s = $null
  foreach ($p in $ps) { if ($p.Name -match 'Restante') { $s = Parse-Money $p.Value } }
  Add-Account 'Mercado Libre' 'PRESTAMO' $s $null
  if ($ps.Count -gt 5) {
    Add-Mov 'Mercado Libre' (Parse-Date $ps[4].Value) 'CARGO' (Parse-Money $ps[5].Value) 'Prestamo inicial'
  }
}
for ($i = 2; $i -lt $ml.Count; $i++) {
  $ps = Props $ml[$i]
  Add-Mov 'Mercado Libre' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
  if ($ps.Count -gt 6) {
    Add-Mov 'Mercado Libre' (Parse-Date $ps[4].Value) 'CARGO' (Parse-Money $ps[5].Value) (Str $ps[6].Value)
  }
}

# Terrenos
$te = $raw.Terrenos
if ($te.Count -gt 1) {
  $ps = Props $te[1]
  $s68 = $null; $s69 = $null
  foreach ($p in $ps) {
    if ($p.Name -match 'lote 68') { $s68 = Parse-Money $p.Value }
    if ($p.Name -match 'lote 69') { $s69 = Parse-Money $p.Value }
  }
  Add-Account 'Terreno Lote 68' 'TERRENO' $s68 $null
  Add-Account 'Terreno Lote 69' 'TERRENO' $s69 $null
  Add-Account 'Deuda Gloria' 'PRESTAMO' 0 $null
}
for ($i = 2; $i -lt $te.Count; $i++) {
  $ps = Props $te[$i]
  $f = Parse-Date $ps[0].Value
  $dest = Str $ps[1].Value
  $m = Parse-Money $ps[2].Value
  if ($dest -match '68') { Add-Mov 'Terreno Lote 68' $f 'ABONO' $m $dest }
  elseif ($dest -match '69') { Add-Mov 'Terreno Lote 69' $f 'ABONO' $m $dest }
  elseif ($dest -match 'Gloria|Tio') { Add-Mov 'Deuda Gloria' $f 'ABONO' $m $dest }
}

# Prestamo de operacion
$po = $raw.'Prestamo de operacion'
if ($po.Count -gt 1) {
  $ps = Props $po[1]
  $prestado = $null; $rest = $null
  foreach ($p in $ps) {
    if ($p.Name -match 'Monto prestado') { $prestado = Parse-Money $p.Value }
    if ($p.Name -match 'restante') { $rest = Parse-Money $p.Value }
  }
  Add-Account 'Prestamo de operacion' 'PRESTAMO' $(if ($null -ne $rest) { $rest } else { 0 }) $null
  if ($null -ne $prestado) { Add-Mov 'Prestamo de operacion' '2025-11-01' 'CARGO' $prestado 'Monto prestado' }
}
for ($i = 2; $i -lt $po.Count; $i++) {
  $ps = Props $po[$i]
  Add-Mov 'Prestamo de operacion' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
}

# Carro
$ca = $raw.Carro
if ($ca.Count -gt 1) {
  $ps = Props $ca[1]
  $s = $null
  foreach ($p in $ps) { if ($p.Name -match 'Saldo restante') { $s = Parse-Money $p.Value } }
  Add-Account 'Carro' 'PRESTAMO' $(if ($null -eq $s) { 0 } else { $s }) $null
}
for ($i = 2; $i -lt $ca.Count; $i++) {
  $ps = Props $ca[$i]
  Add-Mov 'Carro' (Parse-Date $ps[0].Value) 'ABONO' (Parse-Money $ps[1].Value) 'Abono'
}

# Saldo Total
$st = $raw.'Saldo Total'
if ($st.Count -gt 1) {
  $ps = Props $st[1]
  $fecha = Parse-Date $ps[0].Value
  $saldoTotal = Parse-Money $ps[1].Value
  $dineroTarjeta = if ($ps.Count -gt 8) { Parse-Money $ps[8].Value } else { $null }
  $dineroBbva = $null; $dineroMl = $null; $dineroNu = $null; $dineroDidi = $null
  if ($st.Count -gt 2) {
    $p3 = Props $st[2]
    if ($p3.Count -gt 13) {
      $dineroBbva = Parse-Money $p3[10].Value
      $dineroMl = Parse-Money $p3[11].Value
      $dineroNu = Parse-Money $p3[12].Value
      $dineroDidi = Parse-Money $p3[13].Value
    }
  }
  $fisico = $null
  foreach ($r in $st) {
    $lab = Str (Props $r)[0].Value
    if ($lab -eq 'Total Fisico') { $fisico = Parse-Money (Props $r)[1].Value }
  }
  $seed.saldo = [ordered]@{
    fecha              = $(if ($fecha) { $fecha } else { '2026-09-05' })
    saldoTotal         = $(if ($null -eq $saldoTotal) { 0 } else { $saldoTotal })
    totalFisico        = $fisico
    dineroTarjeta      = $dineroTarjeta
    dineroBbva         = $dineroBbva
    dineroMercadoLibre = $dineroMl
    dineroNu           = $dineroNu
    dineroDidi         = $dineroDidi
  }
}

for ($i = 1; $i -lt [Math]::Min(12, $st.Count); $i++) {
  $ps = Props $st[$i]
  if ($ps.Count -gt 5) {
    $val = Parse-Money $ps[3].Value
    $cant = 0
    $cantText = Str $ps[4].Value
    if ($cantText -match '^\d+$') { $cant = [int]$cantText }
    elseif ($null -ne $ps[4].Value.v -and "$($ps[4].Value.v)" -match '^\d+(\.0+)?$') {
      $cant = [int][double]$ps[4].Value.v
    }
    if ($null -ne $val -and $val -gt 0) {
      [void]$seed.denominaciones.Add([ordered]@{ valor = $val; cantidad = $cant })
    }
  }
}

$dt = $raw.'Deuda Total'
if ($dt.Count -gt 1) {
  $ps = Props $dt[1]
  $seed.deudaTotal = [ordered]@{
    fecha = Parse-Date $ps[0].Value
    monto = Parse-Money $ps[1].Value
  }
}

$unique = [ordered]@{}
foreach ($c in $seed.cuentas) {
  if (-not $unique.Contains($c.nombre)) { $unique[$c.nombre] = $c }
}
$seed.cuentas = @($unique.Values)

$out = Join-Path $PSScriptRoot 'seed-data.json'
[System.IO.File]::WriteAllText($out, ($seed | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
Write-Host "gastosMensuales=$($seed.gastosMensuales.Count)"
Write-Host "ingresos=$($seed.ingresos.Count)"
Write-Host "gastos=$($seed.gastos.Count)"
Write-Host "cuentas=$($seed.cuentas.Count)"
Write-Host "movimientos=$($seed.movimientos.Count)"
Write-Host "denominaciones=$($seed.denominaciones.Count)"
Write-Host "OK bytes=$((Get-Item $out).Length)"
