(function () {
  function node(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function formatDate(value, language) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function render(container, options) {
    const repository = options.repository;
    const post = options.post;
    const signal = options.signal;
    const t = typeof options.translate === 'function'
      ? options.translate
      : function (text) { return text; };
    const getUser = typeof options.getUser === 'function'
      ? options.getUser
      : function () { return null; };
    const getToken = typeof options.getToken === 'function'
      ? options.getToken
      : function () { return null; };
    const getLanguage = typeof options.getLanguage === 'function'
      ? options.getLanguage
      : function () { return 'zh'; };

    container.className = 'knowledge-comments';

    async function load() {
      container.replaceChildren(
        node('h2', 'knowledge-comments-title', t('评论')),
        node('p', 'knowledge-comments-status', t('正在加载评论…'))
      );
      try {
        const comments = await repository.getPostComments(post, { signal });
        if (signal && signal.aborted) return;
        draw(comments);
      } catch (error) {
        if (signal && signal.aborted) return;
        container.replaceChildren(
          node('h2', 'knowledge-comments-title', t('评论')),
          node('p', 'knowledge-comments-status is-error', t('评论暂时无法加载。'))
        );
        const retry = node('button', 'knowledge-route-button', t('重新加载'));
        retry.type = 'button';
        retry.addEventListener('click', load);
        container.appendChild(retry);
      }
    }

    function draw(comments) {
      const user = getUser();
      const signedIn = Boolean(user && user.role !== 'guest' && getToken());
      const total = comments.reduce(function (count, comment) {
        return count + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0);
      }, 0);
      container.replaceChildren();
      container.appendChild(node('h2', 'knowledge-comments-title', t('评论') + ' ' + total));

      if (signedIn) container.appendChild(makeComposer(null));
      else container.appendChild(makeLoginPrompt());

      if (!comments.length) {
        container.appendChild(node('p', 'knowledge-comments-empty', t('还没有评论，来留下第一条吧。')));
        return;
      }

      const list = node('div', 'knowledge-comments-list');
      comments.forEach(function (comment) {
        list.appendChild(makeComment(comment, false));
      });
      container.appendChild(list);
    }

    function makeLoginPrompt() {
      const prompt = node('div', 'knowledge-comments-login');
      prompt.appendChild(node('span', '', t('登录后可以发表评论。')));
      const login = node('button', 'knowledge-route-button', t('登录'));
      login.type = 'button';
      login.addEventListener('click', function () {
        document.querySelector('[data-auth-mode="login"]')?.click();
      });
      prompt.appendChild(login);
      return prompt;
    }

    function makeComposer(parentId) {
      const form = node('form', parentId ? 'knowledge-comment-form is-reply' : 'knowledge-comment-form');
      const input = document.createElement('textarea');
      input.className = 'knowledge-comment-input';
      input.maxLength = 2000;
      input.rows = parentId ? 3 : 4;
      input.placeholder = t(parentId ? '写下回复…' : '写下你的评论…');
      const status = node('span', 'knowledge-comment-form-status');
      const submit = node('button', 'knowledge-route-button', t(parentId ? '发表回复' : '发表评论'));
      submit.type = 'submit';
      form.append(input, status, submit);
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const content = input.value.trim();
        if (!content) {
          status.textContent = t('评论内容不能为空');
          return;
        }
        submit.disabled = true;
        status.textContent = t('正在发表…');
        try {
          await repository.createPostComment(
            post,
            parentId ? { content, parentId } : { content },
            { token: getToken() }
          );
          await load();
        } catch (error) {
          submit.disabled = false;
          status.textContent = error.message || t('评论发表失败。');
        }
      });
      return form;
    }

    function makeComment(comment, isReply) {
      const item = node('article', isReply
        ? 'knowledge-comment-item is-reply'
        : 'knowledge-comment-item');
      const header = node('header', 'knowledge-comment-header');
      header.append(
        node('strong', '', comment.author && comment.author.username ? comment.author.username : t('用户')),
        node('time', '', formatDate(comment.createdAt, getLanguage()))
      );
      const actions = node('div', 'knowledge-comment-actions');
      if (!isReply && getUser() && getUser().role !== 'guest' && getToken()) {
        const reply = node('button', '', t('回复'));
        reply.type = 'button';
        reply.addEventListener('click', function () {
          const existing = item.querySelector('.knowledge-comment-form.is-reply');
          if (existing) {
            existing.remove();
            return;
          }
          item.appendChild(makeComposer(comment.id));
        });
        actions.appendChild(reply);
      }
      if (getUser() && getUser().role === 'admin') {
        const remove = node('button', 'is-danger', t('删除'));
        remove.type = 'button';
        remove.addEventListener('click', async function () {
          if (!window.confirm(t('确认删除这条评论吗？'))) return;
          remove.disabled = true;
          try {
            await repository.deletePostComment(comment.id, { token: getToken() });
            await load();
          } catch (error) {
            remove.disabled = false;
          }
        });
        actions.appendChild(remove);
      }
      header.appendChild(actions);
      item.append(header, node('p', 'knowledge-comment-content', comment.content));
      if (!isReply && Array.isArray(comment.replies) && comment.replies.length) {
        const replies = node('div', 'knowledge-comment-replies');
        comment.replies.forEach(function (reply) {
          replies.appendChild(makeComment(reply, true));
        });
        item.appendChild(replies);
      }
      return item;
    }

    load();
  }

  window.KnowledgeComments = { render };
}());
