'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, escapeField } = require('../lib/csv');

test('escapeField quotes values containing commas, quotes, or newlines', () => {
  assert.equal(escapeField('plain'), 'plain');
  assert.equal(escapeField('a,b'), '"a,b"');
  assert.equal(escapeField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeField('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeField(null), '');
  assert.equal(escapeField(undefined), '');
  assert.equal(escapeField(42), '42');
});

test('toCsv renders header + rows in the given column order', () => {
  const csv = toCsv(
    [{ email: 'a@example.com', value: 10 }, { email: 'b@example.com', value: 'needs, escaping' }],
    ['email', 'value']
  );
  assert.equal(csv, 'email,value\r\na@example.com,10\r\nb@example.com,"needs, escaping"\r\n');
});

test('toCsv defaults columns to the first row\'s keys', () => {
  const csv = toCsv([{ a: 1, b: 2 }]);
  assert.equal(csv, 'a,b\r\n1,2\r\n');
});

test('toCsv returns an empty string for an empty input with no columns', () => {
  assert.equal(toCsv([]), '');
});

test('toCsv supports {key,label} column descriptors', () => {
  const csv = toCsv([{ id: 1 }], [{ key: 'id', label: 'Checkout ID' }]);
  assert.equal(csv, 'Checkout ID\r\n1\r\n');
});
