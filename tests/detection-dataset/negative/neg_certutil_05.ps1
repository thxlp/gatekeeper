# Checks that the machine trusts our internal CA before the agent starts.
$thumb = "0000000000000000000000000000000000000000"
$found = Get-ChildItem -Path Cert:\LocalMachine\Root |
    Where-Object { $_.Thumbprint -eq $thumb }

if (-not $found) {
    throw "corporate root CA is not installed"
}
