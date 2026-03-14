# 🚀 ApexSales AI 销售闭环系统 (v0.0.2)

## 📖 项目简介
ApexSales AI 是一个面向销售场景的 **AI 全链路工作流系统 (MVP)**。系统旨在打通从“客户沟通录音”到“业务系统演示 (POC)”，再到“合同自动生成”的完整闭环。本项目以快速演示和高可用性为目标，通过轻量级架构实现核心业务的落地，辅助销售一键生成结构化需求、可交互前端页面及精准报价合同。


---

## 🛠️ 技术栈选型

* **前端 (Frontend):** React / Next.js (`App Router`), `@ricky0123/vad-web` (语音端点检测), iframe (POC 沙箱渲染)
* **后端 (Backend):** FastAPI (单文件主逻辑), Pydantic
* **AI 与语音引擎:** * **ASR:** FunASR (SenseVoice) 为主，faster-whisper 作为离线免费降级备选
    * **声纹识别:** Resemblyzer (向量提取) + NumPy (余弦相似度计算)
    * **大模型调用:** 基于 `requests` 的标准化 LLM 接口
* **文档与文件处理:** pypdf (文本提取), reportlab (PDF 渲染)
* **存储与持久化:** 基于 `runtime_state.json` 的轻量级内存快照持久化，本地文件系统存储 PDF 资产

---

## 📂 项目目录结构

```text
.
├── backend/                   # FastAPI 后端服务
│   ├── app/
│   │   ├── main.py            # 核心业务逻辑与 API 路由
│   │   └── config.py          # 全局配置读取与环境变量定义
│   └── storage/               # 本地持久化存储目录
│       ├── knowledge/         # RAG 知识库 PDF 原文件
│       ├── contracts/         # 生成的合同 PDF 产物
│       └── runtime_state.json # 核心数据 (会话/PRD/POC/声纹) 的持久化快照
├── frontend/                  # Next.js 前端应用
│   └── src/app/
│       ├── page.tsx           # 主工作台 (语音录入/总结/PRD/合同导出)
│       └── share/
│           └── [uuid]/page.tsx# POC 分享直开页 (免登录独立访问)
└── README.md
```

---

## ✨ 核心模块设计

### 1. 🎙️ 语音采集与高可用转写
* **前端 VAD 切片:** 浏览器端监听麦克风，利用 VAD 识别说话停顿，自动将音频编码为 `audio/wav` 格式上传，大幅降低后端流式并发压力。
* **双引擎 ASR 与自动降级:** 默认使用 FunASR 提取高精度文本；当服务不可用时，系统支持自动降级 (`ASR_PROVIDER=auto`) 到本地 faster-whisper 引擎。
* **1v1 角色分离:** 结合注册的销售声纹向量，在转写时实时计算余弦相似度，按阈值自动打上“销售”或“客户”标签。

### 2. 📚 极简 RAG 知识检索 (P0 特性)
* **右侧边栏知识库管理:** 前端提供专属上传界面，支持产品文档、报价单（PDF）的上传与归档。
* **轻量化向量构建:** 后台自动提取页面文本 (`pypdf`) 并进行切片，映射为 256 维稀疏向量。
* **检索增强注入:** 生成 PRD 与合同时，基于 query 进行余弦相似度检索，将 TopK 片段注入 LLM 上下文，确保报价等核心数据**绝对可溯源，拒绝 AI 幻觉**。

### 3. 📝 会后总结与 PRD 编辑
* **结构化总结:** LLM 基于会话片段与 RAG 来源，生成包含溯源段落的 Markdown PRD。
* **前端人工校阅:** 前端提供可编辑的 PRD 区域，允许用户进行人工干预并保存至数据库。

### 4. 💻 动态 POC 代码生成与分享 (独立 H5 方案)
* **动态 HTML 生成:** 弃用复杂环境依赖，利用 LLM 拼接 Prompt，根据 PRD 直接生成一份单文件 HTML（依赖项通过 CDN 获取）。
* **即时渲染与直开分享:** 前端通过 `iframe` 嵌入该 HTML 文件实现安全渲染。持久化生成 `share_uuid`，客户无需登录，访问短链即可直接体验演示页面。

### 5. 📄 结构化合同导出
* **报价字段提取:** 结合定稿的 PRD 和 RAG 检索结果，提取结构化报价（单价/数量/税率/总价/付款节点）。
* **PDF 自动化渲染:** 使用 `reportlab` 将结构化报价注入合同模板，渲染为规范的 PDF 文件并提供稳定下载链接。

---

## 🔌 API 接口全览

### 基础与配置
* `GET /health`：健康检查。
* *(前端面板)* 左侧弹框 LLM 配置：支持读取 `.env` 并允许用户修改，优先级为 `数据库 > env默认配置`。

### 语音与转写
* `POST /voice/register`：注册销售声纹向量。
* `POST /voice/verify`：验证当前音频说话人身份。
* `POST /asr/transcribe`：音频切片转写（传入 `sales_id` 触发声纹比对）。

### 会话与总结 (PRD)
* `GET /session/{session_id}/utterances`：拉取会话逐字稿。
* `POST /session/{session_id}/summary`：基于逐字稿（及 RAG）生成 PRD。
* `POST /prd/{prd_id}/save`：前端修改 PRD 后保存。

### 知识库 (RAG)
* `POST /knowledge/upload`：上传 PDF 至知识库。
* `POST /knowledge/retrieve`：基于业务标签检索 TopK 知识片段。
* `POST /knowledge/reindex/{document_id}`：触发文档的切片与向量化重建。

### POC 与合同
* `POST /prd/{prd_id}/poc`：生成独立 H5 POC 代码并建立分享映射。
* `GET /poc/{share_uuid}`：通过短链获取 POC 内容。
* `POST /contract/{prd_id}`：结合 RAG 生成包含结构化报价的合同 PDF。
* `GET /contract/{contract_id}/download`：下载生成的合同文件。

---

## 🔄 端到端核心工作流

1. **录音与解析**: 麦克风采集 -> VAD 切片 -> `/asr/transcribe` (结合声纹) -> 生成带有角色的逐字稿。
2. **知识检索**: 系统根据逐字稿内容调用 `/knowledge/retrieve` 检索相关报价与产品文档。
3. **PRD 生成**: LLM 结合逐字稿与 RAG 资料，生成包含引用来源的 PRD 草稿 -> 销售进行在线编辑与保存。
4. **POC 演示**: 点击生成 POC -> LLM 输出独立 HTML 代码 -> 前端 `iframe` 渲染 -> 生成专属 `share_uuid` 发送给客户。
5. **合同缔结**: 确认需求后，系统结合最新 PRD 与 RAG 知识 -> 生成结构化合同 -> 导出 PDF 发送。

---

## ⚙️ 核心配置说明 (`config.py` & `.env`)

| 配置模块 | 关键环境变量 | 描述 |
| :--- | :--- | :--- |
| **基础配置** | `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` | 大模型的基础调用配置（前端左侧面板可覆盖） |
| **语音引擎** | `ASR_PROVIDER` | `funasr` / `whisper` / `auto` (自动降级) |
| | `SPEAKER_SIM_THRESHOLD` | 区分销售与客户的声纹相似度阈值 |
| **文件路径** | `POC_RULE_TEMPLATE_PATH` | POC 基础模板文件路径 |
| | `CONTRACT_TEMPLATE_PATH` | 合同生成排版模板路径 |

---

## 🚀 快速启动

1.  **克隆与环境安装:**
```bash
pip install -r backend/requirements.txt
cd frontend && npm install
```

2.  **配置环境变量:**
复制 `.env.example` 为 `.env` 文件，填入必要的 LLM 密钥等配置。

3.  **启动服务:**
```bash
# 启动后端 (Terminal 1)
cd backend
uvicorn app.main:app --reload --port 8000

# 启动前端 (Terminal 2)
cd frontend
npm run dev
```