# Share Vromon with friends from this Windows PC, over free Cloudflare quick tunnels.
# The Windows twin of start.sh.
#
#   powershell -ExecutionPolicy Bypass -File scripts\share\start.ps1      (Ctrl+C stops everything)
#
# - Starts a second backend on 127.0.0.1:8002 in production mode (sign-in required, no dev
#   shortcuts), next to the usual development one on 8001. Both use the same database.
# - Opens a tunnel to it and publishes the tunnel's address to the config file the shared
#   app reads at start, so the APK never needs rebuilding when the address changes.
# - If scripts\share\apk\ holds the APK, opens a second tunnel that serves it, and prints
#   the download link.
# - Keeps the PC awake while it runs (closing a laptop's lid still sleeps it).
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Share = "$Root\scripts\share"
$Logs = "$Share\logs"
$Python = "$Root\backend\venv\Scripts\python.exe"
$ApiPort = 8002
$ApkPort = 8003
New-Item -ItemType Directory -Force $Logs | Out-Null

$Cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $Cloudflared) {
    $Cloudflared = @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Cloudflared) { Write-Host "Install the tunnel first: winget install --id Cloudflare.cloudflared"; exit 1 }
# Get-NetTCPConnection can miss servers bound to 127.0.0.1, so look at command lines as well
$leftover = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*--port $ApiPort*" -or $_.CommandLine -like "*http.server $ApkPort*" }
if ($leftover) { Write-Host "A share backend is still running (scripts\share\stop.ps1 stops it)"; exit 1 }
foreach ($port in $ApiPort, $ApkPort) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        Write-Host "Port $port is in use (is the share already running? scripts\share\stop.ps1 stops it)"; exit 1
    }
}

function Test-Url($url) {
    try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}

# Wait for a quick tunnel to print its https address in its log
function Get-TunnelUrl($log) {
    for ($i = 0; $i -lt 60; $i++) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { return $m.Matches[0].Value }
        Start-Sleep 1
    }
    throw "The tunnel didn't start; see $log"
}

function Start-Logged($file, $arguments, $name, $dir = $Root) {
    Start-Process $file -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$Logs\$name.log" -RedirectStandardError "$Logs\$name.err.log"
}

Add-Type -Namespace Vromon -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern int SetThreadExecutionState(int flags);'   # int: PowerShell 5.1 reads 0x80000000 as a negative Int32

$procs = @()
try {
    Write-Host "Starting the backend (production mode) on port $ApiPort..."
    $env:APP_ENV = 'production'
    $env:DEV_AUTH_BYPASS = 'false'
    $backend = Start-Logged $Python "-m uvicorn app.main:app --host 127.0.0.1 --port $ApiPort --proxy-headers --forwarded-allow-ips 127.0.0.1 --ws-max-size 16384" 'backend' "$Root\backend"
    $procs += $backend
    Remove-Item Env:APP_ENV, Env:DEV_AUTH_BYPASS
    for ($i = 0; $i -lt 60 -and -not (Test-Url "http://127.0.0.1:$ApiPort/health"); $i++) { Start-Sleep 1 }
    if (-not (Test-Url "http://127.0.0.1:$ApiPort/health")) { throw "The backend didn't start; see $Logs\backend.err.log" }

    Write-Host "Opening the tunnel..."
    $procs += Start-Logged $Cloudflared "tunnel --no-autoupdate --url http://127.0.0.1:$ApiPort" 'tunnel-api'
    $ApiUrl = Get-TunnelUrl "$Logs\tunnel-api.err.log"

    # A new quick tunnel can take a few seconds before its address answers
    for ($i = 0; $i -lt 30 -and -not (Test-Url "$ApiUrl/health"); $i++) { Start-Sleep 2 }
    & $Python "$Share\publish_config.py" $ApiUrl | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Couldn't publish the backend address (see the message above)" }
    Write-Host "Backend address published: $ApiUrl"

    $Apk = Get-ChildItem "$Share\apk\*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Apk) {
        $procs += Start-Logged $Python "-m http.server $ApkPort --bind 127.0.0.1 --directory `"$Share\apk`"" 'apk-server'
        $procs += Start-Logged $Cloudflared "tunnel --no-autoupdate --url http://127.0.0.1:$ApkPort" 'tunnel-apk'
        $ApkLink = "$(Get-TunnelUrl "$Logs\tunnel-apk.err.log")/$($Apk.Name)"
    }

    [Vromon.Power]::SetThreadExecutionState(0x80000001) | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

    Write-Host ""
    Write-Host "Vromon is shared. Keep this window open and the PC on (lid open)."
    if ($ApkLink) { Write-Host "APK download link (works while this runs): $ApkLink" }
    Write-Host "Logs: $Logs"
    Write-Host "Press Ctrl+C to stop."
    while (-not $backend.HasExited) { Start-Sleep 2 }
    Write-Host "The backend stopped; see $Logs\backend.err.log"
}
finally {
    Write-Host ""; Write-Host "Stopping the share..."
    $ErrorActionPreference = 'Continue'   # a process that already exited must not stop the cleanup
    # /T: the venv's python.exe is a launcher, the real server is its child
    foreach ($p in $procs) { cmd /c "taskkill /PID $($p.Id) /T /F >nul 2>&1" }
    [Vromon.Power]::SetThreadExecutionState(0x80000000) | Out-Null   # ES_CONTINUOUS: allow sleep again
}
