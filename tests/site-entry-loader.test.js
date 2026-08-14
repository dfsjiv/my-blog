const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'site-entry-loader.js'), 'utf8');
const site = fs.readFileSync(path.join(root, 'knowledge-site.js'), 'utf8');

assert(html.includes('id="siteEntryLoader"'));
assert(html.includes('id="siteEntryLoaderCanvas"'));
assert(html.includes('id="siteEntryLoaderProgress"'));
assert(html.includes('>LEE\'S SITE</p>'));
assert(html.indexOf('site-entry-loader.js') < html.indexOf('home-device.js'));
assert(loader.includes("const STORAGE_KEY = 'lee_site_entry_seen_v1'"));
assert(loader.includes('window.sessionStorage.getItem'));
assert(loader.includes("window.addEventListener('load'"));
assert(loader.includes('window.siteEntryLoader = { play }'));
assert(loader.includes('const DEFAULT_LABEL = "LEE\'S SITE"'));
assert(loader.includes('settings.label.trim().toUpperCase()'));
assert(site.includes("window.siteEntryLoader.play({ force: true, label: 'MY OS' });"));
assert(site.includes('window.authUi.showDesktop(user);'));

console.log('site-entry-loader tests passed');
