import { parse } from './vendor/acorn.mjs';

export const DEFAULT_ARTICLE_LAYOUT = Object.freeze({ mode: 'default', html: '', css: '', js: '' });
const globals = new Set(['document', 'window', 'Math', 'Number', 'String', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'undefined', 'NaN', 'Infinity', 'performance', 'console', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'getComputedStyle']);
const denied = new Set(['eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'navigator', 'location', 'top', 'parent', 'opener', 'frames', 'globalThis', 'self', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'Reflect', 'Proxy', 'WebAssembly', 'constructor', 'prototype', '__proto__', 'arguments']);
const members = new Set([
  'querySelector', 'querySelectorAll', 'getElementById', 'createElement', 'createTextNode', 'createDocumentFragment', 'body', 'documentElement', 'style', 'classList', 'textContent', 'innerText',
  'add', 'remove', 'toggle', 'contains', 'addEventListener', 'removeEventListener', 'preventDefault', 'stopPropagation',
  'setAttribute', 'getAttribute', 'removeAttribute', 'setProperty', 'removeProperty',
  'getBoundingClientRect', 'animate', 'scrollIntoView', 'append', 'appendChild', 'replaceChildren',
  'clientX', 'clientY', 'offsetX', 'offsetY', 'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight',
  'scrollTop', 'scrollHeight', 'innerWidth', 'innerHeight', 'target', 'currentTarget', 'type', 'key',
  'x', 'y', 'width', 'height', 'left', 'right', 'bottom', 'length', 'id', 'className',
  'transform', 'transformOrigin', 'opacity', 'color', 'background', 'backgroundColor', 'borderColor', 'borderRadius',
  'boxShadow', 'filter', 'transition', 'display', 'position', 'zIndex', 'padding', 'margin', 'fontSize', 'textAlign',
  'min', 'max', 'abs', 'round', 'floor', 'ceil', 'random', 'sin', 'cos', 'PI', 'pow', 'sqrt', 'now',
  'forEach', 'map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'slice', 'includes', 'indexOf',
  'push', 'pop', 'join', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'toFixed', 'substring', 'charAt',
  'log', 'warn', 'error', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'
]);
const forbiddenNodes = new Set(['ThisExpression', 'NewExpression', 'ImportExpression', 'ImportDeclaration', 'ExportNamedDeclaration',
  'ExportDefaultDeclaration', 'WithStatement', 'DebuggerStatement', 'TaggedTemplateExpression', 'ClassDeclaration', 'ClassExpression',
  'ObjectPattern', 'ArrayPattern', 'RestElement', 'SpreadElement']);
const loopNodes = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement']);
const safeElements = new Set(['div', 'span', 'p', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'button', 'strong', 'em', 'small', 'code', 'pre', 'br', 'hr', 'figure', 'figcaption']);
const methods = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'add', 'remove', 'toggle', 'contains', 'addEventListener', 'removeEventListener', 'preventDefault', 'stopPropagation', 'setAttribute', 'getAttribute', 'removeAttribute', 'setProperty', 'removeProperty', 'getBoundingClientRect', 'animate', 'scrollIntoView', 'append', 'appendChild', 'replaceChildren', 'min', 'max', 'abs', 'round', 'floor', 'ceil', 'random', 'sin', 'cos', 'pow', 'sqrt', 'now', 'forEach', 'map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'slice', 'includes', 'indexOf', 'push', 'pop', 'join', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'toFixed', 'substring', 'charAt', 'log', 'warn', 'error', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']);
function children(node) {
  return Object.entries(node).filter(([key]) => !['loc', 'start', 'end'].includes(key)).flatMap(([, value]) =>
    Array.isArray(value) ? value.filter(item => item && typeof item.type === 'string') : value && typeof value.type === 'string' ? [value] : []);
}
function property(node) { return node.computed ? node.property.value : node.property.name; }
export function inspectArticleScript(source) {
  if (!source.trim()) return { ok: true, issues: [], instrumented: '' };
  if (source.length > 65536) return { ok: false, issues: ['JS 超过 64 KiB 上限'], instrumented: '' };
  let tree;
  try { tree = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (error) { return { ok: false, issues: ['JS 语法错误：' + error.message], instrumented: '' }; }
  const names = new Set(), issues = [], edits = [];
  function issue(node, message) { if (issues.length < 12) issues.push('第 ' + node.loc.start.line + ' 行：' + message); }
  function declare(node) {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') names.add(node.id.name);
    if (/Function/.test(node.type)) { if (node.id) names.add(node.id.name); for (const parameter of node.params || []) if (parameter.type === 'Identifier') names.add(parameter.name); }
    if (node.type === 'CatchClause' && node.param?.type === 'Identifier') names.add(node.param.name);
    children(node).forEach(declare);
  }
  declare(tree);
  function walk(node, parent, key) {
    if (forbiddenNodes.has(node.type)) issue(node, '不允许此语法或能力：' + node.type + '。遍历请使用 forEach / map');
    if (node.type === 'Identifier') {
      const prop = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed
        || parent?.type === 'Property' && key === 'key' && !parent.computed;
      if (denied.has(node.name) || node.name.startsWith('__zhen')) issue(node, '禁止访问 ' + node.name);
      else if (!prop && !names.has(node.name) && !globals.has(node.name)) issue(node, '未允许的全局变量：' + node.name);
    }
    if (node.type === 'MemberExpression') {
      const value = property(node), numeric = node.computed && node.property.type === 'Literal' && Number.isInteger(value) && value >= 0 && value < 10000;
      if (node.computed && node.property.type !== 'Literal') issue(node, '不允许动态属性名，请使用明确的点号属性');
      else if (!numeric && (!members.has(value) || denied.has(value))) issue(node, '不允许访问属性：' + String(value));
      if ((methods.has(value) || ['createElement','createTextNode','createDocumentFragment'].includes(value)) && !(parent?.type === 'CallExpression' && key === 'callee')) issue(node, '运行接口必须直接调用，不能提取或改写：' + value);
    }
    if (node.type === 'Property' && (node.computed || node.kind !== 'init' || denied.has(node.key.name || node.key.value))) issue(node, '不允许动态对象属性、访问器或原型操作');
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const name = property(node.callee);
      if (name === 'createElement' && (node.arguments[0]?.type !== 'Literal' || !safeElements.has(node.arguments[0].value) || node.arguments.length !== 1)) issue(node, 'createElement 只接受明确的展示元素标签，例如 div、span、button；不能创建脚本、资源或嵌入页面');
      if (['setAttribute', 'getAttribute', 'removeAttribute'].includes(name)) {
        const attr = node.arguments[0];
        if (attr?.type !== 'Literal' || typeof attr.value !== 'string' || !/^(?:class|id|style|hidden|aria-[a-z-]+|data-[a-z-]+)$/.test(attr.value)) issue(node, '属性操作仅支持 class、id、style、hidden、aria-* 和 data-*');
      }
    }
    if (node.type === 'CallExpression' && ['setTimeout', 'requestAnimationFrame'].includes(node.callee.type === 'Identifier' ? node.callee.name : node.callee.type === 'MemberExpression' ? property(node.callee) : '')) {
      if (!['Identifier','FunctionExpression','ArrowFunctionExpression'].includes(node.arguments[0]?.type)) issue(node, '计时器和动画只能接收函数，不能执行字符串');
    }
    if ((node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') && (node.left || node.argument)?.type === 'MemberExpression') {
      const target = node.left || node.argument, name = property(target);
      if (['addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'setTimeout', 'requestAnimationFrame', 'now'].includes(name)
        || ['document', 'window', 'performance', 'Math', 'console'].includes(target.object?.name)) issue(node, '不能改写全局对象或运行接口');
    }
    if (/Function/.test(node.type)) {
      if (node.async || node.generator || node.params.some(param => param.type !== 'Identifier')) issue(node, '函数仅支持普通参数，不支持 async、生成器或解构参数');
      if (node.body.type === 'BlockStatement') edits.push({ at: node.body.start + 1, value: '__zhenGuard();' });
      else { edits.push({ at: node.body.start, value: '{__zhenGuard();return (' }); edits.push({ at: node.body.end, value: ');}' }); }
    }
    if (loopNodes.has(node.type)) {
      if (node.body.type === 'BlockStatement') edits.push({ at: node.body.start + 1, value: '__zhenGuard();' });
      else { edits.push({ at: node.body.start, value: '{__zhenGuard();' }); edits.push({ at: node.body.end, value: '}' }); }
    }
    for (const [field, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(field)) continue;
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) walk(child, node, field); });
      else if (value?.type) walk(value, node, field);
    }
  }
  walk(tree, null, '');
  if (issues.length) return { ok: false, issues: [...new Set(issues)], instrumented: '' };
  let instrumented = source;
  edits.sort((a, b) => b.at - a.at).forEach(edit => { instrumented = instrumented.slice(0, edit.at) + edit.value + instrumented.slice(edit.at); });
  return { ok: true, issues: [], instrumented };
}

export function normalizeArticleLayout(input, role = 'user', check = true) {
  if (!input) return { ...DEFAULT_ARTICLE_LAYOUT };
  if (typeof input !== 'object' || !['default', 'custom'].includes(input.mode)) throw new Error('文章页面设计格式无效');
  const layout = { mode: input.mode };
  for (const [key, choices] of Object.entries({ width: ['content', 'full'], baseStyles: ['reading', 'minimal'] })) {
    if (input[key] !== undefined) {
      if (!choices.includes(input[key])) throw new Error('无效的文章页面选项：' + key);
      layout[key] = input[key];
    }
  }
  for (const key of ['html', 'css', 'js']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(key + ' 必须是文本');
    layout[key] = input[key] || '';
  }
  const limit = role === 'admin' ? 256 * 1024 : 96 * 1024;
  if (new TextEncoder().encode(JSON.stringify(layout)).length > limit) throw new Error('文章设计超过 ' + limit / 1024 + ' KiB 上限');
  if (layout.js.length > (role === 'admin' ? 65536 : 16384)) throw new Error('JS 超过当前账号的大小上限');
  if (layout.mode === 'custom' && check) {
    if (!layout.html.includes('{{content}}') && !/data-article-slot=["']content["']/.test(layout.html)) throw new Error('HTML 必须包含 {{content}} 正文区域');
    if (/<\s*(?:script|iframe|object|embed|form|base|meta|link)\b|\bon[a-z]+\s*=|\bsrcdoc\s*=/i.test(layout.html)) throw new Error('HTML 中不能放脚本、事件属性或嵌入页面；请将代码放入 JS 编辑区');
    if (/@import\b/i.test(layout.css)) throw new Error('请将外部样式放入 CSS 编辑区，不使用 @import');
    const audit = inspectArticleScript(layout.js);
    if (!audit.ok) throw new Error(audit.issues.join('；'));
  }
  return layout;
}
