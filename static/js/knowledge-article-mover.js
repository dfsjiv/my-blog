(function () {
  const PREVIEW_PATH = '/api/knowledge/admin/article-mover/preview';
  const IMPORT_PATH = '/api/knowledge/admin/article-mover/import';
  const TYPES = ['article', 'solution', 'note', 'project', 'essay'];

  function text(en, zh) {
    const shell = document.getElementById('elegantShell');
    return shell && shell.dataset.language === 'zh' ? zh : en;
  }

  function node(tag, className, content) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = content;
    return item;
  }

  function button(label, className) {
    const item = node('button', className, label);
    item.type = 'button';
    return item;
  }

  async function apiRequest(path, body) {
    const auth = window.authManager;
    const token = auth && auth.state ? auth.state.token : null;
    if (!token) throw new Error(text('Author session is unavailable.', '作者登录状态不可用。'));
    let response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(text('Unable to reach the server.', '无法连接服务器。'));
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(text('The server returned invalid data.', '服务器返回了无效数据。'));
    }
    if (!response.ok || !payload || payload.success !== true) {
      throw new Error(
        payload && payload.error && payload.error.message
          ? payload.error.message
          : text('The request failed.', '请求失败。')
      );
    }
    return payload.data;
  }

  function render(container) {
    const state = { items: [], busy: false };
    const layout = node('section', 'knowledge-mover');
    const status = node('p', 'knowledge-mover-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const inputSection = node('section', 'knowledge-mover-step');
    inputSection.append(
      stepHeading('01', text('Paste article links', '粘贴文章链接')),
      node(
        'p',
        'knowledge-mover-help',
        text(
          'One public NowCoder solution or Zhihu article URL per line, up to 20.',
          '每行一个公开的牛客题解或知乎文章 URL，一次最多 20 条。'
        )
      )
    );
    const textarea = node('textarea', 'knowledge-mover-urls');
    textarea.rows = 7;
    textarea.placeholder = [
      'https://www.nowcoder.com/discuss/...',
      'https://zhuanlan.zhihu.com/p/...',
    ].join('\n');
    const scanButton = button(text('Scan and preview', '扫描并预览'), 'knowledge-mover-primary');
    const platformLine = node('div', 'knowledge-mover-platforms');
    platformLine.append(
      platformBadge('牛', text('NowCoder solutions: supported', '牛客题解：支持')),
      platformBadge('知', text('Zhihu articles: supported', '知乎文章：支持'))
    );
    inputSection.append(textarea, platformLine, scanButton);

    const resultSection = node('section', 'knowledge-mover-step');
    resultSection.hidden = true;
    resultSection.appendChild(stepHeading('02', text('Review scan results', '扫描和预览')));
    const summary = node('div', 'knowledge-mover-summary');
    const list = node('div', 'knowledge-mover-list');
    const importBar = node('div', 'knowledge-mover-import-bar');
    const importButton = button(text('Import selected drafts', '导入选中的草稿'), 'knowledge-mover-primary');
    importBar.append(
      node(
        'span',
        '',
        text(
          'Import never publishes automatically.',
          '导入后只创建草稿，不会自动公开。'
        )
      ),
      importButton
    );
    resultSection.append(summary, list, importBar);
    layout.append(inputSection, resultSection, status);
    container.appendChild(layout);

    scanButton.addEventListener('click', async function () {
      if (state.busy) return;
      const urls = textarea.value.split(/\r?\n/).map(function (value) {
        return value.trim();
      }).filter(Boolean);
      if (!urls.length) {
        setStatus(status, text('Paste at least one URL.', '请至少粘贴一个 URL。'), true);
        return;
      }
      setBusy(true, text('Scanning public pages…', '正在读取公开文章页面……'));
      try {
        const data = await apiRequest(PREVIEW_PATH, { urls });
        state.items = Array.isArray(data.items) ? data.items : [];
        renderResults();
        resultSection.hidden = false;
        setStatus(
          status,
          text(
            `Scanned ${state.items.length} link(s). Review before importing.`,
            `已扫描 ${state.items.length} 条链接，请检查后再导入。`
          ),
          false
        );
      } catch (error) {
        setStatus(status, error.message, true);
      } finally {
        setBusy(false);
      }
    });

    importButton.addEventListener('click', async function () {
      if (state.busy) return;
      const selected = collectSelected(list);
      if (!selected.length) {
        setStatus(status, text('Select at least one article.', '请至少选择一篇文章。'), true);
        return;
      }
      setBusy(true, text('Importing drafts…', '正在导入草稿……'));
      try {
        const data = await apiRequest(IMPORT_PATH, { items: selected });
        const imported = data.summary ? data.summary.imported : 0;
        setStatus(
          status,
          text(
            `Imported ${imported} draft(s). Existing articles were not overwritten.`,
            `已导入 ${imported} 篇草稿，已有文章未被覆盖。`
          ),
          false
        );
        await scanButton.click();
      } catch (error) {
        setStatus(status, error.message, true);
      } finally {
        setBusy(false);
      }
    });

    function setBusy(value, message) {
      state.busy = value;
      scanButton.disabled = value;
      importButton.disabled = value;
      textarea.disabled = value;
      if (message) setStatus(status, message, false);
    }

    function renderResults() {
      list.replaceChildren();
      const okCount = state.items.filter(function (item) { return item.ok; }).length;
      const failedCount = state.items.length - okCount;
      summary.textContent = text(
        `${okCount} parsed · ${failedCount} failed`,
        `成功解析 ${okCount} 篇 · 失败 ${failedCount} 篇`
      );
      state.items.forEach(function (item, index) {
        list.appendChild(item.ok ? articleCard(item, index) : errorCard(item));
      });
    }
  }

  function articleCard(item, index) {
    const card = node('article', 'knowledge-mover-card');
    card.dataset.moverIndex = String(index);
    const header = node('header', 'knowledge-mover-card-header');
    const choose = document.createElement('input');
    choose.type = 'checkbox';
    choose.checked = !item.alreadyImported && !item.remoteUpdated;
    choose.disabled = item.alreadyImported || item.remoteUpdated;
    choose.dataset.moverSelected = '';
    const titleWrap = node('div');
    titleWrap.append(
      node('small', '', item.platformLabel),
      node('strong', '', item.title)
    );
    const badge = node(
      'span',
      'knowledge-mover-state',
      item.remoteUpdated
        ? text('Remote updated', '远程已有更新')
        : item.alreadyImported
          ? text('Imported', '已导入')
          : text('Ready', '可导入')
    );
    header.append(choose, titleWrap, badge);

    const source = document.createElement('a');
    source.href = item.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = item.sourceUrl;
    source.className = 'knowledge-mover-source';

    const meta = node('div', 'knowledge-mover-meta');
    [
      [text('Format', '格式'), item.rawContentFormat],
      [text('Words', '字数'), String(item.wordCount || 0)],
      [text('Images', '图片'), String(item.imageCount || 0)],
      [text('Code blocks', '代码块'), String(item.codeBlockCount || 0)],
      [text('Published', '原发布时间'), item.originalPublishedTime || item.publishedAtUtc || '—'],
      [text('Updated', '原更新时间'), item.originalUpdatedTime || item.updatedAtUtc || '—'],
    ].forEach(function (entry) {
      const value = node('span');
      value.append(node('small', '', entry[0]), node('strong', '', entry[1]));
      meta.appendChild(value);
    });

    const fields = node('div', 'knowledge-mover-fields');
    fields.append(
      field(text('Title', '标题'), 'title', item.title),
      field('Slug', 'slug', item.slug),
      selectField(text('Type', '类型'), 'type', TYPES, item.type),
      field(text('Summary', '摘要'), 'summary', item.summary || ''),
      field(text('Category', '分类'), 'category', item.category || ''),
      field(text('Tags (comma separated)', '标签（逗号分隔）'), 'tags', (item.tags || []).join(', '))
    );
    if (item.slugConflict) {
      fields.appendChild(
        node(
          'p',
          'knowledge-mover-warning',
          text(
            `The original slug conflicts; suggested: ${item.suggestedSlug}`,
            `原 Slug 存在冲突，已建议：${item.suggestedSlug}`
          )
        )
      );
    }
    (item.warnings || []).forEach(function (warning) {
      fields.appendChild(node('p', 'knowledge-mover-warning', warning));
    });

    const previewButton = button(text('Preview converted article', '预览转换后的文章'), 'knowledge-mover-secondary');
    const preview = node('div', 'knowledge-mover-preview knowledge-detail-body');
    preview.hidden = true;
    previewButton.addEventListener('click', function () {
      preview.hidden = !preview.hidden;
      if (!preview.hidden && !preview.hasChildNodes()) {
        window.KnowledgeMarkdown.render(item.contentMarkdown || '', preview);
      }
      previewButton.textContent = preview.hidden
        ? text('Preview converted article', '预览转换后的文章')
        : text('Close preview', '收起预览');
    });
    card.append(header, source, meta, fields, previewButton, preview);
    return card;
  }

  function errorCard(item) {
    const card = node('article', 'knowledge-mover-card is-error');
    card.append(
      node('strong', '', text('Unable to parse', '解析失败')),
      node('p', '', item.sourceUrl || ''),
      node('p', 'knowledge-mover-warning', item.message || text('Unknown error', '未知错误'))
    );
    return card;
  }

  function collectSelected(container) {
    return Array.from(container.querySelectorAll('[data-mover-index]')).map(function (card) {
      const selected = card.querySelector('[data-mover-selected]');
      if (!selected || !selected.checked || selected.disabled) return null;
      const value = function (name) {
        const fieldNode = card.querySelector('[data-mover-field="' + name + '"]');
        return fieldNode ? fieldNode.value.trim() : '';
      };
      return {
        selected: true,
        sourceUrl: card.querySelector('.knowledge-mover-source').href,
        title: value('title'),
        slug: value('slug'),
        type: value('type'),
        summary: value('summary'),
        category: value('category'),
        tags: value('tags').split(/[,，]/).map(function (tag) { return tag.trim(); }).filter(Boolean),
      };
    }).filter(Boolean);
  }

  function field(labelText, name, value) {
    const label = node('label');
    label.appendChild(node('span', '', labelText));
    const input = document.createElement(name === 'summary' ? 'textarea' : 'input');
    input.value = value || '';
    input.dataset.moverField = name;
    if (name === 'summary') input.rows = 2;
    label.appendChild(input);
    return label;
  }

  function selectField(labelText, name, values, selected) {
    const label = node('label');
    label.appendChild(node('span', '', labelText));
    const select = document.createElement('select');
    select.dataset.moverField = name;
    values.forEach(function (value) {
      const option = new Option(value, value);
      option.selected = value === selected;
      select.appendChild(option);
    });
    label.appendChild(select);
    return label;
  }

  function stepHeading(number, label) {
    const heading = node('h2');
    heading.append(node('span', '', number), document.createTextNode(label));
    return heading;
  }

  function platformBadge(icon, label) {
    const item = node('span');
    item.append(node('b', '', icon), document.createTextNode(label));
    return item;
  }

  function setStatus(container, message, error) {
    container.textContent = message || '';
    container.classList.toggle('is-error', Boolean(error));
  }

  window.KnowledgeArticleMover = { render };
}());
