$desktop = [System.Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop "Ibrahim Surgical Store.lnk"
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "c:\Users\Adil\Documents\Ibrahim_Surgical_Store\Start_App.bat"
$shortcut.WorkingDirectory = "c:\Users\Adil\Documents\Ibrahim_Surgical_Store"
$shortcut.Description = "Ibrahim Surgical Store - Offline Management System"
$shortcut.Save()
Write-Output "Desktop shortcut created at: $shortcutPath"
