# Reads configuration and writes a summary. Base64 appears only as data:
# the decoded bytes are written to a file, never executed.
$encoded = Get-Content -Path ".\config.b64" -Raw
$bytes = [System.Convert]::FromBase64String($encoded)
[System.IO.File]::WriteAllBytes(".\config.json", $bytes)

Write-Host "wrote config.json"
