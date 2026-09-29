# Windows agent: what the scanner rejects

An invocation of `powershell` with the encoded-command switch hides the
payload from review, so we treat it as CRITICAL. Passing a checked-in
`.ps1` file with `-File`, or a readable one-liner with `-Command`, is
fine and is what our own installer does.
