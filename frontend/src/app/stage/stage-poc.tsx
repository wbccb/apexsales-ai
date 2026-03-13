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
    <div className="flex flex-col gap-4 bg-white p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-medium text-gray-900">阶段三：POC 生成与预览</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
          onClick={generatePoc}
          disabled={pocLoading}
        >
          {pocLoading ? "生成中..." : "生成 POC"}
        </button>
        <div className="flex items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-3 py-1">
           <input
            value={shareInput}
            onChange={(event) => setShareInput(event.target.value)}
            placeholder="分享 UUID"
            className="w-24 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
          <button
            className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
            onClick={loadSharePoc}
            disabled={pocLoading}
          >
            加载
          </button>
        </div>
        {pocShareUuid ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">分享码: {pocShareUuid}</span>
            <a
              href={`/share/${pocShareUuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:text-indigo-500 underline"
            >
              打开直开页
            </a>
          </div>
        ) : null}
      </div>

      {pocError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {pocError}
        </div>
      ) : null}

      {pocCode ? (
        <div className="grid h-[600px] grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-gray-50">
            <div className="border-b border-gray-200 bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
              HTML 源码
            </div>
            <textarea
              className="flex-1 resize-none bg-white p-4 font-mono text-xs text-gray-800 outline-none"
              value={pocCode}
              readOnly
            />
          </div>
          <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="border-b border-gray-200 bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
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
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-500">
          暂无 POC 代码，请先生成
        </div>
      )}
    </div>
  )
}
