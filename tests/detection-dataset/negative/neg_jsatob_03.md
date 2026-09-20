# Frontend review checklist

Reject any pull request that executes decoded strings. The pattern the
scanner looks for is an `eval` call wrapping an `atob` call, which is how
obfuscated skimmer scripts are usually bootstrapped. Calling `atob` on
its own -- to read a JWT payload or a data URI -- is perfectly normal and
is not flagged.
