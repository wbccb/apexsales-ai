# 规划总览
- 功能范围（对齐 v0.0.2）：RAG 知识库上传与检索增强 → 核心数据真实落库 → 分享直开与合同结构化报价增强。
- 优先级原则：P0（RAG） > P1（真实落库） > P2（体验增强）。
- 边界假设：保持 v0.0.1 接口兼容，先完成可用与可追溯，再做性能与体验优化。

## 里程碑与开发顺序
- 阶段一（P0-RAG 基础链路）：文档上传、切片向量化、检索接口、状态机跑通。
- 阶段二（P0-RAG 总结注入）：summary 接口接入检索上下文并输出 citations。
- 阶段三（P1-真实落库）：核心实体持久化，路由切换到 Repository，重启恢复验证。
- 阶段四（P2-体验增强）：分享页直开、合同结构化报价渲染与导出。

## 功能清单与验收标准（v0.0.2 最小可用）
- `POST /knowledge/upload`：上传 PDF 成功返回 `document_id` 与初始状态。
- `GET /knowledge/documents`：可按状态查询文档列表。
- `POST /knowledge/reindex/{document_id}`：失败文档可重建索引。
- `POST /knowledge/retrieve`：返回 TopK 片段与来源信息（document_id/chunk_id/page_no）。
- `POST /session/{session_id}/summary`：在保留 `prd_id/markdown` 的前提下，新增 `citations/rag_used`。
- 核心实体落库：users/sessions/utterances/prds/pocs/contracts/voice_profiles/knowledge_documents/knowledge_chunks。
- `/poc/{share_uuid}`：服务重启后依然可读取已生成 POC。
- `/contract/{contract_id}/download`：服务重启后依然可下载历史合同。
- 分享页：客户访问 `/share/{uuid}` 无需手输 UUID 直接看到 POC。
- 合同导出：PDF 包含结构化报价字段（单价/数量/税率/总价/付款节点）。

## 阶段化任务规划（建议执行顺序）
- 第 1-3 天（阶段一：P0-RAG 基础）
  - 后端新增 knowledge 四接口与文档状态机。
  - 对接对象存储与向量库，完成切片与 embedding 入库。
  - 完成文档列表查询与索引重建能力。
- 第 4-5 天（阶段二：P0-RAG 注入）
  - summary 接口接入检索，生成 PRD 时注入上下文。
  - 增加 citations 存储与返回字段。
  - 前端展示引用来源与基础错误提示。
- 第 6-8 天（阶段三：P1-真实落库）
  - 新建核心表结构与索引。
  - 引入 Repository 层，逐步替换内存态读写。
  - 验证重启恢复、分享稳定性、合同历史可访问。
- 第 9-10 天（阶段四：P2-体验增强）
  - 新增分享直开页 `/share/{uuid}`。
  - 合同模板增加结构化报价字段渲染。
  - 完成端到端回归验收。

## 风险点与缓解
- RAG 召回偏差：优化切片参数与 TopK，必要时增加重排序。
- 文档处理失败率：提供状态机 + 重试 + 手动重建接口兜底。
- 持久化迁移风险：通过 Repository 抽象与 feature flag 进行灰度切换。
- 历史兼容风险：保持既有接口路径与核心响应字段不变。
