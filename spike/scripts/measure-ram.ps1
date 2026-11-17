# Launches the release build, waits for the in-app checks, then samples the RAM of the
# whole process tree (spike.exe plus its WebView2 children).
# Usage: powershell -File scripts/measure-ram.ps1 [-Exe path] [-ReportDir dir] [-SettleSeconds 10] [-Samples 5]
#        [-Checks "sqlite,map,graph" | "none" | any subset] [-MapOpts "lite,nodeck,workers=N"]
param(
  [string]$Exe = "$PSScriptRoot\..\src-tauri\target\release\spike.exe",
  [string]$ReportDir = "$env:TEMP\mentalist-spike-report",
  [int]$SettleSeconds = 10,
  [int]$Samples = 5,
  [string]$Checks = "sqlite,map,graph",
  [string]$MapOpts = ""
)
$ErrorActionPreference = "Stop"
Remove-Item -Recurse -Force $ReportDir -ErrorAction SilentlyContinue
$env:SPIKE_REPORT_DIR = $ReportDir
$env:SPIKE_CHECKS = $Checks
$env:SPIKE_MAP_OPTS = $MapOpts
$app = Start-Process -FilePath $Exe -PassThru

function Get-Tree([int]$rootId) {
  $all = Get-CimInstance Win32_Process
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($rootId)
  do {
    $added = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true }
    }
  } while ($added)
  $ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
}

try {
  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Path "$ReportDir\checks.json")) {
    if ((Get-Date) -gt $deadline) { throw "checks.json not written within 90 s" }
    Start-Sleep -Milliseconds 500
  }
  Start-Sleep -Seconds $SettleSeconds

  $rows = for ($i = 1; $i -le $Samples; $i++) {
    $tree = @(Get-Tree $app.Id)
    [pscustomobject]@{
      Sample      = $i
      Processes   = $tree.Count
      WorkingSetMB = [math]::Round(($tree | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
      PrivateMB    = [math]::Round(($tree | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 1)
    }
    Start-Sleep -Seconds 2
  }
  $last = @(Get-Tree $app.Id)
  $breakdown = $last | Sort-Object WorkingSet64 -Descending |
    Select-Object Name, Id, @{n = "WorkingSetMB"; e = { [math]::Round($_.WorkingSet64 / 1MB, 1) } },
                            @{n = "PrivateMB"; e = { [math]::Round($_.PrivateMemorySize64 / 1MB, 1) } }
  [pscustomobject]@{
    samples       = $rows
    peakWorkingSetMB = ($rows | Measure-Object WorkingSetMB -Maximum).Maximum
    peakPrivateMB    = ($rows | Measure-Object PrivateMB -Maximum).Maximum
    breakdown     = $breakdown
  } | ConvertTo-Json -Depth 4 | Set-Variable json
  $json | Out-File -Encoding utf8 "$ReportDir\ram.json"
  $json
}
finally {
  Get-Tree $app.Id | Stop-Process -Force -ErrorAction SilentlyContinue
}
