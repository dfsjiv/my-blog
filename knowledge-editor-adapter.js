(function () {
  const vendor = window.KnowledgeEditorVendor;
  const purifier = window.DOMPurify;
  if (!vendor || !vendor.Editor) return;

  function markdownToEditorDocument(markdown, editor) {
    if (editor && editor.markdown && typeof editor.markdown.parse === 'function') {
      return editor.markdown.parse(String(markdown || ''));
    }
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  function editorDocumentToMarkdown(editor) {
    if (!editor || typeof editor.getMarkdown !== 'function') return '';
    return editor.getMarkdown();
  }

  function sanitizePastedHtml(html) {
    if (!purifier || typeof purifier.sanitize !== 'function') return '';
    return purifier.sanitize(String(html || ''), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [
        'script', 'iframe', 'object', 'embed', 'form', 'input',
        'button', 'style', 'svg', 'math',
      ],
      FORBID_ATTR: ['style', 'class', 'id'],
      ALLOW_DATA_ATTR: false,
    });
  }

  function create(options) {
    const settings = options || {};
    let editorRef = null;
    const extensions = [
      vendor.StarterKit.configure({
        link: false,
        codeBlock: {
          HTMLAttributes: { class: 'knowledge-writer-code-block' },
        },
      }),
      vendor.Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        isAllowedUri: safeLink,
      }),
      vendor.Image.configure({
        allowBase64: false,
        inline: false,
        HTMLAttributes: { class: 'knowledge-writer-image' },
      }),
      vendor.TableKit.configure({
        table: {
          resizable: true,
          HTMLAttributes: { class: 'knowledge-writer-table' },
        },
      }),
      vendor.TaskList.configure({
        HTMLAttributes: { class: 'knowledge-writer-task-list' },
      }),
      vendor.TaskItem.configure({ nested: true }),
      vendor.Placeholder.configure({
        placeholder: settings.placeholder || '请输入正文',
        showOnlyCurrent: true,
      }),
      vendor.Markdown.configure({
        markedOptions: { gfm: true, breaks: false },
      }),
    ];
    if (settings.bubbleElement) {
      extensions.push(vendor.BubbleMenu.configure({
        element: settings.bubbleElement,
        updateDelay: 120,
        options: { placement: 'top' },
        shouldShow: function (props) {
          return !props.editor.state.selection.empty && props.editor.isEditable;
        },
      }));
    }

    const editor = new vendor.Editor({
      element: settings.element,
      extensions,
      content: String(settings.markdown || ''),
      contentType: 'markdown',
      autofocus: false,
      injectCSS: false,
      editorProps: {
        attributes: {
          class: 'knowledge-tiptap-editor',
          spellcheck: 'true',
          'aria-label': settings.ariaLabel || '文章正文',
        },
        transformPastedHTML: sanitizePastedHtml,
        handlePaste: function (view, event) {
          const clipboard = event.clipboardData;
          if (!clipboard || !editorRef || editorRef.isActive('codeBlock')) return false;
          const html = clipboard.getData('text/html');
          const plain = clipboard.getData('text/plain');
          if (html || !looksLikeMarkdown(plain)) return false;
          event.preventDefault();
          editorRef.commands.insertContent(plain, { contentType: 'markdown' });
          return true;
        },
        handleKeyDown: function (view, event) {
          if (!editorRef) return false;
          if (settings.handleMenuKey && settings.handleMenuKey(event, editorRef)) return true;
          if (event.key === 'Tab' && editorRef.isActive('codeBlock')) {
            event.preventDefault();
            return handleCodeIndent(editorRef, event.shiftKey);
          }
          if (event.key === 'Escape' && settings.onEscape) settings.onEscape();
          return false;
        },
      },
      onCreate: function (payload) {
        editorRef = payload.editor;
        if (settings.onCreate) settings.onCreate(payload.editor);
      },
      onUpdate: function (payload) {
        if (settings.onUpdate) settings.onUpdate(payload.editor);
      },
      onSelectionUpdate: function (payload) {
        if (settings.onSelectionUpdate) settings.onSelectionUpdate(payload.editor);
      },
      onTransaction: function (payload) {
        if (settings.onTransaction) settings.onTransaction(payload.editor);
      },
    });
    editorRef = editor;
    return editor;
  }

  function handleCodeIndent(editor, remove) {
    const position = editor.state.selection.from;
    if (!remove) return editor.commands.insertContent('  ');
    const start = Math.max(0, position - 2);
    const preceding = editor.state.doc.textBetween(start, position, '\n', '\n');
    const spaces = preceding.match(/ {1,2}$/);
    if (!spaces) return true;
    return editor.chain().focus().deleteRange({
      from: position - spaces[0].length,
      to: position,
    }).run();
  }

  function safeLink(value) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch (error) {
      return false;
    }
  }

  function looksLikeMarkdown(value) {
    const text = String(value || '');
    return /(^|\n)(#{1,3}\s|>\s|[-*+]\s|\d+\.\s|```|\|.+\|)/.test(text)
      || /\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+]\([^)]+\)/.test(text);
  }

  window.KnowledgeEditorAdapter = {
    create,
    editorDocumentToMarkdown,
    markdownToEditorDocument,
    sanitizePastedHtml,
    safeLink,
  };
}());
