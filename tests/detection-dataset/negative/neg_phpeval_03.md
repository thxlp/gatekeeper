# Coding standards: forbidden constructs

The review checklist rejects any patch that introduces dynamic code
execution. The classic webshell shape is an `eval` call wrapping a
`base64_decode` call, which is why the scanner flags that pair as
CRITICAL. Decoding base64 by itself is ordinary and allowed; it is the
execution of the decoded bytes that is banned.
