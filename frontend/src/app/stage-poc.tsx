"use client"

import { SandpackCodeEditor, SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react"
import { useCallback, useState } from "react"

type StagePocProps = {
  prdId: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
const SANDBOX_BUNDLER_URL =
  process.env.NEXT_PUBLIC_SANDPACK_BUNDLER_URL ??
  "https://sandpack-bundler.codesandbox.io"

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
          className="rounded-full bg-purple-500 px-5 py-2 text-sm font-medium text-white"
          onClick={generatePoc}
          disabled={pocLoading}
        >
          {pocLoading ? "生成中..." : "生成 POC"}
        </button>
        <input
          value={shareInput}
          onChange={(event) => setShareInput(event.target.value)}
          placeholder="分享 UUID"
          className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
        />
        <button
          className="rounded-full bg-slate-700 px-4 py-2 text-xs font-medium text-white"
          onClick={loadSharePoc}
          disabled={pocLoading}
        >
          打开分享
        </button>
        <div className="text-sm text-slate-300">
          {pocShareUuid ? `当前分享：${pocShareUuid}` : "尚未生成分享"}
        </div>
        {pocShareUuid ? (
          <a
            href={`/share/${pocShareUuid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-300 underline"
          >
            打开分享页
          </a>
        ) : null}
      </div>
      {pocError ? (
        <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {pocError}
        </div>
      ) : null}
      <SandpackProvider
        template="react-ts"
        files={{
          "/App.tsx": pocCode || "export default function App(){return <div />}"
        }}
        options={{
          visibleFiles: ["/App.tsx"],
          bundlerURL: SANDBOX_BUNDLER_URL
        }}
      >
        <SandpackLayout>
          <SandpackCodeEditor style={{ height: 360 }} />
          <SandpackPreview style={{ height: 360 }} />
        </SandpackLayout>
      </SandpackProvider>
    </section>
  )
}
