"use client"

import { useCallback, useEffect, useState } from "react"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

type ModelConfig = {
  stage: string
  base_url: string
  model_name: string
  api_key: string
}

type ModelField = "base_url" | "model_name" | "api_key"

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

type ModelConfigDrawerProps = {
  open: boolean
  onClose: () => void
}

export function ModelConfigDrawer({ open, onClose }: ModelConfigDrawerProps) {
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>(
    () => buildConfigState([])
  )
  const [modelLoading, setModelLoading] = useState(false)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelSuccess, setModelSuccess] = useState<string | null>(null)

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
    <div
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        className={`absolute inset-0 bg-slate-950/70 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 top-0 h-full w-[360px] border-r border-slate-800 bg-slate-900 p-6 shadow-2xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">模型配置</div>
          <button
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
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
  )
}
