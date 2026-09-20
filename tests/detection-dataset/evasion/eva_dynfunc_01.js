// EVASION TEST FIXTURE -- Function() called without `new`, and via an alias.
const F = Function;
const build = F('a', 'b', 'return a + b;');  // compiles a function from a string
console.log(build(1, 2));
