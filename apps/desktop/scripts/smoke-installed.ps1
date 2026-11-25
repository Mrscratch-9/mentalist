# Silent per-user install of the NSIS installer into a temp dir, launch, sample RAM of the
# process tree (private bytes), close, uninstall. Usage:
#   powershell -File smoke-installed.ps1 -Installer <setup.exe> -InstallDir <dir> [-WaitSeconds 25] [-Samples 5]
param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$InstallDir,
  [int]$WaitSeconds = 25,
  [int]$Samples = 5
)
$ErrorActionPreference = "Stop"
function Get-Tree([int]$rootId) {
  $all = Get-CimInstance Win32_Process
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($rootId)
  do { $added = $false
    foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } }
  } while ($added)
  $ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
}
# /D must be the last argument and unquoted
Start-Process -FilePath $Installer -ArgumentList "/S", "/D=$InstallDir" -Wait
$exe = Join-Path $InstallDir "mentalist.exe"
"installed exe exists: $(Test-Path $exe); tiles: $((Get-ChildItem (Join-Path $InstallDir 'tiles') -ErrorAction SilentlyContinue | ForEach-Object Name) -join ', ')"
$app = Start-Process -FilePath $exe -PassThru
try {
  Start-Sleep -Seconds $WaitSeconds
  $app.Refresh()
  "exited early: $($app.HasExited)"
  "main window: handle=$($app.MainWindowHandle) title='$($app.MainWindowTitle)'"
  $rows = for ($i = 1; $i -le $Samples; $i++) {
    $t = @(Get-Tree $app.Id)
    [pscustomobject]@{ Processes = $t.Count
      PrivateMB = [math]::Round(($t | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 1)
      WorkingSetMB = [math]::Round(($t | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1) }
    Start-Sleep -Seconds 2
  }
  $rows | Format-Table | Out-String
  "peak private MB: $(($rows | Measure-Object PrivateMB -Maximum).Maximum)"
} finally {
  Get-Tree $app.Id | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $un = Join-Path $InstallDir "uninstall.exe"
  if (Test-Path $un) { Start-Process -FilePath $un -ArgumentList "/S", "_?=$InstallDir" -Wait }
  Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
  "install dir removed: $(-not (Test-Path $InstallDir))"
}
