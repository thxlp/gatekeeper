// DETECTION TEST FIXTURE -- indirect construction to dodge naive greps.
const F = Function;

function build(src) {
  return new  Function('a', 'b', src);
}

module.exports = { build, F };
