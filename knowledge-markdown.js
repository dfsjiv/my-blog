(function () {
  const markedApi = window.marked;
  const purifier = window.DOMPurify;
  if (!markedApi || !purifier) return;

  function safeUrl(value, allowHash) {
    const source = String(value || '').trim();
    if (!source) return null;
    if (allowHash && source.startsWith('#')) return source;
    try {
      const parsed = new URL(source, window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed.href;
    } catch (error) {
      return null;
    }
  }

  function headingSlug(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      || 'section';
  }

  function addHeadingAnchors(container) {
    const counts = new Map();
    return Array.from(container.querySelectorAll('h2, h3, h4')).map(function (heading) {
      const base = headingSlug(heading.textContent);
      const nextCount = (counts.get(base) || 0) + 1;
      counts.set(base, nextCount);
      heading.id = nextCount === 1 ? base : base + '-' + nextCount;
      return {
        id: heading.id,
        text: heading.textContent.trim(),
        level: Number(heading.tagName.slice(1)),
        element: heading,
      };
    });
  }

  function secureLinks(container) {
    container.querySelectorAll('a[href]').forEach(function (link) {
      const safe = safeUrl(link.getAttribute('href'), true);
      if (!safe) {
        link.removeAttribute('href');
        link.removeAttribute('target');
        link.removeAttribute('rel');
        return;
      }
      link.setAttribute('href', safe);
      if (!safe.startsWith('#') && new URL(safe, window.location.href).origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else {
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
    });
  }

  function secureImages(container) {
    container.querySelectorAll('img').forEach(function (image) {
      const safe = safeUrl(image.getAttribute('src'), false);
      if (!safe) {
        image.remove();
        return;
      }
      image.src = safe;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', function () {
        const fallback = document.createElement('span');
        fallback.className = 'knowledge-image-error';
        fallback.textContent = image.alt || '图片加载失败';
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function codeLanguage(code) {
    const match = Array.from(code.classList).find(function (className) {
      return className.startsWith('language-');
    });
    return match ? match.slice('language-'.length) : 'text';
  }

  function enhanceCodeBlocks(container) {
    container.querySelectorAll('pre > code').forEach(function (code) {
      const pre = code.parentElement;
      const wrapper = document.createElement('div');
      wrapper.className = 'knowledge-code-block';
      const toolbar = document.createElement('div');
      toolbar.className = 'knowledge-code-toolbar';
      const language = document.createElement('span');
      language.textContent = codeLanguage(code);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'knowledge-code-copy';
      copy.textContent = '复制';
      copy.dataset.copyCode = '';
      toolbar.append(language, copy);
      pre.replaceWith(wrapper);
      wrapper.append(toolbar, pre);
    });
  }

  function expandAlignedParagraphs(markdown) {
    let fence = null;
    return String(markdown || '').split('\n').map(function (line) {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        fence = fence ? null : fenceMatch[1][0];
        return line;
      }
      if (fence) return line;
      const match = line.match(/^\{center\}\s+(.+)$/);
      if (!match) return line;
      return '<p class="knowledge-align-center">' + markedApi.parseInline(match[1]) + '</p>';
    }).join('\n');
  }

  async function copyCode(button) {
    const code = button.closest('.knowledge-code-block')?.querySelector('code');
    if (!code || !navigator.clipboard || !navigator.clipboard.writeText) return false;
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = '已复制';
      window.setTimeout(function () {
        if (button.isConnected) button.textContent = '复制';
      }, 1400);
      return true;
    } catch (error) {
      button.textContent = '复制失败';
      window.setTimeout(function () {
        if (button.isConnected) button.textContent = '复制';
      }, 1400);
      return false;
    }
  }

  function render(markdown, container) {
    const html = markedApi.parse(expandAlignedParagraphs(markdown), {
      gfm: true,
      breaks: false,
    });
    const fragment = purifier.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'svg', 'math'],
      FORBID_ATTR: ['style'],
      ALLOW_DATA_ATTR: false,
    });
    container.replaceChildren(fragment);
    secureLinks(container);
    secureImages(container);
    enhanceCodeBlocks(container);
    return {
      headings: addHeadingAnchors(container),
    };
  }

  function renderHtml(html, container) {
    const fragment = purifier.sanitize(String(html || ''), {
      RETURN_DOM_FRAGMENT: true,
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'svg', 'math'],
      FORBID_ATTR: ['style'],
      ALLOW_DATA_ATTR: false,
    });
    container.replaceChildren(fragment);
    secureLinks(container);
    secureImages(container);
    enhanceCodeBlocks(container);
    return {
      headings: addHeadingAnchors(container),
    };
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-copy-code]');
    if (button) copyCode(button);
  });

  window.KnowledgeMarkdown = {
    render,
    renderHtml,
    copyCode,
    headingSlug,
    safeUrl,
  };
}());
