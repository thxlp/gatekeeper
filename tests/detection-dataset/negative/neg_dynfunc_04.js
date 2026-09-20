// Named handlers picked from a table -- the only thing the caller
// controls is which of our own functions runs.
const HANDLERS = {
  double: (x) => x * 2,
  square: (x) => x * x,
  negate: (x) => -x,
};

function apply(name, value) {
  const fn = HANDLERS[name];
  if (typeof fn !== 'function') throw new Error(`unknown handler: ${name}`);
  return fn(value);
}

module.exports = { apply };
