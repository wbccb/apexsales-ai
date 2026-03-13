"use client"

import { useCallback, useState } from "react"

type StagePocProps = {
  prdId: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

export function StagePoc({ prdId }: StagePocProps) {
  const [pocLoading, setPocLoading] = useState(false)
  const [pocError, setPocError] = useState<string | null>(null)
  const [pocCode, setPocCode] = useState<string>("")
  const [pocShareUuid, setPocShareUuid] = useState<string>("")
  const [shareInput, setShareInput] = useState<string>("")

  const generatePoc = useCallback(async () => {
    if (!prdId) {
      setPocError("请先生成 PRD")
      return
    }
    setPocLoading(true)
    setPocError(null)
    try {
      const response = await fetch(`${API_BASE}/prd/${prdId}/poc`, {
        method: "POST"
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      setPocCode(data.code)
      setPocShareUuid(data.share_uuid)
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setPocError(message)
    } finally {
      setPocLoading(false)
    }
  }, [prdId])

  const loadSharePoc = useCallback(async () => {
    if (!shareInput.trim()) {
      setPocError("请填写分享 UUID")
      return
    }
    setPocLoading(true)
    setPocError(null)
    try {
      const response = await fetch(`${API_BASE}/poc/${shareInput.trim()}`)
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      setPocCode(data.code)
      setPocShareUuid(shareInput.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setPocError(message)
    } finally {
      setPocLoading(false)
    }
  }, [shareInput])

  return (
    <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-medium">阶段三：POC 生成与预览</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-purple-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={generatePoc}
          disabled={pocLoading}
        >
          {pocLoading ? "生成中..." : "生成 POC"}
        </button>
        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1">
           <input
            value={shareInput}
            onChange={(event) => setShareInput(event.target.value)}
            placeholder="分享 UUID"
            className="w-24 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            onClick={loadSharePoc}
            disabled={pocLoading}
          >
            加载
          </button>
        </div>
        {pocShareUuid ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">分享码: {pocShareUuid}</span>
            <a
              href={`/share/${pocShareUuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300 underline"
            >
              打开直开页
            </a>
          </div>
        ) : null}
      </div>

      {pocError ? (
        <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {pocError}
        </div>
      ) : null}

      {pocCode ? (
        <div className="grid h-[600px] grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            <div className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-400">
              HTML 源码
            </div>
            <textarea
              className="flex-1 resize-none bg-transparent p-4 font-mono text-xs text-slate-300 outline-none"
              value={pocCode}
              readOnly
            />
          </div>
          <div className="flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              预览 (Iframe)
            </div>
            <iframe
              srcDoc={pocCode}
              className="flex-1 border-0 w-full"
              title="POC Preview"
              sandbox="allow-scripts allow-modals"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-800 text-slate-500">
          暂无 POC 代码，请先生成
        </div>
      )}
    </section>
  )
}
