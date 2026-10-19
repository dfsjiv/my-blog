import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  function setNavOpen('), source.indexOf('  function configureNavigationLinks('))
  + source.slice(source.indexOf('  function setupNavigationMenus('), source.indexOf('  function closeNavigation('));

function fixture() {
  const node = () => {
    const classes = new Set();
    return {
      events: {}, attrs: {}, hidden: true,
      classList: {
        contains: name => classes.has(name),
        remove: name => classes.delete(name),
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
      },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, callback) { this.events[name] = callback; },
      focus() { this.focused = true; }
    };
  };
  const trigger = node(), submenu = node(), item = node(), menu = node();
  menu.dataset = { knowledgeNavMenu: 'articles' };
  menu.contains = () => false;
  menu.querySelector = selector => selector.includes('submenu button') ? item : selector.includes('trigger') ? trigger : submenu;
  const context = {
    navMenus: [menu], navLinks: node(), menuToggle: node(),
    header: { contains: target => target.insideHeader },
    document: node(), window: { matchMedia: () => ({ matches: true }) },
    t: text => text
  };
  vm.createContext(context);
  vm.runInContext(functions + '\nsetupNavigationMenus();', context);
  return { context, menu, trigger, submenu, item };
}

test('compact navigation updates its controls and closes submenus with the drawer', () => {
  const { context, menu, trigger, submenu } = fixture();
  context.setNavOpen(true);
  trigger.events.click();
  assert.equal(submenu.hidden, false);
  assert.equal(context.menuToggle.textContent, '×');
  context.setNavOpen(false);
  assert.equal(context.menuToggle.attrs['aria-expanded'], 'false');
  assert.equal(context.menuToggle.textContent, '☰');
  assert.equal(submenu.hidden, true);
  assert.equal(menu.classList.contains('is-open'), false);
});

test('ArrowDown focuses a real submenu item; Escape closes submenu then drawer', () => {
  const { context, trigger, submenu, item } = fixture();
  context.setNavOpen(true);
  let prevented = false;
  trigger.events.keydown({ key: 'ArrowDown', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(item.focused, true);
  context.document.events.keydown({ key: 'Escape' });
  assert.equal(submenu.hidden, true);
  assert.equal(trigger.focused, true);
  assert.equal(context.navLinks.classList.contains('is-open'), true);
  context.document.events.keydown({ key: 'Escape' });
  assert.equal(context.navLinks.classList.contains('is-open'), false);
  assert.equal(context.menuToggle.focused, true);
});

test('outside clicks close the compact drawer; header clicks do not', () => {
  const { context } = fixture();
  context.setNavOpen(true);
  context.document.events.click({ target: { insideHeader: true, closest: () => null } });
  assert.equal(context.navLinks.classList.contains('is-open'), true);
  context.document.events.click({ target: { insideHeader: false, closest: () => null } });
  assert.equal(context.navLinks.classList.contains('is-open'), false);
});
