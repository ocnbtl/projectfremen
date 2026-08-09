# Unigentamos Vault Companion

The companion is the Windows master-device storage service behind the website UI. It binds only to `127.0.0.1:43127`, keeps the unwrapped vault key in memory only while unlocked, stores encrypted records in SQLite, stores media as authenticated encrypted files, and creates signed, verified encrypted backups on a configurable schedule.

Requirements: Windows and Node.js 24.15 or newer. Install the invisible per-user startup task from PowerShell:

```powershell
.\install-windows.ps1
```

When an external SSD is available, configure it as the encrypted backup destination during installation or by rerunning the installer:

```powershell
.\install-windows.ps1 -BackupDirectory "E:\Unigentamos Backups"
```

The defaults reserve room on the master computer instead of allowing an unexpected upload or backup loop to fill the disk: 400 GiB of encrypted media, 32 GiB or 2,000,000 encrypted record versions, and three backup sets in the configured backup directory. They can be changed deliberately during installation:

```powershell
.\install-windows.ps1 -BackupDirectory "E:\Unigentamos Backups" -MaxMediaLibraryGiB 800 -MaxRecordStorageGiB 64 -MaxHistoryVersions 4000000 -MaxBackups 5 -AutoBackupDays 7
```

While the Vault is unlocked, the companion checks hourly and creates a signed, verified backup when the configured cadence is due; the default is every seven days. When the backup-set limit is reached, move an older, restore-tested backup folder out of the configured backup directory before creating another. The companion notices the move and frees the slot; it never automatically deletes a backup. The Vault health panel shows the destination, last checked backup, cadence, and remaining slots.

The installer prints the one-time six-digit pairing code and adds **Unigentamos Vault Companion** to the Windows Start menu. Open that Start-menu item whenever you need to see the local pairing/status page, or visit `http://127.0.0.1:43127/` directly. Then open `https://unigentamos.com/vault`, choose **Windows desktop**, and use **Check this desktop** if the browser asks for local-network permission. Development can still use `npm.cmd start` from this directory, where the pairing code is printed in the terminal.

iPhone, iPad, and MacBook do not install the Windows companion. After the Windows vault is configured and unlocked, export its encrypted recovery file from the Vault page, transfer that file to the Apple device, then choose the Apple-device setup path and select the file. The same vault password unwraps it locally on that device.

The vault password is sent only from the approved website origin to loopback during setup or unlock. It is never written to disk or logged. Losing both the password and every recovery package makes the data unrecoverable by design.

The installer does not store the vault password or unwrapped key. It registers a least-privilege task for the current Windows user and keeps vault data under `%LOCALAPPDATA%\Unigentamos\Vault`. Backup copies contain the encrypted SQLite database and encrypted media blobs; they still require the vault password and recovery material.
