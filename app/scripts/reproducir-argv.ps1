[CmdletBinding()]
param(
    [string]$RequestId,
    [switch]$Run,
    [string]$LogPath = (Join-Path $env:LOCALAPPDATA 'launch-host\launch.log')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $LogPath -PathType Leaf)) {
    throw "No existe el log: $LogPath"
}

$lines = if ($RequestId) {
    @(Get-Content -LiteralPath $LogPath | Where-Object { $_ -match [regex]::Escape($RequestId) })
} else {
    @(Get-Content -LiteralPath $LogPath -Tail 1)
}
$lines = @($lines)

if (-not $lines -or $lines.Count -eq 0) {
    throw $(if ($RequestId) { "No se encontró request_id '$RequestId'." } else { "El log está vacío." })
}

$entry = $lines[-1] | ConvertFrom-Json
$argv = @($entry.argv)

if ($argv.Count -eq 0) {
    throw 'La entrada del log no contiene argv.'
}

function ConvertTo-PowerShellLiteral([string]$Value) {
    "'" + $Value.Replace("'", "''") + "'"
}

if ($argv.Count -eq 2 -and $argv[0] -eq 'ShellExecuteW') {
    Write-Output "2.9 no aplica igual: opener del SO (ShellExecuteW) para $($argv[1])."
    Write-Output 'No se ejecutará con -Run.'
    return
}

$command = '& ' + (ConvertTo-PowerShellLiteral $argv[0])
if ($argv.Count -gt 1) {
    $command += ' ' + (($argv[1..($argv.Count - 1)] | ForEach-Object {
        ConvertTo-PowerShellLiteral ([string]$_)
    }) -join ' ')
}

Write-Output $command

if ($Run) {
    $allowedExecutables = @('Code.exe', 'Cursor.exe', 'firefox.exe', 'explorer.exe')
    $executableName = [IO.Path]::GetFileName($argv[0])
    if (
        [IO.Path]::GetExtension($argv[0]) -ne '.exe' -or
        $allowedExecutables -notcontains $executableName
    ) {
        throw "Ejecución bloqueada: solo se permiten Code.exe, Cursor.exe, firefox.exe o explorer.exe."
    }

    if ($argv.Count -gt 1) {
        & $argv[0] @($argv[1..($argv.Count - 1)])
    } else {
        & $argv[0]
    }
}
