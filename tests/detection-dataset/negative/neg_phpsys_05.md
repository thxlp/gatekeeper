# Why command injection findings are CRITICAL

The scanner flags any call to `system`, `exec`, `passthru`, `shell_exec`
or `popen` whose first argument comes straight from `$_GET`, `$_POST`,
`$_REQUEST` or `$_COOKIE`. Passing request data through
`escapeshellarg()` as an argument to a fixed binary, or mapping the
input through an allow-list, is the accepted remediation.
