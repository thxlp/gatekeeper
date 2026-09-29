@echo off
REM EVASION TEST FIXTURE -- payload decodes to Write-Host "ok". Never deploy.
REM cmd.exe strips the caret, so this still launches the encoded command
power^shell -enc VwByAGkAdABlAC0ASABvAHMAdAAgACIAbwBrACIA
