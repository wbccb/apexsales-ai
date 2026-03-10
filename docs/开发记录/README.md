# 规划总览
- 功能范围（来自三份文档一致结论）：浏览器语音切片采集 → ASR 转写 → 销售/客户二分声纹 → 聊天流展示 → 会后 PRD 生成与编辑 → POC 生成并 Sandpack 渲染 → 合同 PDF 导出与分享。
- 边界假设：0.5 秒停顿切片、声纹 1v1 对比、MVP 优先打通链路而非精度极致。
## 里程碑与开发顺序
- 阶段一（语音链路 MVP）：前端 VAD 切片 + 后端 /asr/transcribe + 聊天流展示。
- 阶段二（总结与编辑）：会后总结 /session/:id/summary + PRD 编辑器。
- 阶段三（POC 生成）：PRD → 代码生成 → Sandpack 渲染 + 分享短链。
- 阶段四（合同导出）：合同模板渲染 → PDF 导出链接。
## 功能清单与验收标准（最小可用）
- 前端 VAD 采集：点击麦克风后，停顿 0.5 秒触发上传；能在控制台看到切片元信息。
- /asr/transcribe：输入音频片段，返回 {speaker,text,ts}；speaker 仅为“销售/客户”二选一。
- 聊天流展示：每次接口返回即新增一条聊天记录，按时间顺序渲染。
- /voice/register：上传销售音频成功存储声纹向量。
- /session/:id/summary：返回 Markdown PRD 草稿，可在前端编辑并保存。
- /prd/:id/poc：返回可运行的 React 单页代码字符串，Sandpack 可直接渲染。
- /poc/:uuid：通过 UUID 拉取同样的代码。
- /contract/:prd_id：返回 pdf_url，前端可下载或打开。
- 数据模型：users/sessions/utterances/prds/pocs/contracts 完整落库。
## 阶段化任务规划（建议执行顺序）
- 第 1-4 天（语音链路）：VAD 切片 → ASR 接口 → 声纹二分 → 聊天流 UI。
- 第 5-8 天（总结链路）：会话聚合 → PRD Prompt → 编辑器与保存。
- 第 9-12 天（POC 链路）：代码生成 Prompt → Sandpack 渲染 → 分享短链。
- 第 13-14 天（合同链路）：合同模板渲染 → PDF 导出 → 交付闭环。
## 风险点与缓解
- ASR 速度与硬件：优先控制切片长度，必要时采用更轻量模型。
- 声纹二分误判：只用于销售/客户场景，后续再引入多说话人聚类。
- LLM 生成波动：用强约束 Prompt + 人工可编辑兜底。