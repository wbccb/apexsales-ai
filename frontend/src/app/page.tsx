"use client"

import { useCallback, useEffect, useState } from "react"
import { StageContract } from "./stage-contract"
import { StagePoc } from "./stage-poc"
import { StagePrd } from "./stage-prd"
import { StageVoice } from "./stage-voice"

type ModelConfig = {
  stage: string
  base_url: string
  model_name: string
  api_key: string
}

type ModelField = "base_url" | "model_name" | "api_key"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

const MODEL_STAGES = [
  { key: "voice", label: "阶段一：语音" },
  { key: "prd", label: "阶段二：PRD" },
  { key: "poc", label: "阶段三：POC" },
  { key: "contract", label: "阶段四：合同" }
]

function buildEmptyConfig(stage: string): ModelConfig {
  return { stage, base_url: "", model_name: "", api_key: "" }
}

function buildConfigState(configs: unknown): Record<string, ModelConfig> {
  const next: Record<string, ModelConfig> = {}
  MODEL_STAGES.forEach(({ key }) => {
    next[key] = buildEmptyConfig(key)
  })
  if (!Array.isArray(configs)) {
    return next
  }
  configs.forEach((item) => {
    if (!item || typeof item !== "object") {
      return
    }
    const payload = item as Partial<ModelConfig>
    const stage = typeof payload.stage === "string" ? payload.stage : ""
    if (!stage) {
      return
    }
    next[stage] = {
      stage,
      base_url: typeof payload.base_url === "string" ? payload.base_url : "",
      model_name: typeof payload.model_name === "string" ? payload.model_name : "",
      api_key: typeof payload.api_key === "string" ? payload.api_key : ""
    }
  })
  return next
}

async function readErrorMessage(response: Response) {
  try {
    const data = await response.json()
    if (typeof data?.detail === "string" && data.detail) {
      return data.detail
    }
  } catch {
  }
  return `接口返回 ${response.status}`
}

export default function Home() {
  const [sessionId, setSessionId] = useState("")
  const [prdId, setPrdId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>(
    () => buildConfigState([])
  )
  const [modelLoading, setModelLoading] = useState(false)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelSuccess, setModelSuccess] = useState<string | null>(null)

  // Knowledge base state
  const [knowledgeDrawerOpen, setKnowledgeDrawerOpen] = useState(false)
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [businessTag, setBusinessTag] = useState("")

  const fetchModelConfigs = useCallback(async () => {
    setModelLoading(true)
    setModelError(null)
    try {
      const response = await fetch(`${API_BASE}/model-configs`)
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      const data = await response.json()
      setModelConfigs(buildConfigState(data?.configs))
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setModelError(message)
    } finally {
      setModelLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModelConfigs()
  }, [fetchModelConfigs])

  const saveModelConfigs = useCallback(async () => {
    setModelSaving(true)
    setModelError(null)
    setModelSuccess(null)
    try {
      const payload = {
        configs: MODEL_STAGES.map(({ key }) => modelConfigs[key] ?? buildEmptyConfig(key))
      }
      const response = await fetch(`${API_BASE}/model-configs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      const data = await response.json()
      setModelConfigs(buildConfigState(data?.configs))
      setModelSuccess("已保存模型配置")
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setModelError(message)
    } finally {
      setModelSaving(false)
    }
  }, [modelConfigs])

  const fetchKnowledgeDocs = useCallback(async () => {
    setKnowledgeLoading(true)
    try {
      const response = await fetch(`${API_BASE}/knowledge/documents?page_size=100`)
      if (response.ok) {
        const data = await response.json()
        setKnowledgeDocs(data.documents || [])
      }
    } catch {
      // ignore
    } finally {
      setKnowledgeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (knowledgeDrawerOpen) {
      fetchKnowledgeDocs()
    }
  }, [knowledgeDrawerOpen, fetchKnowledgeDocs])

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", uploadFile)
      if (businessTag) {
        formData.append("business_tag", businessTag)
      }
      const response = await fetch(`${API_BASE}/knowledge/upload`, {
        method: "POST",
        body: formData
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      setUploadFile(null)
      setBusinessTag("")
      fetchKnowledgeDocs()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败"
      alert(msg)
    } finally {
      setUploading(false)
    }
  }

  const updateModelField = useCallback((stage: string, field: ModelField, value: string) => {
    setModelConfigs((prev) => {
      const current = prev[stage] ?? buildEmptyConfig(stage)
      return {
        ...prev,
        [stage]: {
          ...current,
          stage,
          [field]: value
        }
      }
    })
  }, [])

  return (
    <div className="min-h-screen">
      <div
        className={`fixed inset-0 z-40 ${drawerOpen ? "" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-slate-950/70 transition-opacity ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-[360px] border-r border-slate-800 bg-slate-900 p-6 shadow-2xl transition-transform ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">模型配置</div>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
              onClick={() => setDrawerOpen(false)}
            >
              关闭
            </button>
          </div>
          {/* ... Model Config Content ... */}
          <div className="mt-2 text-xs text-slate-400">
            为不同阶段设置 BASE_URL、MODEL_NAME、API_KEY
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
              onClick={fetchModelConfigs}
              disabled={modelLoading}
            >
              {modelLoading ? "加载中..." : "刷新"}
            </button>
            <button
              className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-medium text-white"
              onClick={saveModelConfigs}
              disabled={modelSaving}
            >
              {modelSaving ? "保存中..." : "保存"}
            </button>
          </div>
          {modelError ? (
            <div className="mt-4 rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {modelError}
            </div>
          ) : null}
          {modelSuccess ? (
            <div className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              {modelSuccess}
            </div>
          ) : null}
          <div className="mt-6 grid gap-4">
            {MODEL_STAGES.map((stage) => {
              const config = modelConfigs[stage.key] ?? buildEmptyConfig(stage.key)
              return (
                <div
                  key={stage.key}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="text-sm font-medium text-slate-100">{stage.label}</div>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-2">
                      <label className="text-xs text-slate-400">BASE_URL</label>
                      <input
                        value={config.base_url}
                        onChange={(event) =>
                          updateModelField(stage.key, "base_url", event.target.value)
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                        placeholder="https://api.example.com/v1/chat/completions"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs text-slate-400">MODEL_NAME</label>
                      <input
                        value={config.model_name}
                        onChange={(event) =>
                          updateModelField(stage.key, "model_name", event.target.value)
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs text-slate-400">API_KEY</label>
                      <input
                        type="password"
                        value={config.api_key}
                        onChange={(event) =>
                          updateModelField(stage.key, "api_key", event.target.value)
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                        placeholder="sk-***"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Drawer: Knowledge Base */}
      <div
        className={`fixed inset-0 z-40 ${knowledgeDrawerOpen ? "" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-slate-950/70 transition-opacity ${
            knowledgeDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setKnowledgeDrawerOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-[400px] border-l border-slate-800 bg-slate-900 p-6 shadow-2xl transition-transform ${
            knowledgeDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">知识库管理</div>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
              onClick={() => setKnowledgeDrawerOpen(false)}
            >
              关闭
            </button>
          </div>
          
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="text-sm font-medium text-slate-100">上传文档 (PDF)</h3>
            <div className="mt-3 grid gap-3">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-300"
              />
              <input
                type="text"
                value={businessTag}
                onChange={(e) => setBusinessTag(e.target.value)}
                placeholder="业务标签 (可选)"
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
              />
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
              >
                {uploading ? "上传中..." : "上传并建立索引"}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">文档列表</h3>
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300"
                onClick={fetchKnowledgeDocs}
                disabled={knowledgeLoading}
              >
                刷新
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {knowledgeLoading && knowledgeDocs.length === 0 ? (
                <div className="text-xs text-slate-500">加载中...</div>
              ) : null}
              {!knowledgeLoading && knowledgeDocs.length === 0 ? (
                <div className="text-xs text-slate-500">暂无文档</div>
              ) : null}
              {knowledgeDocs.map((doc) => (
                <div
                  key={doc.document_id}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-slate-200 break-all">
                      {doc.filename}
                    </div>
                    <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      doc.status === 'ready' ? 'bg-emerald-500/20 text-emerald-300' :
                      doc.status === 'failed' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {doc.status}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <div>切片: {doc.chunk_count}</div>
                    <div>{new Date(doc.created_at).toLocaleString()}</div>
                  </div>
                  {doc.error_message ? (
                    <div className="mt-2 text-[10px] text-rose-400">
                      {doc.error_message}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">销售 AI 闭环系统</h1>
            <p className="text-slate-300">
              语音切片、实时对话、PRD 生成、POC 渲染、合同导出
            </p>
          </div>
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100"
            onClick={() => setDrawerOpen(true)}
          >
            模型配置
          </button>
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100"
            onClick={() => setKnowledgeDrawerOpen(true)}
          >
            知识库管理
          </button>
        </header>
        <StageVoice sessionId={sessionId} setSessionId={setSessionId} />
        <StagePrd
          sessionId={sessionId}
          setSessionId={setSessionId}
          prdId={prdId}
          setPrdId={setPrdId}
        />
        <StagePoc prdId={prdId} />
        <StageContract prdId={prdId} />
      </main>
    </div>
  )
}
