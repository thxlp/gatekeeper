# Verifies a downloaded artifact against its published hash.
certutil -hashfile .\installer.msi SHA256

Write-Host "compare the hash above with the value on the release page"
