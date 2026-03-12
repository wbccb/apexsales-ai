# v0.0.3 开发记录

## 需求列表

1. **LLM 配置管理**：左侧弹框配置 LLM (BASE_URL, MODEL_NAME, API_KEY)，支持 Env 文件默认值与数据库持久化（优先级：DB > Env）。
2. **RAG 知识库前端**：右侧弹框增加知识库管理界面（上传 PDF、列表展示）。
3. **POC 生成升级**：将 PRD 转 POC 的逻辑改为生成独立 H5 原型（高保真、可交互），前端通过 iframe 预览，不再依赖 Sandpack。
4. **合同生成升级**：基于 PRD + RAG 检索，使用 LLM 生成合同内容。

## 开发进度

- [x] LLM 配置管理
- [x] RAG 知识库前端
- [x] POC 生成升级 (H5 + iframe)
- [x] 合同生成升级 (LLM + RAG)

## 技术实现细节

### 1. LLM 配置管理
- **后端**：增加 `/model-configs` GET/POST 接口，使用 `model_configs_by_stage` 存储配置并在 `runtime_state.json` 中持久化。
- **前端**：`frontend/src/app/page.tsx` 增加左侧 Drawer，支持配置 Voice/PRD/POC/Contract 四个阶段的模型参数。
- **配置加载**：后端优先读取 DB 配置，若无则降级读取 `.env` 文件（通过 `APEXSALES_ENV_PATH` 指定或默认位置）。

### 2. RAG 知识库前端
- **后端**：复用 `/knowledge/upload` (上传PDF) 和 `/knowledge/documents` (列表) 接口。
- **前端**：`frontend/src/app/page.tsx` 增加右侧 Drawer（通过“知识库管理”按钮触发），实现文件上传、业务标签录入及文档状态列表展示。

### 3. POC 生成升级
- **Prompt 调整**：修改 `get_poc_prompt_template`，明确要求生成**功能性 H5 原型**（Mobile-First, Tailwind CSS, Vue/JS 交互），严禁生成文档阅读器。
- **后端逻辑**：`generate_poc_code_llm` 增加 Markdown 代码块剥离逻辑，确保返回纯 HTML；新增 `poc_rule_template.html` 作为 Rule 模式的通用原型框架（包含 Tab 切换与 Mock 交互）。
- **前端预览**：`StagePoc` 组件移除 Sandpack，改用 `iframe` (`srcDoc`) 直接渲染 HTML；分享页同步改为 `iframe` 全屏预览。

### 4. 合同生成升级
- **Prompt 新增**：新增 `get_contract_prompt_template`，指导 LLM 生成包含结构化报价的专业合同 Markdown。
- **后端逻辑**：
  - 新增 `generate_contract_llm` 函数，支持通过 `/model-configs` 配置的 Contract 模型调用。
  - 修改 `generate_contract` 接口：先基于 PRD 内容 (前500字符) 进行 RAG 检索，再调用 LLM 生成合同正文。
  - 保留 `extract_quote_payload` 用于元数据提取，PDF 渲染沿用 ReportLab 生成。
