// Our own client-side guard: refuses to run a snippet that looks like an
// obfuscated loader before handing it to a sandboxed worker.
const BANNED_SHAPES = [/eval\s*\(\s*atob\s*\(/i, /new\s+Function\s*\(/i];

export function isSuspicious(source) {
  return BANNED_SHAPES.some((re) => re.test(source));
}
