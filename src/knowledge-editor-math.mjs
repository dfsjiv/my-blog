import { Node } from '@tiptap/core';

// Store complete TeX source as an atom. Letting Markdown treat formulas as text
// loses \[ / \( and doubles command backslashes again on every rich-text save.
const DISPLAY = /^(?: {0,3})(?:\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)(?=[ \t]*(?:\n|$))/;
const INLINE = /^(?:\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)|\$\$[\s\S]*?\$\$|\$(?!\s)(?:\\[^\n]|[^$\n\\])+?\$)/;

function mathNode(name, display) {
  return Node.create({
    name,
    group: display ? 'block' : 'inline',
    inline: !display,
    atom: true,
    selectable: true,
    marks: '',
    addAttributes() {
      return { source: { default: '', rendered: false } };
    },
    parseHTML() {
      return [{
        tag: (display ? 'div' : 'span') + '[data-knowledge-math="' + (display ? 'display' : 'inline') + '"]',
        getAttrs: element => {
          const source = element.textContent || '';
          const match = (display ? DISPLAY : INLINE).exec(source);
          return match && match[0] === source ? { source } : false;
        },
      }];
    },
    renderHTML({ node }) {
      // Text children are escaped by ProseMirror, never interpreted as HTML.
      // Keep delimiters in exported HTML so the sanitized preview can render it.
      return [display ? 'div' : 'span', {
        'data-knowledge-math': display ? 'display' : 'inline',
        class: 'knowledge-writer-math-source',
        title: '公式：切换 Markdown 模式编辑',
      }, node.attrs.source || ''];
    },
    markdownTokenizer: {
      name,
      level: display ? 'block' : 'inline',
      start: src => display ? src.search(/^ {0,3}(?:\\\[|\$\$)/m) : src.search(/\\[\[(]|\$/),
      tokenize(src) {
        const match = (display ? DISPLAY : INLINE).exec(src);
        return match ? { type: name, raw: match[0], source: match[0] } : undefined;
      },
    },
    parseMarkdown: (token, helpers) => helpers.createNode(name, { source: token.source }),
    renderMarkdown: node => node.attrs?.source || '',
  });
}

export const KnowledgeMathInline = mathNode('knowledgeMathInline', false);
export const KnowledgeMathDisplay = mathNode('knowledgeMathDisplay', true);
