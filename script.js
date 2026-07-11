const pageInfo = {
  home: {
    title: '首页',
    summary: '算法、计算机技术、个人随笔，以及一些其他内容。',
    content: `
      <h2>欢迎来到我的博客</h2>
      <p>这里记录算法、计算机技术、个人随笔以及一些其他内容。所有文章都来自日常学习、实践和思考。</p>
      <h3>技术标签</h3>
      <ul class="tech-tags">
        <li>算法</li><li>数据结构</li><li>计算机系统</li><li>网络</li><li>开发实践</li>
      </ul>
    `,
  },
  algorithm: {
    title: '算法文章',
    summary: '数据结构、题解和算法设计思路。',
    content: '<h2>算法文章</h2><p>这里将会放置算法笔记、LeetCode 题解和思路整理。目前还在准备中，敬请期待。</p>',
  },
  tech: {
    title: '计算机技术',
    summary: '系统、网络、架构与开发实践。',
    content: '<h2>计算机技术</h2><p>展示计算机基础、架构设计、网络知识和开发实践内容。后续会补充更多技术文章。</p>',
  },
  essay: {
    title: '个人随笔',
    summary: '个人思考、生活感悟和创意碎片。',
    content: '<h2>个人随笔</h2><p>这里记录我的读书笔记、生活灵感和个人心得。未来会不断更新有温度的文字。</p>',
  },
  mystery: {
    title: '神秘图片',
    summary: '收集一些喜欢的图片。',
    content: '<h2>神秘图片</h2><p>这里展示了一些神秘图片。点击标题可以进入完整图库。</p><div class="mystery-gallery"><div class="mystery-left"><img src="110944994_p0_master1200.jpg" alt="神秘图片 1" class="mystery-img" /><img src="125625696_p0_master1200.jpg" alt="神秘图片 2" class="mystery-img" /></div><div class="mystery-right"><img src="131135880_p0_master1200.jpg" alt="神秘图片 3" class="mystery-img tall" /></div></div>',
  },
};

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleBtn');
const themeToggle = document.getElementById('themeToggle');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('pageTitle');
const pageSummary = document.getElementById('pageSummary');
const pageContent = document.getElementById('pageContent');

function setPage(pageKey) {
  const page = pageInfo[pageKey];
  if (!page) return;

  pageTitle.textContent = page.title;
  pageSummary.textContent = page.summary;
  pageContent.innerHTML = `<article class="card">${page.content}</article>`;

  if (pageKey === 'mystery') {
    const heading = pageContent.querySelector('.card h2');
    if (heading) {
      heading.style.cursor = 'pointer';
      heading.title = '点击进入神秘图库';
      heading.addEventListener('click', () => {
        window.location.href = 'gallery.html';
      });
    }
  }

  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.page === pageKey);
  });
}

navItems.forEach((item) => {
  item.addEventListener('click', () => setPage(item.dataset.page));
});

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

document.body.classList.add('dark');
setPage('home');
