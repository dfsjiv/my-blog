(function () {
  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  }

  function action(text, className) {
    const item = node('button', className || '', text);
    item.type = 'button';
    return item;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (error) {
      return null;
    }
  }

  function copy(language, english, chinese) {
    return language === 'zh' ? chinese : english;
  }

  function makeCard(item, options) {
    const card = node('article', 'knowledge-favorite-card');
    const cover = node('div', 'knowledge-favorite-cover');
    if (item.coverUrl) {
      const image = document.createElement('img');
      image.src = item.coverUrl;
      image.alt = item.title;
      image.loading = 'lazy';
      cover.appendChild(image);
    } else {
      cover.appendChild(node('span', '', item.kind === 'game' ? 'GAME' : 'ANIME'));
    }
    const body = node('div', 'knowledge-favorite-body');
    const heading = node('div', 'knowledge-favorite-heading');
    heading.append(
      node('h2', '', item.title),
      node('span', 'knowledge-type-badge', item.kind === 'game'
        ? copy(options.language, 'Game', '游戏')
        : copy(options.language, 'Anime', '动漫'))
    );
    body.appendChild(heading);
    if (item.description) body.appendChild(node('p', '', item.description));
    const links = node('div', 'knowledge-favorite-links');
    item.links.forEach(function (entry) {
      const href = safeUrl(entry.url);
      if (!href) return;
      const link = node('a', 'knowledge-favorite-link');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(
        node('span', 'knowledge-favorite-platform', entry.platform),
        node('strong', '', entry.label),
        node('span', 'knowledge-favorite-external', '↗')
      );
      links.appendChild(link);
    });
    if (links.childElementCount) body.appendChild(links);
    if (options.isAdmin) {
      const controls = node('div', 'knowledge-favorite-admin-actions');
      const edit = action(copy(options.language, 'Edit', '编辑'), 'knowledge-route-button');
      edit.addEventListener('click', function () { options.onEdit(item); });
      const remove = action(copy(options.language, 'Delete', '删除'), 'knowledge-route-button is-danger');
      let armed = false;
      remove.addEventListener('click', function () {
        if (!armed) {
          armed = true;
          remove.textContent = copy(options.language, 'Confirm delete', '确认删除');
          window.setTimeout(function () {
            armed = false;
            remove.textContent = copy(options.language, 'Delete', '删除');
          }, 3000);
          return;
        }
        options.onDelete(item);
      });
      controls.append(edit, remove);
      body.appendChild(controls);
    }
    card.append(cover, body);
    if (item.status === 'draft') card.dataset.status = 'draft';
    return card;
  }

  function field(labelText, control, wide) {
    const label = node('label', 'knowledge-favorite-field' + (wide ? ' is-wide' : ''));
    label.append(node('span', '', labelText), control);
    return label;
  }

  function createEditor(options, onSaved) {
    const form = node('form', 'knowledge-favorite-editor');
    form.hidden = true;
    const heading = node('h2');
    const fields = node('div', 'knowledge-favorite-form-grid');
    const title = document.createElement('input');
    title.required = true;
    title.maxLength = 120;
    const kind = document.createElement('select');
    kind.append(new Option('Anime / 动漫', 'anime'), new Option('Game / 游戏', 'game'));
    const description = document.createElement('textarea');
    description.rows = 4;
    description.maxLength = 1000;
    const coverUrl = document.createElement('input');
    coverUrl.type = 'url';
    coverUrl.placeholder = '/api/knowledge/images/...';
    const coverFile = document.createElement('input');
    coverFile.type = 'file';
    coverFile.accept = 'image/jpeg,image/png,image/webp,image/gif';
    const status = document.createElement('select');
    status.append(
      new Option(copy(options.language, 'Published', '公开'), 'published'),
      new Option(copy(options.language, 'Draft', '草稿'), 'draft')
    );
    const sortOrder = document.createElement('input');
    sortOrder.type = 'number';
    sortOrder.value = '0';
    fields.append(
      field(copy(options.language, 'Title', '名称'), title),
      field(copy(options.language, 'Type', '类型'), kind),
      field(copy(options.language, 'Description', '简介'), description, true),
      field(copy(options.language, 'Cover URL', '封面地址'), coverUrl, true),
      field(copy(options.language, 'Upload cover', '上传封面'), coverFile, true),
      field(copy(options.language, 'Status', '状态'), status),
      field(copy(options.language, 'Order (smaller first)', '排序（越小越靠前）'), sortOrder)
    );
    const linksHeading = node('div', 'knowledge-favorite-links-heading');
    linksHeading.appendChild(node('h3', '', copy(options.language, 'Platform links', '平台链接')));
    const addLink = action(copy(options.language, 'Add link', '添加链接'), 'knowledge-route-button');
    linksHeading.appendChild(addLink);
    const linkRows = node('div', 'knowledge-favorite-link-editor');
    const message = node('p', 'knowledge-favorite-form-message');
    const controls = node('div', 'knowledge-favorite-form-actions');
    const cancel = action(copy(options.language, 'Cancel', '取消'), 'knowledge-route-button');
    const save = action(copy(options.language, 'Save', '保存'), 'knowledge-route-button is-primary');
    save.type = 'submit';
    controls.append(cancel, save);
    form.append(heading, fields, linksHeading, linkRows, message, controls);
    let editingId = null;

    function addLinkRow(value) {
      if (linkRows.childElementCount >= 12) return;
      const row = node('div', 'knowledge-favorite-link-row');
      const platform = document.createElement('input');
      platform.placeholder = copy(options.language, 'Platform, e.g. Bilibili', '平台，例如 B站');
      platform.value = value?.platform || '';
      const label = document.createElement('input');
      label.placeholder = copy(options.language, 'Button label', '按钮文字');
      label.value = value?.label || '';
      const url = document.createElement('input');
      url.type = 'url';
      url.placeholder = 'https://...';
      url.value = value?.url || '';
      const remove = action('×', 'knowledge-favorite-remove-link');
      remove.setAttribute('aria-label', copy(options.language, 'Remove link', '删除链接'));
      remove.addEventListener('click', function () { row.remove(); });
      row.append(platform, label, url, remove);
      linkRows.appendChild(row);
    }

    function open(item) {
      editingId = item?.id || null;
      heading.textContent = editingId
        ? copy(options.language, 'Edit favorite', '编辑收藏')
        : copy(options.language, 'Add favorite', '新增收藏');
      title.value = item?.title || '';
      kind.value = item?.kind || options.kind;
      description.value = item?.description || '';
      coverUrl.value = item?.coverUrl || '';
      coverFile.value = '';
      status.value = item?.status || 'published';
      sortOrder.value = String(item?.sortOrder || 0);
      linkRows.replaceChildren();
      (item?.links?.length ? item.links : [{}]).forEach(addLinkRow);
      message.textContent = '';
      form.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      title.focus();
    }

    addLink.addEventListener('click', function () { addLinkRow({}); });
    cancel.addEventListener('click', function () { form.hidden = true; });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      message.textContent = copy(options.language, 'Saving...', '正在保存…');
      try {
        let finalCoverUrl = coverUrl.value.trim() || null;
        if (coverFile.files[0]) {
          const uploaded = await options.repository.uploadImage(coverFile.files[0], {
            token: options.token,
          });
          finalCoverUrl = uploaded.url;
        }
        const links = Array.from(linkRows.children).map(function (row) {
          const inputs = row.querySelectorAll('input');
          return {
            platform: inputs[0].value.trim(),
            label: inputs[1].value.trim(),
            url: inputs[2].value.trim(),
          };
        }).filter(function (entry) { return entry.platform || entry.label || entry.url; });
        const payload = {
          kind: kind.value,
          title: title.value.trim(),
          description: description.value.trim(),
          coverUrl: finalCoverUrl,
          status: status.value,
          sortOrder: Number(sortOrder.value || 0),
          links,
        };
        if (editingId) {
          await options.repository.updateFavorite(editingId, payload, { token: options.token });
        } else {
          await options.repository.createFavorite(payload, { token: options.token });
        }
        form.hidden = true;
        await onSaved();
      } catch (error) {
        message.textContent = error.message || copy(options.language, 'Save failed.', '保存失败。');
      } finally {
        save.disabled = false;
      }
    });
    form.openFor = open;
    return form;
  }

  async function render(container, settings) {
    const toolbar = node('div', 'knowledge-favorite-toolbar');
    const grid = node('div', 'knowledge-favorite-grid');
    container.append(toolbar, grid);
    let editor = null;

    async function load() {
      grid.replaceChildren(node(
        'div',
        'knowledge-loading-state',
        copy(settings.language, 'Loading favorites...', '正在加载收藏…')
      ));
      try {
        const requestOptions = { signal: settings.signal };
        if (settings.isAdmin) requestOptions.token = settings.token;
        const items = settings.isAdmin
          ? await settings.repository.getAdminFavorites(settings.kind, requestOptions)
          : await settings.repository.getFavorites(settings.kind, requestOptions);
        if (settings.signal.aborted) return;
        grid.replaceChildren();
        items.forEach(function (item) {
          grid.appendChild(makeCard(item, {
            language: settings.language,
            isAdmin: settings.isAdmin,
            onEdit: function () { editor.openFor(item); },
            onDelete: async function () {
              await settings.repository.deleteFavorite(item.id, { token: settings.token });
              await load();
            },
          }));
        });
        if (!items.length) {
          const empty = node('div', 'knowledge-empty-state');
          empty.append(
            node('h2', '', copy(settings.language, 'No favorites yet', '还没有添加收藏')),
            node('p', '', copy(
              settings.language,
              'Items and their platform links will appear here.',
              '添加后会在这里展示条目及其平台链接。'
            ))
          );
          grid.appendChild(empty);
        }
      } catch (error) {
        if (!settings.signal.aborted) {
          const failed = node('div', 'knowledge-error-state');
          failed.append(
            node('p', '', copy(settings.language, 'Unable to load favorites.', '收藏加载失败。')),
            action(copy(settings.language, 'Retry', '重试'), 'knowledge-route-button')
          );
          failed.querySelector('button').addEventListener('click', load);
          grid.replaceChildren(failed);
        }
      }
    }

    if (settings.isAdmin) {
      const add = action(copy(settings.language, 'Add item', '新增条目'), 'knowledge-route-button is-primary');
      toolbar.appendChild(add);
      editor = createEditor(settings, load);
      container.insertBefore(editor, grid);
      add.addEventListener('click', function () { editor.openFor(null); });
    }
    await load();
  }

  window.KnowledgeFavorites = { render };
}());
