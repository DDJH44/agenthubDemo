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
  "登录", "注册", "烟花", "firework", "fireworks", "canvas",
];

const COMPLEX_INDICATORS = [
  "架构设计", "系统设计", "微服务", "分布式", "多模块", "详细方案", "调研",
  "分析报告", "对比", "评估报告",
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

  const hasBuildAction = BUILD_ACTIONS.some((keyword) => lower.includes(keyword));
  const deliverableHits = DELIVERABLE_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  const hasCodeFenceHint = /(?:\.html|\.tsx?|\.jsx?|<!doctype|<html|canvas|代码)/i.test(text);

  return hasBuildAction && (deliverableHits >= 1 || hasCodeFenceHint);
}
