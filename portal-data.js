(function () {
  window.portalConfig = {
    placeholder: true,
    quickLinks: [
      { id: 'desktop', icon: 'OS', title: 'Web OS', description: '进入现有 Windows 风格桌面', tag: '主要入口', action: 'desktop', placeholder: false },
      { id: 'blog', icon: 'B', title: '技术博客', description: '阅读算法、技术与随笔内容', tag: '现有页面', href: 'blog.html', placeholder: false },
      { id: 'contest', icon: 'OJ', title: '竞赛中心', description: '查看现有竞赛信息与入口', tag: '最近更新', action: 'contest', placeholder: false },
      { id: 'city', icon: '3D', title: '3D 城市', description: '进入现有实时城市实验场景', tag: '实验功能', action: 'city', placeholder: false },
      { id: 'projects', icon: 'P', title: '项目展示', description: '项目独立入口尚未建立', tag: '开发中', disabled: true, placeholder: true },
      { id: 'about', icon: 'ME', title: '关于我', description: '查看此页面中的个人资料占位', tag: '页面区块', scrollTarget: 'portalAbout', placeholder: true },
    ],
    categories: [
      { label: '技术', placeholder: true },
      { label: '算法', placeholder: true },
      { label: '408', placeholder: true },
      { label: '项目', placeholder: true },
      { label: '游戏开发', placeholder: true },
      { label: '随笔', placeholder: true },
    ],
    placeholderPosts: [
      { title: '文章标题占位 A', summary: '这里将显示文章摘要、核心内容与阅读提示。', date: '日期待接入', category: '分类占位', tags: ['标签', '占位'], readingTime: '-- 分钟', placeholder: true },
      { title: '文章标题占位 B', summary: '真实文章数据接入后，此卡片将由接口返回的数据生成。', date: '日期待接入', category: '分类占位', tags: ['技术', '占位'], readingTime: '-- 分钟', placeholder: true },
      { title: '文章标题占位 C', summary: '当前内容仅用于验证信息层级、排版与响应式布局。', date: '日期待接入', category: '分类占位', tags: ['记录', '占位'], readingTime: '-- 分钟', placeholder: true },
    ],
    placeholderProjects: [
      { name: '项目名称占位 A', description: '项目简介、目标与当前进度将在这里显示。', tech: ['技术栈', '待接入'], status: '开发中', placeholder: true },
      { name: '项目名称占位 B', description: '项目封面与真实仓库链接将在后续替换。', tech: ['技术栈', '待接入'], status: '规划中', placeholder: true },
      { name: '项目名称占位 C', description: '当前卡片只用于建立项目展示布局。', tech: ['技术栈', '待接入'], status: '占位', placeholder: true },
    ],
    placeholderActivities: [
      { time: '时间待接入', type: '更新', description: '动态内容占位：后续接入真实活动数据。', placeholder: true },
      { time: '时间待接入', type: '项目', description: '项目动态占位：后续替换为真实状态。', placeholder: true },
      { time: '时间待接入', type: '文章', description: '文章动态占位：后续关联真实文章入口。', placeholder: true },
    ],
    placeholderStats: [
      { label: '文章数', value: '--', placeholder: true },
      { label: '项目数', value: '--', placeholder: true },
      { label: '标签数', value: '--', placeholder: true },
      { label: '运行天数', value: '--', placeholder: true },
      { label: '最近更新', value: '--', placeholder: true },
    ],
    placeholderTags: ['技术', '算法', '408', '项目', '开发记录', '随笔'],
  };
}());
