const tags = [
  '快速排序', '归并排序', '堆排序', '二叉树', '红黑树', '哈希表',
  '动态规划', '贪心算法', '深度优先搜索', '广度优先搜索', '二分查找', '字典树',
  '图论', '最短路径', '拓扑排序', '并查集', '线段树', '树状数组',
  '链表', '栈',
];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const sizes = ['0.8rem', '0.9rem', '1rem', '1.1rem', '1.2rem', '1.35rem', '1.5rem'];
const allPaddings = [
  '6px 12px', '8px 16px', '10px 18px', '10px 22px', '12px 26px', '14px 30px', '16px 34px',
];

// 生成不规则的滚动行
const rows = [];
const rowCount = 7;
for (let r = 0; r < rowCount; r++) {
  // 每行随机选择一些标签（3-5个），且打乱顺序
  const shuffled = [...tags].sort(() => Math.random() - 0.5);
  const count = 3 + Math.floor(randomBetween(0, 3));
  const rowTags = [];
  
  for (let i = 0; i < count; i++) {
    const tagIdx = (r + i * 3) % tags.length;
    const sizeIdx = Math.floor(Math.random() * sizes.length);
    const padIdx = Math.floor(Math.random() * allPaddings.length);
    
    rowTags.push({
      text: tags[tagIdx],
      fontSize: sizes[sizeIdx],
      padding: allPaddings[padIdx],
      // 行内间距随机 20-60px
      marginRight: randomBetween(20, 60),
    });
  }
  
  // 每行随机打乱
  rowTags.sort(() => Math.random() - 0.5);
  
  rows.push({
    tags: rowTags,
    dir: r % 2 === 0 ? 'left' : 'right',
    speed: randomBetween(15, 35),
    // 垂直位置随机分布（top% 值）
    top: 2 + (r * 13) + randomBetween(-3, 3),
  });
}

// 生成首页的标签墙
function buildTagWall() {
  const wall = document.createElement('div');
  wall.className = 'tag-wall';
  const container = document.createElement('div');
  container.className = 'tag-container';
  
  rows.forEach((rowData, ri) => {
    const row = document.createElement('div');
    row.className = `scroll-row scroll-${rowData.dir}`;
    row.style.top = rowData.top + '%';
    row.style.animationDuration = rowData.speed + 's';
    
    // 生成两组标签实现无缝循环
    const group1 = document.createElement('div');
    group1.className = 'scroll-group';
    const group2 = document.createElement('div');
    group2.className = 'scroll-group';
    
    const makeTags = (group) => {
      rowData.tags.forEach((t, i) => {
        const span = document.createElement('span');
        span.className = 'scroll-tag';
        span.textContent = t.text;
        span.style.fontSize = t.fontSize;
        span.style.padding = t.padding;
        span.style.marginRight = t.marginRight + 'px';
        // 随机透明度增加水流感
        span.style.opacity = randomBetween(0.6, 1);
        group.appendChild(span);
      });
    };
    
    makeTags(group1);
    makeTags(group2);
    
    row.appendChild(group1);
    row.appendChild(group2);
    container.appendChild(row);
  });
  
  wall.appendChild(container);
  return wall;
}

const pageInfo = {
  home: {
    title: '首页',
    summary: '简洁的首页视图，展示博客的主要入口与简介。',
    content: function() {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = '<h2>欢迎来到我的博客</h2><p>这里是我的个人空间，未来会展示算法文章、计算机技术与随笔。你可以通过左侧菜单切换不同内容，浏览我的技术分享与思考。</p>';
      wrapper.appendChild(buildTagWall());
      return wrapper.innerHTML;
    },
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
  if (pageSummary) {
    pageSummary.textContent = page.summary;
  }
  const content = typeof page.content === 'function' ? page.content() : page.content;
  pageContent.innerHTML = `<div class="card">${content}</div>`;
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

// 默认使用黑色背景
document.body.classList.add('dark');

setPage('home');
