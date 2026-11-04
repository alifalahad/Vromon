# Daily data-platform run (docs/OPERATIONS_RUNBOOK.md): due connectors, stale marking, Monday report.
$ErrorActionPreference = "Continue"
$platform = Join-Path $PSScriptRoot "..\..\data-platform"
$python = Join-Path $platform ".venv\Scripts\python.exe"
$log = Join-Path $platform "quality-reports\scheduled-$(Get-Date -Format yyyy-MM-dd).log"
Push-Location $platform
try {
    & $python -m vromon_data ops run-due *>> $log
    & $python -m vromon_data ops stale *>> $log
    if ((Get-Date).DayOfWeek -eq "Monday") { & $python -m vromon_data ops weekly *>> $log }
} finally {
    Pop-Location
}
