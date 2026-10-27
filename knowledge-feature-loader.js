(function () {
  'use strict';
  const manifest = JSON.parse(document.getElementById('knowledgeFeatureManifest').textContent);
  const resources = new Map();
  const features = new Map();

  function loadResource(path, kind) {
    if (resources.has(path)) return resources.get(path);
    const promise = new Promise(function (resolve, reject) {
      const node = document.createElement(kind === 'style' ? 'link' : 'script');
      let settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        node.onload = node.onerror = null;
        if (error) {
          node.remove();
          reject(error);
        } else resolve();
      }
      const timer = setTimeout(function () { finish(new Error('Feature resource timed out')); }, 12000);
      if (kind === 'style') { node.rel = 'stylesheet'; node.href = path; }
      else { node.src = path; node.async = false; }
      node.onload = function () { finish(); };
      node.onerror = function () { finish(new Error('Feature resource failed to load')); };
      document.head.appendChild(node);
    });
    resources.set(path, promise);
    promise.catch(function () { if (resources.get(path) === promise) resources.delete(path); });
    return promise;
  }

  function ensure(name) {
    if (features.has(name)) return features.get(name);
    const group = manifest[name];
    if (!group) return Promise.reject(new Error('Unknown feature'));
    const promise = (async function () {
      for (const dependency of group.depends || []) await ensure(dependency);
      await Promise.all((group.styles || []).map(function (path) { return loadResource(path, 'style'); }));
      // Classic scripts capture their dependencies at evaluation time; keep their order.
      for (const path of group.scripts || []) await loadResource(path, 'script');
      if (group.ready && !window[group.ready]) throw new Error('Feature did not initialize');
    }());
    features.set(name, promise);
    promise.catch(function () { if (features.get(name) === promise) features.delete(name); });
    return promise;
  }
  window.KnowledgeFeatures = { ensure };
}());
