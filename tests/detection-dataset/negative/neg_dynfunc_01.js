// Ordinary higher-order function -- a closure, not compiled from a string.
function compileRule(min) {
  return function (ctx) {
    return ctx.age >= min;
  };
}

const isAdult = compileRule(18);
console.log(isAdult({ age: 20 }));
