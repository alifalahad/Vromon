# Stops a share left running (start.ps1 normally stops everything itself on Ctrl+C; closing
# its window instead can leave the backend and tunnels running).
#
#   powershell -ExecutionPolicy Bypass -File scripts\share\stop.ps1
$ApiPort = 8002
$ApkPort = 8003

$stopped = 0
foreach ($port in $ApiPort, $ApkPort) {
    $owners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    $tunnels = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" |
        Where-Object { $_.CommandLine -like "*127.0.0.1:$port*" } | Select-Object -ExpandProperty ProcessId
    foreach ($id in @($owners) + @($tunnels)) {
        if ($id) { taskkill /PID $id /T /F 2>&1 | Out-Null; $stopped++ }
    }
}
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
    Where-Object { $_.CommandLine -like '*share\start.ps1*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null; $stopped++ }

if ($stopped -eq 0) { Write-Host "Nothing was running." } else { Write-Host "Stopped the share ($stopped processes)." }
