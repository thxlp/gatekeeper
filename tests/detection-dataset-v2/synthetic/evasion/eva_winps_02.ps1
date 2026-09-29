# EVASION TEST FIXTURE -- payload decodes to Write-Host "ok". Never deploy.
# pwsh (PowerShell 7) is not matched by the rule, and -en is the short form
# of -EncodedCommand that the rule's alternation also misses.
pwsh -en VwByAGkAdABlAC0ASABvAHMAdAAgACIAbwBrACIA
