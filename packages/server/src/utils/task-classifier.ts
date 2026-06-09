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

const DELIVERABLE_REQUEST_HINTS = [
  /文档|说明文档|报告|手册|方案|指南|PRD|需求文档|设计文档|技术文档|接口文档|用户手册|白皮书|材料|说明书/i,
  /PPT|PPTX|幻灯片|演示文稿|演示稿|汇报稿|路演稿/i,
  /document|report|manual|proposal|guide|deck|slides?|presentation/i,
];

const DELIVERABLE_COMPLAINT_HINTS = [
  /为什么.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
  /为何.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
  /不是.*(要|想).*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
  /不要.*生成.*(文档|报告|方案|PPT|幻灯片|演示文稿)/,
];

const ARTIFACT_COMPLAINT_HINTS = [
  /(?:为什么|为何|怎么|怎么会|原因|解释).*(?:生成|输出).*(?:index\.html|html|代码|产物|网页)/i,
  /(?:重复|相同|一样).*(?:index\.html|html|代码|产物|网页)/i,
  /(?:why|how|reason|explain).*(?:generated?|created?|output).*(?:index\.html|html|code|artifact|page)/i,
  /(?:duplicate|same|identical|repeated).*(?:index\.html|html|code|artifact|page)/i,
];

const BUILD_ACTION_HINTS = [
  /帮我|请|做|写|生成|创建|开发|制作|实现|编写|构建|搭建|设计/i,
];

const LIGHTWEIGHT_MENTION_CHAT_PATTERNS = [
  /^(你好|hi|hello|hey|嗨|哈喽|在吗|在不在|你在吗|听得到吗|收到吗|谢谢|感谢|辛苦了|好的|收到|ok|okay|嗯|可以|可以吗|行吗|这样可以吗|这样行吗|你怎么看|怎么说|有思路吗|先等一下|等一下|先别动|别执行|暂停|先暂停)\s*[!！?？。.~～]*$/i,
  /^(are you there|you there|thanks|thank you|ok|okay|sure|cool|hold on|wait|pause)$/i,
];

const MENTION_QUESTION_CHAT_PATTERNS = [
  /(?:为什么|为何|怎么|原因|解释|怎么回事|是不是|对吗|准确吗|有问题吗)/,
  /(?:why|how|reason|explain|what happened|is it correct|is this right|\?)/i,
];

const MENTION_TASK_HINTS = [
  /帮我|请你|麻烦|生成|创建|开发|制作|实现|编写|构建|搭建|设计|修复|优化|重构|检查|审查|review|测试|部署|运行|执行|分析|总结|整理|输出|改成|改一下|写一下|做一下|看一下|看下|看看|解释一下|评价一下|代码|网页|网站|文档|ppt|系统|页面|功能|bug|diff|接口|数据库|需求|方案/i,
];

const QUOTE_HEADER_RE = /^引用\s+.{1,80}[：:]\s*$/;

const QUOTE_EXECUTION_HINTS = [
  /生成|创建|开发|制作|实现|编写|构建|搭建|设计|修复|优化|重构|测试|部署|运行|执行|输出完整|产物|代码|网页|网站|页面|系统/i,
  /改成|改一下|修改|替换|应用到|写入|更新|继续做|继续执行|按这个做/i,
  /\b(build|create|generate|make|develop|implement|fix|deploy|run|execute|refactor|update)\b/i,
];

const QUOTE_CHAT_HINTS = [
  /什么意思|什么含义|解释|说明|为什么|怎么理解|这是什么|这个呢|这段呢|有问题吗|怎么看|对吗|是不是|可以吗|行吗/i,
  /\b(what|why|explain|meaning|means|understand)\b/i,
];

export interface ComposerQuoteIntent {
  hasQuote: boolean;
  quoteOnly: boolean;
  promptText: string;
  quotedText: string;
  shouldExecute: boolean;
}

function compactLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function parseComposerQuoteIntent(text: string): ComposerQuoteIntent {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const promptLines: string[] = [];
  const quoteLines: string[] = [];
  let hasQuote = false;
  let insideQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (QUOTE_HEADER_RE.test(trimmed)) {
      hasQuote = true;
      insideQuote = true;
      continue;
    }

    if (insideQuote && /^>\s?/.test(trimmed)) {
      quoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    if (insideQuote && !trimmed) continue;
    promptLines.push(line);
  }

  const promptText = compactLines(promptLines);
  const quotedText = compactLines(quoteLines);
  const shouldExecute = hasQuote && QUOTE_EXECUTION_HINTS.some((pattern) => pattern.test(promptText));

  return {
    hasQuote,
    quoteOnly: hasQuote && !promptText,
    promptText,
    quotedText,
    shouldExecute,
  };
}

export function isContextualQuoteChat(text: string): boolean {
  const quote = parseComposerQuoteIntent(text);
  if (!quote.hasQuote || quote.shouldExecute) return false;
  if (quote.quoteOnly) return true;
  if (QUOTE_CHAT_HINTS.some((pattern) => pattern.test(quote.promptText))) return true;
  return quote.promptText.length <= 80 && !TASK_PATTERNS.some((pattern) => pattern.test(quote.promptText));
}

export function isSimpleChat(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 80) return false;
  if (TASK_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (trimmed.length <= 15 && trimmed.split(/\s+/).length <= 5 && !/[，。；：！？、]/.test(trimmed)) return true;
  return false;
}

export function isLightweightMentionChat(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (MENTION_QUESTION_CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (MENTION_TASK_HINTS.some((pattern) => pattern.test(trimmed))) return false;
  if (LIGHTWEIGHT_MENTION_CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return trimmed.length <= 12 && trimmed.split(/\s+/).length <= 4 && !/[，。；：！？、,.!?]/.test(trimmed);
}

export function isArtifactGenerationTask(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  if (ARTIFACT_COMPLAINT_HINTS.some((pattern) => pattern.test(text))) return false;
  if (COMPLEX_INDICATORS.some((keyword) => lower.includes(keyword))) return false;

  const hasBuildAction = BUILD_ACTIONS.some((keyword) => lower.includes(keyword))
    || BUILD_ACTION_HINTS.some((pattern) => pattern.test(text));
  const deliverableHits = DELIVERABLE_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  const hasCodeFenceHint = /(?:\.html|\.tsx?|\.jsx?|<!doctype|<html|canvas|代码)/i.test(text);

  const hasArtifactRequestHint = ARTIFACT_REQUEST_HINTS.some((pattern) => pattern.test(text));

  return hasBuildAction && (deliverableHits >= 1 || hasCodeFenceHint || hasArtifactRequestHint);
}

export function isDeliverableGenerationTask(text: string): boolean {
  const normalized = text
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, "")
    .trim();
  if (!normalized) return false;
  if (DELIVERABLE_COMPLAINT_HINTS.some((pattern) => pattern.test(normalized))) return false;

  const hasAction = BUILD_ACTIONS.some((keyword) => normalized.toLowerCase().includes(keyword.toLowerCase()))
    || BUILD_ACTION_HINTS.some((pattern) => pattern.test(normalized))
    || /重新生成|重新写|重新整理|补一份|补充一份|输出|导出/.test(normalized);
  const hasDeliverable = DELIVERABLE_REQUEST_HINTS.some((pattern) => pattern.test(normalized));

  return hasAction && hasDeliverable;
}
