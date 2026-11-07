import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccent, accentPalette, contrast } from '../knowledge-appearance.js';

test('custom colors accept only normalized hex, rejecting CSS injection and corrupt stored values', () => {
  assert.equal(normalizeAccent(' #AbC '), '#aabbcc');
  assert.equal(normalizeAccent('#EF88AD'), '#ef88ad');
  for (const value of [null, {}, 123, '', '#12345', 'red', 'url(https://example.com)', '#fff;display:none', 'var(--secret)']) {
    assert.equal(normalizeAccent(value), null);
    assert.equal(accentPalette(value, false), null);
  }
});
test('extreme/custom colors retain readable accents and solid-button labels in both themes', () => {
  const colors = ['#ffffff', '#000000', '#808080', '#ff0000', '#00ff00', '#0000ff', '#69b7ff', '#36c6d3', '#55bf99', '#a78bfa', '#ef88ad', '#e8b15b'];
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    colors.push('#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join(''));
  }
  for (const color of colors) for (const dark of [false, true]) {
    const palette = accentPalette(color, dark);
    for (const key of ['--knowledge-primary', '--knowledge-secondary']) assert.ok(contrast(palette[key], dark ? '#17212c' : '#ffffff') >= 4.5, color + ' ' + key);
    assert.ok(contrast(palette['--knowledge-primary'], palette['--knowledge-on-primary']) >= 4.5);
  }
});
