import test from 'node:test';
import assert from 'node:assert/strict';
import { isbnFromBarcode } from '../src/scanner.js';

test('accepts book EAN-13 barcodes (978 and 979)', () => {
  assert.equal(isbnFromBarcode('9780747532699'), '9780747532699');
  assert.equal(isbnFromBarcode('9791032305690'), '9791032305690');
});

test('ignores EAN-13 barcodes that are not books', () => {
  assert.equal(isbnFromBarcode('4006381333931'), null);
});

test('ignores a bad checksum', () => {
  assert.equal(isbnFromBarcode('9780747532698'), null);
});

test('ignores wrong lengths, letters and empty input', () => {
  assert.equal(isbnFromBarcode('978074753269'), null);
  assert.equal(isbnFromBarcode('978074753269X'), null);
  assert.equal(isbnFromBarcode('0747532699'), null);
  assert.equal(isbnFromBarcode(''), null);
  assert.equal(isbnFromBarcode(undefined), null);
});
