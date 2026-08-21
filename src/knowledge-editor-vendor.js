import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import Paragraph from '@tiptap/extension-paragraph';

const CENTER_MARKER = '{center} ';

const AlignedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      textAlign: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align') || null,
        renderHTML: (attributes) => attributes.textAlign
          ? { 'data-align': attributes.textAlign }
          : {},
      },
    };
  },

  parseMarkdown(token, helpers) {
    let tokens = (token.tokens || []).map((item) => ({ ...item }));
    let textAlign = null;
    const first = tokens[0];
    if (first && first.type === 'text') {
      const text = String(first.text || '');
      const raw = String(first.raw || '');
      if (text.startsWith(CENTER_MARKER) || raw.startsWith(CENTER_MARKER)) {
        textAlign = 'center';
        first.text = text.replace(/^\{center\}\s*/, '');
        first.raw = raw.replace(/^\{center\}\s*/, '');
        if (!first.text && !first.raw) tokens = tokens.slice(1);
      }
    }
    return helpers.createNode('paragraph', { textAlign }, helpers.parseInline(tokens));
  },

  renderMarkdown(node, helpers) {
    const content = Array.isArray(node?.content) ? node.content : [];
    if (!content.length) return '';
    const body = helpers.renderChildren(content);
    return node.attrs?.textAlign === 'center' ? CENTER_MARKER + body : body;
  },
});

export {
  Editor,
  StarterKit,
  Markdown,
  Link,
  Image,
  TableKit,
  TaskItem,
  TaskList,
  Placeholder,
  BubbleMenu,
  AlignedParagraph,
};
