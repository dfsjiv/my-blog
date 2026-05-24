const pageInfo = {
  home: {
    title: '首页',
    summary: '简洁的首页视图，展示博客的主要入口与简介。',
    content: '<h2>欢迎来到我的博客</h2><p>这里是我的个人空间，未来会展示算法文章、计算机技术与随笔。你可以通过左侧菜单切换不同内容，浏览我的技术分享与思考。</p>',
  },
  algorithm: {
    title: '算法文章',
    summary: '算法主题区，包括数据结构、题解和算法设计思路。',
    content: '<h2>算法文章</h2><p>这里将会放置算法笔记、LeetCode 题解和思路整理。目前还在准备中，敬请期待。</p>',
  },
  tech: {
    title: '计算机技术',
    summary: '计算机技术专题，涵盖系统、网络、架构与开发实践。',
    content: '<h2>计算机技术</h2><p>展示计算机基础、架构设计、网络知识和开发实践内容。后续会补充更多技术文章。</p>',
  },
  essay: {
    title: '个人随笔',
    summary: '书写个人思考、生活感悟和创意碎片。',
    content: '<h2>个人随笔</h2><p>这里记录我的读书笔记、生活灵感和个人心得。未来会不断更新有温度的文字。</p>',
  },
  mystery: {
    title: '神秘图片',
    summary: '探索一个简单的神秘图案，适配明暗主题。',
    content: '<h2>神秘图案</h2><p>这里展示一个神秘图片效果。切换主题后，图案会呈现不同的明暗风格。</p><div class="mystery-image"><div class="mystery-circle"></div></div>',
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
  pageContent.innerHTML = `<div class="card">${page.content}</div>`;
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

setPage('home');
