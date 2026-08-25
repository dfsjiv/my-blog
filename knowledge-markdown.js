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

  function enhanceMath(container) {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  }

  function restoreLegacyEntities(value) {
    return String(value || '')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  function isVectorNotationLine(value) {
    const text = restoreLegacyEntities(value).trim()
      .replace(/^(?:\*{1,3}|_{1,3})/, '')
      .replace(/(?:\*{1,3}|_{1,3})$/, '')
      .trim();
    return /^Vector\s*<\s*[^,<>{};]+\s*,\s*[^,<>{};]+\s*>\s*=\s*\([^(){};]+\)\s*\.?$/i.test(text);
  }

  function expandLegacyIndentedVectorBlocks(markdown) {
    const lines = String(markdown || '').split('\n');
    const output = [];
    let index = 0;
    while (index < lines.length) {
      if (!/^(?: {4,}|\t)/.test(lines[index])) {
        output.push(lines[index]);
        index += 1;
        continue;
      }
      const block = [];
      let cursor = index;
      while (cursor < lines.length && (/^(?: {4,}|\t)/.test(lines[cursor]) || !lines[cursor].trim())) {
        block.push(lines[cursor]);
        cursor += 1;
      }
      const content = block.filter(function (line) { return line.trim(); });
      if (content.length > 0 && content.every(isVectorNotationLine)) {
        output.push(content.map(function (line) {
          return '{center} ' + restoreLegacyEntities(line.trim());
        }).join('\n\n'));
      } else {
        output.push(block.join('\n'));
      }
      index = cursor;
    }
    return output.join('\n');
  }

  function expandLegacyCenteredTextBlocks(markdown) {
    const expandedFences = String(markdown || '').replace(
      /^\s*(```+|~~~+)\s*(?:text|plaintext)\s*\n([\s\S]*?)\n\s*\1\s*$/gim,
      function (block, fence, body) {
        const lines = body.split('\n');
        const content = lines.filter(function (line) { return line.trim(); });
        const wrappedProse = content.length > 0 && content.every(function (line) {
          return /^\s*(?:\*{1,3}|_{1,3}).+(?:\*{1,3}|_{1,3})\s*$/.test(line);
        });
        const encodedCenteredProse = content.length > 0
          && content.some(function (line) { return /&(?:lt|gt);/i.test(line); })
          && content.every(function (line) { return /^(?: {2,}|\t)/.test(line); })
          && content.every(function (line) {
            return !/[{};]|^\s*#\s*include\b/.test(restoreLegacyEntities(line));
          });
        const vectorNotationProse = content.length > 0
          && content.every(isVectorNotationLine);
        const centeredProse = wrappedProse || encodedCenteredProse || vectorNotationProse;
        if (!centeredProse) return block;
        return content.map(function (line) {
          return '{center} ' + restoreLegacyEntities(line.trim());
        }).join('\n\n');
      }
    );
    return expandLegacyIndentedVectorBlocks(expandedFences);
  }

  function expandAlignedParagraphs(markdown) {
    let fence = null;
    return expandLegacyCenteredTextBlocks(markdown).split('\n').map(function (line) {
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
    enhanceMath(container);
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
      ADD_ATTR: ['data-align'],
      ALLOW_DATA_ATTR: false,
    });
    fragment.querySelectorAll('[data-align="center"]').forEach(function (node) {
      node.classList.add('knowledge-align-center');
      node.removeAttribute('data-align');
    });
    container.replaceChildren(fragment);
    secureLinks(container);
    secureImages(container);
    enhanceMath(container);
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
    enhanceMath,
    expandLegacyCenteredTextBlocks,
    expandLegacyIndentedVectorBlocks,
  };
}());
