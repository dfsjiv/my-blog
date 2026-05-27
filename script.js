const tags = [
  '快速排序', '归并排序', '堆排序', '二叉树', '红黑树', '哈希表',
  '动态规划', '贪心算法', '深度优先搜索', '广度优先搜索', '二分查找', '字典树',
  '图论', '最短路径', '拓扑排序', '并查集', '线段树', '树状数组',
  '链表', '栈',
];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const sizes = ['0.8rem', '0.95rem', '1.1rem', '1.25rem', '1.4rem'];
const allPaddings = [
  '8px 14px', '10px 18px', '12px 24px', '14px 28px', '16px 32px',
];

// 生成不规则的滚动行 —— 分散布局
const rows = [];
const rowCount = 6;
for (let r = 0; r < rowCount; r++) {
  const rowTags = [];
  const count = 2 + Math.floor(randomBetween(0, 2)); // 每行只有 2-3 个标签
  
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * tags.length);
    } while (used.has(idx));
    used.add(idx);
    
    const sizeIdx = Math.floor(Math.random() * sizes.length);
    const padIdx = Math.floor(Math.random() * allPaddings.length);
    
    rowTags.push({
      text: tags[idx],
      fontSize: sizes[sizeIdx],
      padding: allPaddings[padIdx],
      marginRight: randomBetween(60, 150), // 水平间距拉大
    });
  }
  
  rows.push({
    tags: rowTags,
    dir: r % 2 === 0 ? 'left' : 'right',
    speed: randomBetween(18, 35),
    // 垂直均匀分散
    top: 5 + r * 15 + randomBetween(-2, 2),
  });
}

// 生成首页的标签墙
function buildTagWall() {
  const wall = document.createElement('div');
  wall.className = 'tag-wall';
  const container = document.createElement('div');
  container.className = 'tag-container';
  
  rows.forEach((rowData) => {
    const row = document.createElement('div');
    row.className = `scroll-row scroll-${rowData.dir}`;
    row.style.top = rowData.top + '%';
    row.style.animationDuration = rowData.speed + 's';
    
    const group1 = document.createElement('div');
    group1.className = 'scroll-group';
    group1.style.gap = randomBetween(60, 150) + 'px'; // 组内间距大
    const group2 = document.createElement('div');
    group2.className = 'scroll-group';
    group2.style.gap = group1.style.gap;
    
    const makeTags = (group) => {
      rowData.tags.forEach((t) => {
        const span = document.createElement('span');
        span.className = 'scroll-tag';
        span.textContent = t.text;
        span.style.fontSize = t.fontSize;
        span.style.padding = t.padding;
        span.style.marginRight = t.marginRight + 'px';
        span.style.opacity = 0.65 + Math.random() * 0.35;
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
    summary: '探索神秘图片集，适配明暗主题。',
    content: '<h2>神秘图片</h2><p>这里展示了一些神秘图片。切换主题后，图片呈现不同的明暗风格。</p><div class="mystery-gallery"><div class="mystery-left"><img src="110944994_p0_master1200.jpg" alt="神秘图片 1" class="mystery-img" /><img src="125625696_p0_master1200.jpg" alt="神秘图片 2" class="mystery-img" /></div><div class="mystery-right"><img src="131135880_p0_master1200.jpg" alt="神秘图片 3" class="mystery-img tall" /></div></div>',
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

  // 神秘图片页面：卡片内的 h2 标题作为跳转入口
  if (pageKey === 'mystery') {
    const cardH2 = pageContent.querySelector('.card h2');
    if (cardH2) {
      cardH2.style.cursor = 'pointer';
      cardH2.title = '点击进入神秘图库';
      cardH2.onclick = function(e) {
        e.stopPropagation();
        window.location.href = 'gallery.html';
      };
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
