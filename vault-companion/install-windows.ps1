[CmdletBinding()]
param(
  [string]$BackupDirectory = "",
  [ValidateRange(1, 8192)][int]$MaxMediaLibraryGiB = 400,
  [ValidateRange(1, 1024)][int]$MaxRecordStorageGiB = 32,
  [ValidateRange(1, 10000000)][int]$MaxHistoryVersions = 2000000,
  [ValidateRange(1, 100)][int]$MaxBackups = 3,
  [ValidateRange(1, 365)][int]$AutoBackupDays = 7,
  [switch]$DoNotStart
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  throw "The Unigentamos Vault Companion installer only supports Windows."
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodePath = $nodeCommand.Source
$nodeVersion = [version]((& $nodePath --version).TrimStart("v"))
if ($nodeVersion -lt [version]"24.15.0") {
  throw "Node.js 24.15.0 or newer is required. Found $nodeVersion at $nodePath."
}

$sourceRoot = $PSScriptRoot
$installRoot = Join-Path $env:LOCALAPPDATA "Unigentamos\VaultCompanion"
$appRoot = Join-Path $installRoot "app"
$vaultDirectory = Join-Path $env:LOCALAPPDATA "Unigentamos\Vault"
$configPath = Join-Path $installRoot "companion-config.json"
$runnerPath = Join-Path $installRoot "run-companion.ps1"
$taskName = "Unigentamos Vault Companion"
$programsPath = [Environment]::GetFolderPath("Programs")
$shortcutPath = Join-Path $programsPath "Unigentamos Vault Companion.url"

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $listener = Get-NetTCPConnection -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $installedScript = [System.IO.Path]::GetFullPath((Join-Path $appRoot "src\server.mjs"))
    $companionProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $commandLine = if ($companionProcess) { [string]$companionProcess.CommandLine } else { "" }
    if (-not $companionProcess -or $commandLine.IndexOf($installedScript, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "Port 43127 is owned by an unexpected process. Stop it before updating the Vault Companion."
    }
    Stop-Process -Id $listener.OwningProcess -Force
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Get-NetTCPConnection -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Get-NetTCPConnection -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue) {
    throw "The existing Vault Companion did not stop cleanly."
  }
}

New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
New-Item -ItemType Directory -Path $vaultDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot "package.json") -Destination (Join-Path $appRoot "package.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot "src") -Destination $appRoot -Recurse -Force

$existing = if (Test-Path -LiteralPath $configPath) {
  Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} else {
  $null
}
function New-SecureSetupCode {
  $range = [uint64]900000
  $fullRange = [uint64][uint32]::MaxValue + 1
  $acceptBelow = $fullRange - ($fullRange % $range)
  $bytes = New-Object byte[] 4
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

  try {
    do {
      $rng.GetBytes($bytes)
      $value = [uint64][System.BitConverter]::ToUInt32($bytes, 0)
    } while ($value -ge $acceptBelow)

    return [string](100000 + [int]($value % $range))
  } finally {
    $rng.Dispose()
  }
}

$setupCode = if ($existing -and $existing.setupCode) {
  [string]$existing.setupCode
} else {
  New-SecureSetupCode
}
$resolvedBackup = if ($BackupDirectory) {
  [System.IO.Path]::GetFullPath($BackupDirectory)
} elseif ($existing -and $existing.backupDirectory) {
  [string]$existing.backupDirectory
} else {
  ""
}
if ($resolvedBackup) {
  New-Item -ItemType Directory -Path $resolvedBackup -Force | Out-Null
}

@{
  nodePath = $nodePath
  appRoot = $appRoot
  vaultDirectory = $vaultDirectory
  backupDirectory = $resolvedBackup
  maxMediaLibraryBytes = [int64]$MaxMediaLibraryGiB * 1GB
  maxRecordStorageBytes = [int64]$MaxRecordStorageGiB * 1GB
  maxHistoryVersions = $MaxHistoryVersions
  maxBackups = $MaxBackups
  autoBackupDays = $AutoBackupDays
  setupCode = $setupCode
  installedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

@'
$ErrorActionPreference = "Stop"
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "companion-config.json") -Raw | ConvertFrom-Json
$env:UNIGENTAMOS_VAULT_DIR = [string]$config.vaultDirectory
$env:UNIGENTAMOS_SETUP_CODE = [string]$config.setupCode
$env:UNIGENTAMOS_MAX_MEDIA_LIBRARY_BYTES = [string]$config.maxMediaLibraryBytes
$env:UNIGENTAMOS_MAX_RECORD_STORAGE_BYTES = [string]$config.maxRecordStorageBytes
$env:UNIGENTAMOS_MAX_HISTORY_VERSIONS = [string]$config.maxHistoryVersions
$env:UNIGENTAMOS_MAX_BACKUPS = [string]$config.maxBackups
$env:UNIGENTAMOS_VAULT_AUTO_BACKUP_MS = [string]([int64]$config.autoBackupDays * 86400000)
if ($config.backupDirectory) {
  $env:UNIGENTAMOS_VAULT_BACKUP_DIR = [string]$config.backupDirectory
}
Set-Location -LiteralPath ([string]$config.appRoot)
& ([string]$config.nodePath) (Join-Path ([string]$config.appRoot) "src\server.mjs")
'@ | Set-Content -LiteralPath $runnerPath -Encoding UTF8

@"
[InternetShortcut]
URL=http://127.0.0.1:43127/
IconFile=$env:SystemRoot\System32\imageres.dll
IconIndex=2
"@ | Set-Content -LiteralPath $shortcutPath -Encoding ASCII

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
  -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`"" `
  -WorkingDirectory $installRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

if (-not $DoNotStart) {
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Milliseconds 750
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:43127/health" -Headers @{ Origin = "https://unigentamos.com" } -TimeoutSec 3
  if (-not $health.ok) {
    throw "The scheduled companion started but did not pass its health check."
  }
}

Write-Host "Unigentamos Vault Companion installed for $currentUser."
Write-Host "It runs invisibly at sign-in and listens only on 127.0.0.1:43127."
Write-Host "Limits: $MaxMediaLibraryGiB GiB media, $MaxRecordStorageGiB GiB record history, $MaxHistoryVersions versions, $MaxBackups backup sets."
Write-Host "Automatic encrypted backup cadence: every $AutoBackupDays day(s) while the vault is unlocked."
Write-Host "Find pairing and status anytime: Start menu > Unigentamos Vault Companion."
if (-not $existing) {
  Write-Host "One-time desktop pairing code: $setupCode"
}
if ($resolvedBackup) {
  Write-Host "Encrypted backups will be written under: $resolvedBackup"
} else {
  Write-Host "Encrypted backups currently stay with the local vault. Re-run with -BackupDirectory when an external SSD is available."
}
