export interface AssistantMessageLike {
  role: "user" | "assistant";
  content: string;
}

export function isDocument(content: string): boolean {
  if (content.length < 400) return false;
  const hasHeadings = /^#{1,3}\s/m.test(content);
  const hasStructure = (content.match(/^[-*]\s|^\d+\.\s/gm) || []).length >= 3;
  return hasHeadings || hasStructure;
}

export function isDocumentRequest(query: string): boolean {
  const normalized = query.replace(/\s+/g, "");
  const complaintPatterns = [
    /为什么.*生成.*(文档|报告|方案)/,
    /为何.*生成.*(文档|报告|方案)/,
    /怎么.*生成.*(文档|报告|方案)/,
    /不是.*(要|想).*生成.*(文档|报告|方案)/,
    /不要.*生成.*(文档|报告|方案)/,
  ];
  if (complaintPatterns.some((pattern) => pattern.test(normalized))) return false;

  const deliverable = "(文档|报告|手册|方案|指南|PRD|需求|设计文档|技术文档|接口文档|用户手册|白皮书|材料|汇报|[\\u4e00-\\u9fa5A-Za-z0-9]{1,12}(报告|文档|方案|手册|指南))";
  const patterns = [
    new RegExp(`生成(一份|一个|一篇)?${deliverable}`),
    new RegExp(`写(一份|一个|一篇)?${deliverable}`),
    new RegExp(`整理(一份)?${deliverable}`),
    new RegExp(`创建(一份)?${deliverable}`),
    new RegExp(`帮我(写|生成|整理|做)(一个|一份|一篇)?${deliverable}`),
    new RegExp(`(起草|拟定|编写)(一份)?${deliverable}`),
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export function previousUserRequestedDocument(messages: AssistantMessageLike[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role === "user") return isDocumentRequest(message.content);
  }
  return false;
}

export function shouldRenderDocumentCompletion(messages: AssistantMessageLike[], index: number): boolean {
  const message = messages[index];
  return message?.role === "assistant" && isDocument(message.content) && previousUserRequestedDocument(messages, index);
}
