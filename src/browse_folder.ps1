[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "請選擇專案素材資料夾 (Select Project Media Folder)"
$f.ShowNewFolderButton = $true

# 建立置頂父視窗，確保對話框強制出現在最上層，不被 Chrome 遮擋
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.Width = 0
$owner.Height = 0
$owner.ShowInTaskbar = $false
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

$result = $f.ShowDialog($owner)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($f.SelectedPath)
} else {
    [Console]::Out.WriteLine("")
}
