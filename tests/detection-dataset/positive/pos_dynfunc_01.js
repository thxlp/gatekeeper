// DETECTION TEST FIXTURE -- builds executable code from a string.
function compileRule(expr) {
  return new Function('ctx', `return (${expr});`);
}

const isAdult = compileRule('ctx.age >= 18');
console.log(isAdult({ age: 20 }));
