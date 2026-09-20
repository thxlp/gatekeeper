const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('./clean_01_slugify.js');

test('lowercases and hyphenates', () => {
  assert.strictEqual(slugify('Hello World'), 'hello-world');
});

test('trims stray separators', () => {
  assert.strictEqual(slugify('  --Hi--  '), 'hi');
});
