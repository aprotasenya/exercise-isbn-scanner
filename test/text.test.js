import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionToText } from '../src/text.js';

test('keeps paragraph breaks from <br> and <p>', () => {
  assert.equal(descriptionToText('Para one.<br><br>Para two'), 'Para one.\n\nPara two');
  assert.equal(descriptionToText('<p>One</p><p>Two</p>'), 'One\nTwo');
});

test('normalizes CRLF and collapses long runs of blank lines', () => {
  assert.equal(descriptionToText('A\r\n\r\n\r\n\r\nB'), 'A\n\nB');
});

test('strips tags but not stray angle brackets', () => {
  assert.equal(descriptionToText('<b>Bold</b> and <a href="x">link</a>'), 'Bold and link');
  assert.equal(descriptionToText('a < b and c > d'), 'a < b and c > d');
});

test('decodes entities once, without double-decoding', () => {
  assert.equal(descriptionToText('Tom &amp; Jerry &#39;n&#x27; more'), "Tom & Jerry 'n' more");
  assert.equal(descriptionToText('&amp;lt;b&amp;gt;'), '&lt;b&gt;');
  assert.equal(descriptionToText('&quot;hi&quot; &unknown;'), '"hi" &unknown;');
});

test('plain text passes through trimmed', () => {
  assert.equal(descriptionToText('  Just text.  '), 'Just text.');
});
