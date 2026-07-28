const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'elegant-shell.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'portal-data.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'elegant-shell.css'), 'utf8');

assert.match(html, /id="elegantShell"/);
assert.match(html, /id="portalHome"/);
assert.match(html, /id="portalQuickLinks"/);
assert.match(html, /id="portalPostList"/);
assert.match(html, /id="portalProjectList"/);
assert.match(html, /id="portalActivityList"/);
assert.match(html, /id="portalStats"/);
assert.match(html, /id="portalCalendar"/);
assert.match(html, /id="portalLogoutButton"/);
assert.match(html, /data-hero-background/);
assert.match(html, /data-character-art/);
assert.match(html, /data-avatar/);
assert.match(html, /<script src="portal-data\.js"><\/script>\s*<script src="elegant-shell\.js"><\/script>/);

assert.match(data, /placeholder:\s*true/);
assert.match(data, /quickLinks/);
assert.match(data, /placeholderPosts/);
assert.match(data, /placeholderProjects/);
assert.match(data, /placeholderActivities/);
assert.match(data, /placeholderStats/);

assert.match(script, /window\.authUi\.showDesktop\(user\)/);
assert.match(script, /window\.authUi\.logoutToLogin\(''\)/);
assert.match(html, /href="blog\.html"/);
assert.match(data, /href:\s*'blog\.html'/);
assert.match(script, /window\.contestCenter\.openWindow\(\)/);
assert.match(script, /window\.cityWorldApp\.enterCityWorld\(\)/);
assert.doesNotMatch(script, /innerHTML/);
assert.doesNotMatch(script, /fetch\(/);

assert.match(css, /--portal-bg:/);
assert.match(css, /prefers-color-scheme:\s*dark/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /grid-template-columns:\s*250px minmax\(0,\s*1fr\) 250px/);

console.log('portal tests passed');
