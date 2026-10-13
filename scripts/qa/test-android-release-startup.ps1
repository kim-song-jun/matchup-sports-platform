param(
    [Parameter(Mandatory = $true)][string]$ApkPath,
    [Parameter(Mandatory = $true)][string]$EvidenceDirectory,
    [string]$DeviceSerial = 'emulator-5554',
    [string]$PackageName = 'kr.co.teameet'
)

$ErrorActionPreference = 'Stop'
if ($DeviceSerial -notmatch '^emulator-[0-9]+$') {
    throw 'Use a dedicated emulator: this smoke test clears its logcat buffers.'
}
if ($PackageName -notin @('kr.co.teameet', 'kr.co.teameet.alpha')) {
    throw 'PackageName must be a Teameet Android application ID.'
}
$apk = (Resolve-Path -LiteralPath $ApkPath).Path
$evidence = New-Item -ItemType Directory -Path $EvidenceDirectory -Force

function Invoke-DeviceAdb {
    param([string[]]$Arguments)
    $result = & adb -s $DeviceSerial @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb $($Arguments[0]) failed: $($result -join [Environment]::NewLine)"
    }
    return ($result -join [Environment]::NewLine)
}

Invoke-DeviceAdb -Arguments @('install', '-r', $apk) | Write-Output
$package = Invoke-DeviceAdb -Arguments @('shell', 'dumpsys', 'package', $PackageName)
$package | Set-Content -LiteralPath (Join-Path $evidence.FullName 'package.txt') -Encoding utf8
if ($package -match '(?m)^\s*flags=\[[^\r\n]*DEBUGGABLE') {
    throw 'A debuggable APK cannot prove the production release startup contract.'
}
Invoke-DeviceAdb -Arguments @('shell', 'am', 'force-stop', $PackageName) | Out-Null
Invoke-DeviceAdb -Arguments @('logcat', '-c') | Out-Null
$launch = Invoke-DeviceAdb -Arguments @('shell', 'am', 'start', '-W', '-n', "$PackageName/.MainActivity")
$launch | Set-Content -LiteralPath (Join-Path $evidence.FullName 'launch.txt') -Encoding utf8
# Lifecycle observers run after Activity.onCreate. Keep observing after am start returns.
Start-Sleep -Seconds 15
$crash = Invoke-DeviceAdb -Arguments @('logcat', '-d', '-b', 'crash')
$crash | Set-Content -LiteralPath (Join-Path $evidence.FullName 'crash.txt') -Encoding utf8
$activity = Invoke-DeviceAdb -Arguments @('shell', 'dumpsys', 'activity', 'activities')
$activity | Set-Content -LiteralPath (Join-Path $evidence.FullName 'activity.txt') -Encoding utf8
$appProcess = & adb -s $DeviceSerial shell pidof $PackageName
$processExit = $LASTEXITCODE
if ($crash -match "Process: $([regex]::Escape($PackageName)),") {
    throw "Release startup crashed. See $(Join-Path $evidence.FullName 'crash.txt')"
}
if ($launch -notmatch '(?m)^Status:\s*ok\s*$' -or $processExit -ne 0 -or -not $appProcess) {
    throw 'Release startup did not complete with a live application process.'
}
$resumed = '(?m)(topResumedActivity|mResumedActivity)=.*' + [regex]::Escape("$PackageName/.MainActivity")
if ($activity -notmatch $resumed) {
    throw 'MainActivity is not the resumed screen after release startup.'
}
$deviceScreenshot = '/sdcard/teameet-release-startup-smoke.png'
try {
    Invoke-DeviceAdb -Arguments @('shell', 'screencap', '-p', $deviceScreenshot) | Out-Null
    Invoke-DeviceAdb -Arguments @('pull', $deviceScreenshot, (Join-Path $evidence.FullName 'startup.png')) | Out-Null
} finally {
    Invoke-DeviceAdb -Arguments @('shell', 'rm', $deviceScreenshot) | Out-Null
}
Write-Output "PASS: $PackageName release MainActivity stayed resumed without a crash for 15 seconds."
