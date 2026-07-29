(function () {
  const DRAFT_PREFIX = 'knowledge-writer-draft:v1:';
  const AUTO_SAVE_DELAY = 1500;
  const TYPE_OPTIONS = [
    ['article', '技术文章'],
    ['solution', '算法题解'],
    ['note', '学习笔记'],
    ['project', '项目记录'],
    ['essay', '思考随笔'],
  ];
  const LANGUAGE_OPTIONS = ['text', 'cpp', 'javascript', 'python', 'java', 'csharp', 'rust'];
  const adapter = window.KnowledgeEditorAdapter;
  const repository = window.KnowledgeRepository;
  const markdownRenderer = window.KnowledgeMarkdown;
  let activeSession = null;

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }

  function iconButton(label, glyph, action, lowFrequency) {
    const item = element('button', 'knowledge-writer-tool', glyph);
    item.type = 'button';
    item.dataset.editorAction = action;
    item.title = label;
    item.setAttribute('aria-label', label);
    if (lowFrequency) item.classList.add('is-low-frequency');
    return item;
  }

  function currentToken() {
    return window.authManager && window.authManager.state
      ? window.authManager.state.token
      : null;
  }

  async function render(container, options) {
    destroy();
    if (!adapter || !repository || !markdownRenderer) {
      container.replaceChildren(element('p', 'knowledge-writer-error', '编辑器模块加载失败。'));
      return;
    }

    const settings = options || {};
    const session = createSession(container, settings);
    activeSession = session;
    await session.initialize();
  }

  function createSession(container, options) {
    const tempId = crypto.randomUUID();
    const state = {
      post: null,
      postId: Number(options.postId) || null,
      version: null,
      tempId,
      editor: null,
      dirty: false,
      localSaved: false,
      saveTimer: null,
      slashRange: null,
      slashIndex: 0,
      destroyed: false,
      settingsOpen: false,
    };

    const page = element('section', 'knowledge-writer-page');
    const topbar = element('header', 'knowledge-writer-topbar');
    const primaryBar = element('div', 'knowledge-writer-primary-bar');
    const backButton = iconButton('返回知识站', '←', 'back');
    const mode = element('strong', 'knowledge-writer-mode', state.postId ? '编辑文章' : '新文章');
    const topStatus = element('span', 'knowledge-writer-top-status', '未保存');
    const author = element(
      'span',
      'knowledge-writer-author',
      window.authManager?.getCurrentUser?.().username || 'Lee Ethan'
    );
    const panelToggle = iconButton('文章设置', '☰', 'toggle-panel');
    primaryBar.append(backButton, mode, topStatus, author, panelToggle);

    const toolbar = element('div', 'knowledge-writer-toolbar');
    const toolbarMain = element('div', 'knowledge-writer-toolbar-scroll');
    const tools = [
      ['撤销', '↶', 'undo'],
      ['重做', '↷', 'redo'],
      ['清除格式', 'Tx', 'clear'],
      ['正文', 'P', 'paragraph'],
      ['一级标题', 'H1', 'h1'],
      ['二级标题', 'H2', 'h2'],
      ['三级标题', 'H3', 'h3'],
      ['加粗', 'B', 'bold'],
      ['斜体', 'I', 'italic'],
      ['删除线', 'S', 'strike'],
      ['行内代码', '</>', 'code'],
      ['无序列表', '•', 'bullet'],
      ['有序列表', '1.', 'ordered'],
      ['任务列表', '☑', 'task'],
      ['引用', '❝', 'quote'],
      ['分割线', '―', 'hr', true],
      ['代码块', '{ }', 'code-block', true],
      ['链接', '🔗', 'link', true],
      ['图片', '▧', 'image', true],
      ['表格', '▦', 'table', true],
      ['提示块', '!', 'callout', true],
    ];
    tools.forEach(function (tool) {
      toolbarMain.appendChild(iconButton(tool[0], tool[1], tool[2], tool[3]));
    });
    const languageSelect = document.createElement('select');
    languageSelect.className = 'knowledge-writer-language';
    languageSelect.title = '代码块语言';
    languageSelect.setAttribute('aria-label', '代码块语言');
    LANGUAGE_OPTIONS.forEach(function (language) {
      languageSelect.appendChild(new Option(language, language));
    });
    const moreButton = iconButton('更多格式', '•••', 'more');
    toolbar.append(toolbarMain, languageSelect, moreButton);
    topbar.append(primaryBar, toolbar);

    const body = element('div', 'knowledge-writer-workspace');
    const canvas = element('main', 'knowledge-writer-canvas');
    const paper = element('article', 'knowledge-writer-paper');
    const recovery = buildRecoveryBanner();
    recovery.hidden = true;
    const titleWrap = element('div', 'knowledge-writer-title-wrap');
    const titleInput = document.createElement('input');
    titleInput.className = 'knowledge-writer-title';
    titleInput.type = 'text';
    titleInput.maxLength = 100;
    titleInput.placeholder = '请输入标题';
    titleInput.setAttribute('aria-label', '文章标题');
    const titleCount = element('span', 'knowledge-writer-title-count', '0 / 100');
    const titleError = element('span', 'knowledge-writer-title-error');
    titleWrap.append(titleInput, titleCount, titleError);
    const editorHost = element('div', 'knowledge-writer-editor-host');
    const bubble = buildBubbleMenu();
    bubble.style.visibility = 'hidden';
    bubble.style.opacity = '0';
    const slashMenu = element('div', 'knowledge-writer-slash-menu');
    slashMenu.hidden = true;
    slashMenu.setAttribute('role', 'listbox');
    const linkPopover = buildLinkPopover();
    linkPopover.hidden = true;
    const notice = element('p', 'knowledge-writer-notice');
    notice.hidden = true;
    paper.append(recovery, titleWrap, editorHost, bubble, slashMenu, linkPopover, notice);
    canvas.appendChild(paper);

    const sidePanel = buildSidePanel();
    body.append(canvas, sidePanel.root);

    const bottom = element('footer', 'knowledge-writer-bottom');
    const bottomLeft = element('div');
    const settingButton = iconButton('打开发布设置', '⚙', 'toggle-panel-bottom');
    const wordCount = element('span', '', '0 字');
    const readingTime = element('span', '', '约 1 分钟');
    const editMode = element('span', '', '富文本模式');
    bottomLeft.append(settingButton, wordCount, readingTime, editMode);
    const bottomRight = element('div');
    const saveStatus = element('span', 'knowledge-writer-save-status', '未保存');
    const savedAt = element('time', '', '尚未保存');
    const saveDraftButton = element('button', 'knowledge-writer-secondary', '保存草稿');
    saveDraftButton.type = 'button';
    const previewButton = element('button', 'knowledge-writer-secondary', '预览');
    previewButton.type = 'button';
    const publishButton = element('button', 'knowledge-writer-publish', '发布');
    publishButton.type = 'button';
    bottomRight.append(saveStatus, savedAt, saveDraftButton, previewButton, publishButton);
    bottom.append(bottomLeft, bottomRight);

    const previewOverlay = buildPreviewOverlay();
    page.append(topbar, body, bottom, previewOverlay.root);
    container.replaceChildren(page);

    const commandButtons = Array.from(page.querySelectorAll('[data-editor-action]'));
    const slashItems = createSlashItems();
    let noticeTimer = null;

    function localKey() {
      return DRAFT_PREFIX + (state.postId ? 'post:' + state.postId : 'new');
    }

    async function initialize() {
      setSaveState('正在加载……');
      let initialMarkdown = '';
      if (state.postId) {
        try {
          state.post = await repository.getAdminPost(state.postId, { token: currentToken() });
          state.version = state.post.version;
          initialMarkdown = state.post.contentMarkdown || '';
          titleInput.value = state.post.title || '';
          applyPostSettings(state.post);
          mode.textContent = '编辑文章';
        } catch (error) {
          setSaveState('加载失败', true);
          showNotice(error.message || '文章加载失败。', true);
          return;
        }
      }
      state.editor = adapter.create({
        element: editorHost,
        markdown: initialMarkdown,
        bubbleElement: bubble,
        placeholder: '请输入正文',
        onUpdate: handleDocumentChange,
        onSelectionUpdate: updateEditorUi,
        onTransaction: updateEditorUi,
        handleMenuKey: handleEditorMenuKey,
        onEscape: closeTransientMenus,
      });
      titleCount.textContent = titleInput.value.length + ' / 100';
      updateMetrics();
      updateToc();
      updateEditorUi();
      checkLocalDraft();
      setSaveState('已就绪');
    }

    function applyPostSettings(post) {
      setField('type', post.type || 'article');
      setField('category', post.category || '');
      setField('tags', (post.tags || []).map(function (tag) { return tag.name; }).join(', '));
      setField('summary', post.summary || '');
      setField('slug', post.slug || '');
      setField('coverUrl', post.coverUrl || '');
      setField('sourceUrl', post.sourceUrl || '');
      setField('status', post.status || 'draft');
      setField('isPinned', Boolean(post.isPinned));
      setField('isFeatured', Boolean(post.isFeatured));
      const solution = post.solution || {};
      setField('solutionPlatform', solution.platform || '');
      setField('solutionProblemId', solution.problemId || '');
      setField('solutionProblemTitle', solution.problemTitle || '');
      setField('solutionProblemUrl', solution.problemUrl || '');
      setField('solutionLanguage', solution.language || '');
      updateSolutionFields();
    }

    function setField(name, value) {
      const input = sidePanel.root.querySelector('[data-writer-field="' + name + '"]');
      if (!input) return;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value == null ? '' : String(value);
    }

    function fieldValue(name) {
      const input = sidePanel.root.querySelector('[data-writer-field="' + name + '"]');
      if (!input) return '';
      return input.type === 'checkbox' ? input.checked : input.value.trim();
    }

    function handleDocumentChange() {
      markDirty();
      updateMetrics();
      updateToc();
      updateSlashMenu();
      updateEditorUi();
    }

    function markDirty() {
      state.dirty = true;
      state.localSaved = false;
      setSaveState('未保存');
      window.clearTimeout(state.saveTimer);
      state.saveTimer = window.setTimeout(saveLocalDraft, AUTO_SAVE_DELAY);
    }

    function saveLocalDraft() {
      if (!state.editor || state.destroyed) return;
      const draft = {
        schemaVersion: 1,
        tempId: state.tempId,
        postId: state.postId,
        title: titleInput.value,
        document: state.editor.getJSON(),
        markdown: adapter.editorDocumentToMarkdown(state.editor),
        settings: collectSettings(),
        lastEditedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(localKey(), JSON.stringify(draft));
        state.dirty = false;
        state.localSaved = true;
        const time = new Date();
        setSaveState('已保存');
        savedAt.dateTime = time.toISOString();
        savedAt.textContent = '本地保存于 ' + formatTime(time);
      } catch (error) {
        setSaveState('保存失败', true);
      }
    }

    function checkLocalDraft() {
      let draft = null;
      try {
        draft = JSON.parse(window.localStorage.getItem(localKey()) || 'null');
      } catch (error) {
        draft = null;
      }
      if (!draft || !draft.document || !draft.lastEditedAt) return;
      recovery.hidden = false;
      recovery.querySelector('[data-recovery-time]').textContent =
        '最后编辑：' + formatTime(new Date(draft.lastEditedAt));
      recovery.querySelector('[data-recovery-restore]').onclick = function () {
        titleInput.value = String(draft.title || '').slice(0, 100);
        state.editor.commands.setContent(draft.document);
        applyDraftSettings(draft.settings || {});
        recovery.hidden = true;
        markDirty();
      };
      recovery.querySelector('[data-recovery-discard]').onclick = function () {
        window.localStorage.removeItem(localKey());
        recovery.hidden = true;
      };
    }

    function applyDraftSettings(values) {
      Object.keys(values || {}).forEach(function (key) { setField(key, values[key]); });
      updateSolutionFields();
    }

    function collectSettings() {
      return {
        type: fieldValue('type') || 'article',
        category: fieldValue('category'),
        tags: fieldValue('tags'),
        summary: fieldValue('summary'),
        slug: fieldValue('slug'),
        coverUrl: fieldValue('coverUrl'),
        sourceUrl: fieldValue('sourceUrl'),
        status: fieldValue('status') || 'draft',
        isPinned: fieldValue('isPinned'),
        isFeatured: fieldValue('isFeatured'),
        solutionPlatform: fieldValue('solutionPlatform'),
        solutionProblemId: fieldValue('solutionProblemId'),
        solutionProblemTitle: fieldValue('solutionProblemTitle'),
        solutionProblemUrl: fieldValue('solutionProblemUrl'),
        solutionLanguage: fieldValue('solutionLanguage'),
      };
    }

    function collectPayload(status) {
      const values = collectSettings();
      const type = values.type;
      const tags = values.tags.split(/[,，]/).map(function (tag) {
        return tag.trim();
      }).filter(Boolean);
      return {
        type,
        title: titleInput.value.trim(),
        slug: values.slug,
        summary: values.summary,
        contentMarkdown: adapter.editorDocumentToMarkdown(state.editor),
        category: values.category,
        tags,
        status: status || values.status,
        isPinned: values.isPinned,
        isFeatured: values.isFeatured,
        coverUrl: values.coverUrl || null,
        sourceUrl: values.sourceUrl || null,
        solutionMeta: type === 'solution' ? {
          platform: values.solutionPlatform || null,
          problemId: values.solutionProblemId || null,
          problemTitle: values.solutionProblemTitle || null,
          problemUrl: values.solutionProblemUrl || null,
          difficulty: null,
          algorithms: [],
          language: values.solutionLanguage || null,
          timeComplexity: null,
          spaceComplexity: null,
          accepted: null,
        } : null,
      };
    }

    function validatePayload(payload, publishing) {
      titleError.textContent = '';
      if (!payload.title) {
        titleError.textContent = '标题不能为空';
        titleInput.focus();
        return false;
      }
      if (payload.title.length > 100) {
        titleError.textContent = '标题不能超过 100 个字符';
        titleInput.focus();
        return false;
      }
      if (!payload.contentMarkdown.trim()) {
        showNotice('正文不能为空。', true);
        state.editor.commands.focus();
        return false;
      }
      if (publishing && payload.type === 'solution') {
        const solution = payload.solutionMeta || {};
        if (!solution.platform || !solution.problemId || !solution.problemTitle) {
          openPanel();
          showNotice('发布题解前请填写平台、题号和题目名称。', true);
          return false;
        }
      }
      return true;
    }

    async function saveToServer(status) {
      if (!state.editor) return;
      const publishing = status === 'published';
      const payload = collectPayload(status);
      if (!validatePayload(payload, publishing)) return;
      const target = publishing ? publishButton : saveDraftButton;
      setButtonsBusy(true);
      setSaveState('正在保存……');
      try {
        let post;
        if (state.postId) {
          post = await repository.updatePost(
            state.postId,
            Object.assign({}, payload, { version: state.version }),
            { token: currentToken() }
          );
        } else {
          post = await repository.createPost(payload, { token: currentToken() });
        }
        const oldKey = localKey();
        state.post = post;
        state.postId = post.id;
        state.version = post.version;
        setField('slug', post.slug);
        setField('status', post.status);
        window.localStorage.removeItem(oldKey);
        window.localStorage.removeItem(localKey());
        state.dirty = false;
        state.localSaved = true;
        setSaveState(publishing ? '已发布' : '已保存');
        savedAt.dateTime = new Date().toISOString();
        savedAt.textContent = (publishing ? '发布于 ' : '服务器保存于 ') + formatTime(new Date());
        mode.textContent = '编辑文章';
        target.focus();
      } catch (error) {
        setSaveState('保存失败', true);
        showNotice(error.message || '文章保存失败。', true);
      } finally {
        setButtonsBusy(false);
      }
    }

    function setButtonsBusy(busy) {
      saveDraftButton.disabled = busy;
      publishButton.disabled = busy;
      previewButton.disabled = busy;
    }

    function setSaveState(label, error) {
      saveStatus.textContent = label;
      topStatus.textContent = label;
      saveStatus.classList.toggle('is-error', Boolean(error));
      topStatus.classList.toggle('is-error', Boolean(error));
    }

    function updateMetrics() {
      if (!state.editor) return;
      const markdown = adapter.editorDocumentToMarkdown(state.editor);
      const text = state.editor.getText({ blockSeparator: '\n' });
      const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
      const words = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
      const count = chinese + words;
      wordCount.textContent = count + ' 字';
      readingTime.textContent = '约 ' + Math.max(1, Math.ceil(count / 400)) + ' 分钟';
      editMode.title = markdown.length + ' Markdown 字符';
    }

    function updateToc() {
      if (!state.editor) return;
      sidePanel.tocList.replaceChildren();
      const headings = [];
      state.editor.state.doc.descendants(function (node, pos) {
        if (node.type.name === 'heading' && node.attrs.level <= 3) {
          headings.push({ level: node.attrs.level, text: node.textContent || '未命名标题', pos });
        }
      });
      if (!headings.length) {
        sidePanel.tocList.appendChild(element('p', 'knowledge-writer-toc-empty', '正文中还没有标题。'));
        return;
      }
      headings.forEach(function (heading) {
        const item = element('button', '', heading.text);
        item.type = 'button';
        item.dataset.level = String(heading.level);
        item.addEventListener('click', function () {
          state.editor.chain().focus(heading.pos + 1).scrollIntoView().run();
          if (window.innerWidth <= 768) closePanel();
        });
        sidePanel.tocList.appendChild(item);
      });
    }

    function updateEditorUi() {
      if (!state.editor) return;
      const editor = state.editor;
      commandButtons.forEach(function (item) {
        const action = item.dataset.editorAction;
        const active = isActionActive(editor, action);
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
        if (['undo', 'redo'].includes(action)) {
          item.disabled = action === 'undo'
            ? !editor.can().chain().focus().undo().run()
            : !editor.can().chain().focus().redo().run();
        }
      });
      const language = editor.getAttributes('codeBlock').language;
      if (language && LANGUAGE_OPTIONS.includes(language)) languageSelect.value = language;
      updateSlashMenu();
    }

    function runAction(action) {
      const editor = state.editor;
      if (!editor) return;
      const chain = editor.chain().focus();
      const commands = {
        undo: function () { return chain.undo().run(); },
        redo: function () { return chain.redo().run(); },
        clear: function () { return chain.unsetAllMarks().clearNodes().run(); },
        paragraph: function () { return chain.setParagraph().run(); },
        h1: function () { return chain.toggleHeading({ level: 1 }).run(); },
        h2: function () { return chain.toggleHeading({ level: 2 }).run(); },
        h3: function () { return chain.toggleHeading({ level: 3 }).run(); },
        bold: function () { return chain.toggleBold().run(); },
        italic: function () { return chain.toggleItalic().run(); },
        strike: function () { return chain.toggleStrike().run(); },
        code: function () { return chain.toggleCode().run(); },
        bullet: function () { return chain.toggleBulletList().run(); },
        ordered: function () { return chain.toggleOrderedList().run(); },
        task: function () { return chain.toggleTaskList().run(); },
        quote: function () { return chain.toggleBlockquote().run(); },
        hr: function () { return chain.setHorizontalRule().run(); },
        'code-block': function () {
          return chain.toggleCodeBlock({ language: languageSelect.value }).run();
        },
        table: function () {
          return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        },
      };
      if (commands[action]) commands[action]();
      else if (action === 'link') openLinkPopover();
      else if (action === 'image') {
        showNotice('图片上传功能将在下一阶段接入。');
      } else if (action === 'callout') {
        showNotice('提示块将在下一阶段接入。');
      } else if (action === 'more') {
        toolbar.classList.toggle('show-all-tools');
      } else if (action === 'back') {
        saveLocalDraft();
        options.onBack?.();
      } else if (action === 'toggle-panel' || action === 'toggle-panel-bottom') {
        state.settingsOpen ? closePanel() : openPanel();
      }
      updateEditorUi();
    }

    function openLinkPopover() {
      const attrs = state.editor.getAttributes('link');
      linkPopover.hidden = false;
      linkPopover.querySelector('[data-link-url]').value = attrs.href || '';
      linkPopover.querySelector('[data-link-blank]').checked = attrs.target !== '_self';
      linkPopover.querySelector('[data-link-url]').focus();
    }

    function applyLink() {
      const input = linkPopover.querySelector('[data-link-url]');
      const href = input.value.trim();
      if (!adapter.safeLink(href)) {
        linkPopover.querySelector('[data-link-error]').textContent =
          '仅允许 http、https 或 mailto 链接';
        return;
      }
      const blank = linkPopover.querySelector('[data-link-blank]').checked;
      state.editor.chain().focus().extendMarkRange('link').setLink({
        href,
        target: blank ? '_blank' : '_self',
        rel: blank ? 'noopener noreferrer' : null,
      }).run();
      linkPopover.hidden = true;
      markDirty();
    }

    function removeLink() {
      state.editor.chain().focus().extendMarkRange('link').unsetLink().run();
      linkPopover.hidden = true;
      markDirty();
    }

    function updateSlashMenu() {
      if (!state.editor || !state.editor.isEditable) return;
      const selection = state.editor.state.selection;
      if (!selection.empty || !selection.$from.parent.isTextblock) {
        closeSlashMenu();
        return;
      }
      const before = selection.$from.parent.textBetween(
        0,
        selection.$from.parentOffset,
        '\n',
        '\n'
      );
      const match = /(?:^|\s)\/([\p{Letter}\p{Number}\u4e00-\u9fff-]*)$/u.exec(before);
      if (!match) {
        closeSlashMenu();
        return;
      }
      const query = match[1].toLowerCase();
      const filtered = slashItems.filter(function (item) {
        return (item.label + ' ' + item.keywords).toLowerCase().includes(query);
      });
      if (!filtered.length) {
        closeSlashMenu();
        return;
      }
      state.slashRange = {
        from: selection.from - query.length - 1,
        to: selection.from,
      };
      state.slashIndex = Math.min(state.slashIndex, filtered.length - 1);
      slashMenu.replaceChildren();
      filtered.forEach(function (item, index) {
        const entry = element('button', index === state.slashIndex ? 'is-active' : '');
        entry.type = 'button';
        entry.setAttribute('role', 'option');
        entry.append(element('strong', '', item.label), element('small', '', item.description));
        entry.addEventListener('mousedown', function (event) {
          event.preventDefault();
          executeSlashItem(item);
        });
        slashMenu.appendChild(entry);
      });
      const coords = state.editor.view.coordsAtPos(selection.from);
      const paperBox = paper.getBoundingClientRect();
      slashMenu.style.left = Math.max(12, coords.left - paperBox.left) + 'px';
      slashMenu.style.top = coords.bottom - paperBox.top + 8 + 'px';
      slashMenu.hidden = false;
      slashMenu.dataset.filtered = filtered.map(function (item) { return item.action; }).join(',');
    }

    function executeSlashItem(item) {
      if (!state.slashRange) return;
      state.editor.chain().focus().deleteRange(state.slashRange).run();
      closeSlashMenu();
      runAction(item.action);
    }

    function handleEditorMenuKey(event) {
      if (slashMenu.hidden) return false;
      const actions = (slashMenu.dataset.filtered || '').split(',').filter(Boolean);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.slashIndex = (state.slashIndex + 1) % actions.length;
        updateSlashMenu();
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.slashIndex = (state.slashIndex - 1 + actions.length) % actions.length;
        updateSlashMenu();
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = slashItems.find(function (entry) {
          return entry.action === actions[state.slashIndex];
        });
        if (item) executeSlashItem(item);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSlashMenu();
        return true;
      }
      return false;
    }

    function closeSlashMenu() {
      slashMenu.hidden = true;
      slashMenu.replaceChildren();
      state.slashRange = null;
      state.slashIndex = 0;
    }

    function closeTransientMenus() {
      linkPopover.hidden = true;
      closeSlashMenu();
      if (state.editor) {
        state.editor.view.dispatch(
          state.editor.state.tr.setMeta('bubbleMenu', 'hide')
        );
      }
    }

    function showNotice(message, error) {
      window.clearTimeout(noticeTimer);
      notice.hidden = false;
      notice.textContent = message;
      notice.classList.toggle('is-error', Boolean(error));
      noticeTimer = window.setTimeout(function () { notice.hidden = true; }, 4000);
    }

    function openPanel() {
      state.settingsOpen = true;
      sidePanel.root.classList.add('is-open');
      page.classList.add('has-open-panel');
      panelToggle.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
      state.settingsOpen = false;
      sidePanel.root.classList.remove('is-open');
      page.classList.remove('has-open-panel');
      panelToggle.setAttribute('aria-expanded', 'false');
    }

    function updateSolutionFields() {
      const visible = fieldValue('type') === 'solution';
      sidePanel.solutionFields.hidden = !visible;
    }

    function openPreview() {
      const payload = collectPayload();
      if (!validatePayload(payload, false)) return;
      previewOverlay.title.textContent = payload.title;
      previewOverlay.summary.textContent = payload.summary || '';
      previewOverlay.meta.textContent = [
        TYPE_OPTIONS.find(function (entry) { return entry[0] === payload.type; })?.[1],
        payload.category,
        payload.tags.join(' · '),
      ].filter(Boolean).join(' / ');
      previewOverlay.solution.replaceChildren();
      previewOverlay.solution.hidden = payload.type !== 'solution';
      if (payload.type === 'solution') {
        const solution = payload.solutionMeta || {};
        [
          ['平台', solution.platform],
          ['题号', solution.problemId],
          ['题目', solution.problemTitle],
          ['语言', solution.language],
        ].forEach(function (entry) {
          if (!entry[1]) return;
          const item = element('span');
          item.append(element('strong', '', entry[0] + '：'), document.createTextNode(entry[1]));
          previewOverlay.solution.appendChild(item);
        });
      }
      markdownRenderer.render(payload.contentMarkdown, previewOverlay.body);
      previewOverlay.root.hidden = false;
      previewOverlay.close.focus();
    }

    function closePreview() {
      previewOverlay.root.hidden = true;
      previewButton.focus();
    }

    function keydown(event) {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        if (event.key === 'Escape' && !previewOverlay.root.hidden) closePreview();
        return;
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        window.clearTimeout(state.saveTimer);
        saveLocalDraft();
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openLinkPopover();
      }
    }

    function beforeUnload(event) {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }

    toolbar.addEventListener('click', function (event) {
      const target = event.target.closest('[data-editor-action]');
      if (target && !target.disabled) runAction(target.dataset.editorAction);
    });
    primaryBar.addEventListener('click', function (event) {
      const target = event.target.closest('[data-editor-action]');
      if (target && !target.disabled) runAction(target.dataset.editorAction);
    });
    bottom.addEventListener('click', function (event) {
      const target = event.target.closest('[data-editor-action]');
      if (target) runAction(target.dataset.editorAction);
    });
    titleInput.addEventListener('input', function () {
      titleCount.textContent = titleInput.value.length + ' / 100';
      titleError.textContent = '';
      markDirty();
    });
    titleInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.editor?.commands.focus('start');
      }
    });
    languageSelect.addEventListener('change', function () {
      if (!state.editor) return;
      state.editor.chain().focus().setCodeBlock({ language: languageSelect.value }).run();
      markDirty();
    });
    sidePanel.root.addEventListener('input', function (event) {
      if (!event.target.matches('[data-writer-field]')) return;
      if (event.target.dataset.writerField === 'type') updateSolutionFields();
      markDirty();
    });
    sidePanel.root.addEventListener('change', function (event) {
      if (event.target.matches('[data-writer-field]')) markDirty();
    });
    sidePanel.tabBar.addEventListener('click', function (event) {
      const tab = event.target.closest('[data-writer-tab]');
      if (!tab) return;
      sidePanel.selectTab(tab.dataset.writerTab);
    });
    linkPopover.querySelector('[data-link-apply]').addEventListener('click', applyLink);
    linkPopover.querySelector('[data-link-remove]').addEventListener('click', removeLink);
    linkPopover.querySelector('[data-link-cancel]').addEventListener('click', function () {
      linkPopover.hidden = true;
      state.editor?.commands.focus();
    });
    saveDraftButton.addEventListener('click', function () { saveToServer('draft'); });
    publishButton.addEventListener('click', function () { saveToServer('published'); });
    previewButton.addEventListener('click', openPreview);
    previewOverlay.close.addEventListener('click', closePreview);
    previewOverlay.root.addEventListener('click', function (event) {
      if (event.target === previewOverlay.root) closePreview();
    });
    window.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', beforeUnload);

    function destroySession() {
      if (state.destroyed) return;
      if (state.dirty && state.editor) saveLocalDraft();
      state.destroyed = true;
      window.clearTimeout(state.saveTimer);
      window.clearTimeout(noticeTimer);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('beforeunload', beforeUnload);
      state.editor?.destroy();
      state.editor = null;
    }

    return { initialize, destroy: destroySession, state };
  }

  function buildRecoveryBanner() {
    const banner = element('aside', 'knowledge-writer-recovery');
    const copy = element('div');
    copy.append(
      element('strong', '', '检测到未保存的本地草稿。'),
      element('small', '', '')
    );
    copy.lastChild.dataset.recoveryTime = '';
    const actions = element('div');
    const restore = element('button', '', '恢复草稿');
    restore.type = 'button';
    restore.dataset.recoveryRestore = '';
    const discard = element('button', '', '放弃草稿');
    discard.type = 'button';
    discard.dataset.recoveryDiscard = '';
    actions.append(restore, discard);
    banner.append(copy, actions);
    return banner;
  }

  function buildBubbleMenu() {
    const menu = element('div', 'knowledge-writer-bubble');
    [
      ['加粗', 'B', 'bold'],
      ['斜体', 'I', 'italic'],
      ['删除线', 'S', 'strike'],
      ['行内代码', '</>', 'code'],
      ['链接', '🔗', 'link'],
      ['正文', 'P', 'paragraph'],
      ['二级标题', 'H2', 'h2'],
    ].forEach(function (tool) {
      menu.appendChild(iconButton(tool[0], tool[1], tool[2]));
    });
    menu.addEventListener('click', function (event) {
      const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
      const page = menu.closest('.knowledge-writer-page');
      page?.querySelector('.knowledge-writer-toolbar [data-editor-action="' + action + '"]')?.click();
    });
    return menu;
  }

  function buildLinkPopover() {
    const popover = element('div', 'knowledge-writer-link-popover');
    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://example.com';
    input.dataset.linkUrl = '';
    const blankLabel = element('label');
    const blank = document.createElement('input');
    blank.type = 'checkbox';
    blank.checked = true;
    blank.dataset.linkBlank = '';
    blankLabel.append(blank, document.createTextNode(' 在新标签页打开'));
    const error = element('small', 'knowledge-writer-link-error');
    error.dataset.linkError = '';
    const actions = element('div');
    [
      ['应用', 'linkApply'],
      ['取消链接', 'linkRemove'],
      ['取消', 'linkCancel'],
    ].forEach(function (entry) {
      const item = element('button', '', entry[0]);
      item.type = 'button';
      item.dataset[entry[1]] = '';
      actions.appendChild(item);
    });
    popover.append(input, blankLabel, error, actions);
    return popover;
  }

  function buildSidePanel() {
    const root = element('aside', 'knowledge-writer-side');
    const tabBar = element('div', 'knowledge-writer-side-tabs');
    const settingsTab = element('button', 'is-active', '文章设置');
    settingsTab.type = 'button';
    settingsTab.dataset.writerTab = 'settings';
    const tocTab = element('button', '', '文章目录');
    tocTab.type = 'button';
    tocTab.dataset.writerTab = 'toc';
    tabBar.append(settingsTab, tocTab);
    const settingsPanel = element('div', 'knowledge-writer-settings');
    settingsPanel.dataset.writerPanel = 'settings';
    const type = selectField('内容类型', 'type', TYPE_OPTIONS);
    const category = inputField('分类', 'category', '例如：计算机技术');
    const tags = inputField('标签', 'tags', '多个标签用逗号分隔');
    const summary = textareaField('摘要', 'summary', '用于文章列表和分享摘要');
    const slug = inputField('Slug', 'slug', '留空时根据标题生成');
    const cover = inputField('封面 URL', 'coverUrl', 'https://');
    const source = inputField('来源链接', 'sourceUrl', 'https://');
    const status = selectField('发布状态', 'status', [
      ['draft', '草稿'],
      ['published', '已发布'],
    ]);
    const pinned = checkboxField('置顶', 'isPinned');
    const featured = checkboxField('精选', 'isFeatured');
    const solutionFields = element('fieldset', 'knowledge-writer-solution-fields');
    solutionFields.append(
      element('legend', '', '题解信息'),
      inputField('平台', 'solutionPlatform', '例如：Codeforces'),
      inputField('题号', 'solutionProblemId', '例如：1A'),
      inputField('题目名称', 'solutionProblemTitle', ''),
      inputField('题目链接', 'solutionProblemUrl', 'https://'),
      inputField('语言', 'solutionLanguage', '例如：C++')
    );
    solutionFields.hidden = true;
    settingsPanel.append(
      type, category, tags, summary, slug, cover,
      pinned, featured, source, status, solutionFields
    );
    const tocPanel = element('div', 'knowledge-writer-toc-panel');
    tocPanel.dataset.writerPanel = 'toc';
    tocPanel.hidden = true;
    const tocList = element('nav', 'knowledge-writer-toc-list');
    tocList.setAttribute('aria-label', '文章目录');
    tocPanel.appendChild(tocList);
    root.append(tabBar, settingsPanel, tocPanel);

    function selectTab(name) {
      root.querySelectorAll('[data-writer-tab]').forEach(function (tab) {
        tab.classList.toggle('is-active', tab.dataset.writerTab === name);
      });
      root.querySelectorAll('[data-writer-panel]').forEach(function (panel) {
        panel.hidden = panel.dataset.writerPanel !== name;
      });
    }
    return { root, tabBar, settingsPanel, tocPanel, tocList, solutionFields, selectTab };
  }

  function inputField(labelText, name, placeholder) {
    const label = element('label', 'knowledge-writer-field');
    label.appendChild(element('span', '', labelText));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.dataset.writerField = name;
    label.appendChild(input);
    return label;
  }

  function textareaField(labelText, name, placeholder) {
    const label = element('label', 'knowledge-writer-field');
    label.appendChild(element('span', '', labelText));
    const input = document.createElement('textarea');
    input.rows = 4;
    input.placeholder = placeholder || '';
    input.dataset.writerField = name;
    label.appendChild(input);
    return label;
  }

  function selectField(labelText, name, options) {
    const label = element('label', 'knowledge-writer-field');
    label.appendChild(element('span', '', labelText));
    const select = document.createElement('select');
    select.dataset.writerField = name;
    options.forEach(function (entry) {
      select.appendChild(new Option(entry[1], entry[0]));
    });
    label.appendChild(select);
    return label;
  }

  function checkboxField(labelText, name) {
    const label = element('label', 'knowledge-writer-checkbox');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.writerField = name;
    label.append(input, document.createTextNode(labelText));
    return label;
  }

  function buildPreviewOverlay() {
    const root = element('div', 'knowledge-writer-preview-overlay');
    root.hidden = true;
    const dialog = element('section', 'knowledge-writer-preview-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '文章预览');
    const header = element('header');
    header.appendChild(element('strong', '', '文章预览'));
    const close = element('button', '', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭预览');
    header.appendChild(close);
    const article = element('article', 'knowledge-detail-body');
    const title = element('h1');
    const meta = element('p', 'knowledge-writer-preview-meta');
    const summary = element('p', 'knowledge-writer-preview-summary');
    const solution = element('section', 'knowledge-writer-preview-solution');
    solution.hidden = true;
    const body = element('div');
    article.append(title, meta, summary, solution, body);
    dialog.append(header, article);
    root.appendChild(dialog);
    return { root, close, title, meta, summary, solution, body };
  }

  function createSlashItems() {
    return [
      ['正文', 'paragraph', '普通文字 段落'],
      ['一级标题', 'h1', '标题 H1'],
      ['二级标题', 'h2', '标题 H2'],
      ['三级标题', 'h3', '标题 H3'],
      ['无序列表', 'bullet', '项目符号 列表'],
      ['有序列表', 'ordered', '编号 列表'],
      ['任务列表', 'task', '待办 清单'],
      ['引用', 'quote', '引用 块'],
      ['代码块', 'code-block', '程序 代码'],
      ['分割线', 'hr', '分隔'],
      ['表格', 'table', '表格'],
      ['图片', 'image', '图片 上传'],
    ].map(function (entry) {
      return {
        label: entry[0],
        action: entry[1],
        keywords: entry[2],
        description: entry[2].split(' ')[0],
      };
    });
  }

  function isActionActive(editor, action) {
    const map = {
      paragraph: ['paragraph'],
      h1: ['heading', { level: 1 }],
      h2: ['heading', { level: 2 }],
      h3: ['heading', { level: 3 }],
      bold: ['bold'],
      italic: ['italic'],
      strike: ['strike'],
      code: ['code'],
      bullet: ['bulletList'],
      ordered: ['orderedList'],
      task: ['taskList'],
      quote: ['blockquote'],
      'code-block': ['codeBlock'],
      link: ['link'],
    };
    return map[action] ? editor.isActive.apply(editor, map[action]) : false;
  }

  function formatTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '未知时间';
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function destroy() {
    if (!activeSession) return;
    activeSession.destroy();
    activeSession = null;
  }

  window.KnowledgeWriter = { render, destroy };
}());
