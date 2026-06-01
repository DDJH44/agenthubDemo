# AgentHub 简单任务示例

## 任务描述
创建一个简单的个人博客网站，包含以下功能：
1. 首页展示文章列表
2. 文章详情页
3. 关于页面
4. 响应式设计

## 使用方法

### 1. 启动项目
```bash
npm run dev:all
```

### 2. 打开浏览器
访问 http://localhost:3000

### 3. 创建会话
点击"新建会话"按钮，创建一个新的对话

### 4. 发送任务
在对话框中输入：
```
帮我创建一个个人博客网站，包含首页、文章详情页和关于页面，要求响应式设计
```

### 5. 查看执行过程
- 智能体会自动拆解任务
- 观察任务执行流程
- 查看生成的代码

### 6. 预览结果
- 点击"预览"标签页
- 查看生成的 HTML 页面
- 测试响应式设计

## 示例输出

### 生成的 HTML 文件
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的博客</title>
    <style>
        /* 响应式样式 */
    </style>
</head>
<body>
    <header>
        <nav>...</nav>
    </header>
    <main>
        <article>...</article>
    </main>
    <footer>...</footer>
</body>
</html>
```

### 生成的 CSS 文件
```css
/* 响应式设计 */
@media (max-width: 768px) {
    .container {
        padding: 0 15px;
    }
}
```

## 测试要点

1. **功能测试**
   - 页面加载正常
   - 链接跳转正常
   - 表单提交正常

2. **响应式测试**
   - 桌面端显示正常
   - 平板端显示正常
   - 手机端显示正常

3. **性能测试**
   - 页面加载速度快
   - 图片加载正常
   - 动画流畅

## 扩展功能

1. **添加评论系统**
   - 集成第三方评论服务
   - 支持 Markdown 语法

2. **添加搜索功能**
   - 全文搜索
   - 标签筛选

3. **添加后台管理**
   - 文章管理
   - 评论管理
   - 用户管理

## 注意事项

1. 确保后端服务正常运行
2. 检查 WebSocket 连接状态
3. 查看浏览器控制台是否有错误
4. 测试不同浏览器的兼容性

## 故障排除

### 问题1：页面加载失败
**解决方案**：
- 检查前端服务是否运行
- 检查端口是否被占用
- 查看浏览器控制台错误信息

### 问题2：WebSocket 连接失败
**解决方案**：
- 检查后端服务是否运行
- 检查防火墙设置
- 查看后端日志

### 问题3：智能体响应超时
**解决方案**：
- 检查 LLM API 配置
- 检查网络连接
- 查看后端日志

## 性能优化建议

1. **代码分割**
   - 使用动态导入
   - 按路由分割代码

2. **图片优化**
   - 使用 WebP 格式
   - 懒加载图片

3. **缓存策略**
   - 使用 CDN
   - 设置缓存头

4. **监控告警**
   - 集成 APM
   - 设置错误告警

## 下一步

1. 学习更多智能体协作技巧
2. 探索代码编辑器功能
3. 测试部署功能
4. 自定义智能体配置

## 相关资源

- [AgentHub 文档](https://github.com/agenthub/agenthub)
- [Next.js 文档](https://nextjs.org/docs)
- [WebSocket 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [响应式设计指南](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)