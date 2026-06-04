const CHAT_PATTERNS = [
  /^(你好|hi|hello|hey|嗨|哈喽|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|感谢|ok|好的|嗯|是|否|对|再见|拜拜)\s*[!！?？。.~～]*$/i,
  /^(你是谁|你叫什么|介绍|介绍一下你自己|what|how are you|who are you)\s*[!！?？。.~～]*$/i,
];

const TASK_PATTERNS = [
  /^(帮我|请|做|写|开发|创建|分析|搜索|部署|优化|修复|重构|实现|设计|生成|构建|运行|执行)/i,
  /@(planner|worker|critic|researcher|refiner|all)/i,
];

const BUILD_ACTIONS = [
  "帮我做", "帮我写", "做一个", "写一个", "生成", "创建", "开发", "制作",
  "实现", "编写", "构建", "搭建", "设计", "build", "create", "generate",
  "make", "develop", "implement",
];

const DELIVERABLE_KEYWORDS = [
  "网站", "网页", "页面", "站点", "h5", "html", "css", "javascript", "typescript",
  "react", "vue", "app", "应用", "小程序", "demo", "原型", "组件", "界面",
  "前端", "代码", "游戏", "动画", "可视化", "看板", "dashboard", "表单",
  "登录", "注册", "烟花", "系统", "管理系统", "后台", "后端", "api", "crud", "数据库",
  "firework", "fireworks", "canvas",
];

const COMPLEX_INDICATORS = [
  "架构设计", "系统设计", "微服务", "分布式", "多模块", "详细方案", "调研",
  "分析报告", "对比", "评估报告",
];

const ARTIFACT_REQUEST_HINTS = [
  /网站|网页|页面|站点|小程序|demo|原型|组件|界面|前端|代码|游戏|小游戏|动画|可视化|看板|表单/i,
  /管理系统|后台系统|图书馆|图书管理|借阅|库存管理|后端|api|crud|数据库|增删改查/i,
  /番茄钟|番茄工作法|计时器|倒计时|pomodoro|timer|stopwatch|clock/i,
  /todo|待办|抽奖|轮盘|播放器|画板|白板|计算器|日历|记账|天气|音乐|相册|作品集/i,
];

const BUILD_ACTION_HINTS = [
  /帮我|请|做|写|生成|创建|开发|制作|实现|编写|构建|搭建|设计/i,
];

export function isSimpleChat(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 80) return false;
  if (TASK_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (trimmed.length <= 15 && trimmed.split(/\s+/).length <= 5 && !/[，。；：！？、]/.test(trimmed)) return true;
  return false;
}

export function isArtifactGenerationTask(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  if (COMPLEX_INDICATORS.some((keyword) => lower.includes(keyword))) return false;

  const hasBuildAction = BUILD_ACTIONS.some((keyword) => lower.includes(keyword))
    || BUILD_ACTION_HINTS.some((pattern) => pattern.test(text));
  const deliverableHits = DELIVERABLE_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  const hasCodeFenceHint = /(?:\.html|\.tsx?|\.jsx?|<!doctype|<html|canvas|代码)/i.test(text);

  const hasArtifactRequestHint = ARTIFACT_REQUEST_HINTS.some((pattern) => pattern.test(text));

  return hasBuildAction && (deliverableHits >= 1 || hasCodeFenceHint || hasArtifactRequestHint);
}
