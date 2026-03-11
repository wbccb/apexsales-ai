"use client"

import { Dispatch, SetStateAction, useCallback, useState } from "react"

type Citation = {
  document_id: string
  chunk_id: string
  score: number
  page_no: number | null
  snippet: string
  content?: string
}

type StagePrdProps = {
  sessionId: string
  setSessionId: Dispatch<SetStateAction<string>>
  prdId: string | null
  setPrdId: Dispatch<SetStateAction<string | null>>
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

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

export function StagePrd({ sessionId, setSessionId, prdId, setPrdId }: StagePrdProps) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [ragEnabled, setRagEnabled] = useState(true)
  const [ragTopK, setRagTopK] = useState(5)
  const [ragUsed, setRagUsed] = useState(false)
  const [citations, setCitations] = useState<Citation[]>([])
  const [prdMarkdown, setPrdMarkdown] = useState<string>("")
  const [editedMarkdown, setEditedMarkdown] = useState<string>("")
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [mockLoading, setMockLoading] = useState(false)
  const [mockResult, setMockResult] = useState<string | null>(null)
  const [retrievalQuery, setRetrievalQuery] = useState("")
  const hitChunkCount = citations.length

  const ensureSessionId = useCallback(() => {
    if (sessionId) {
      return sessionId
    }
    const nextSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`
    setSessionId(nextSessionId)
    return nextSessionId
  }, [sessionId, setSessionId])

  const requestSummary = useCallback(
    async (resolvedSessionId: string) => {
      const response = await fetch(
        `${API_BASE}/session/${resolvedSessionId}/summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            rag_enabled: ragEnabled,
            top_k: ragTopK
          })
        }
      )
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      const data = await response.json()
      setPrdId(data.prd_id)
      setPrdMarkdown(data.markdown)
      setEditedMarkdown(data.markdown)
      setRagUsed(Boolean(data.rag_used))
      setCitations(Array.isArray(data.citations) ? data.citations : [])
      setRetrievalQuery(typeof data.retrieval_query === "string" ? data.retrieval_query : "")
    },
    [ragEnabled, ragTopK, setPrdId]
  )

  const generateSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    setSaveResult(null)
    setMockResult(null)
    try {
      const resolvedSessionId = ensureSessionId()
      await requestSummary(resolvedSessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setSummaryError(message)
    } finally {
      setSummaryLoading(false)
    }
  }, [ensureSessionId, requestSummary])

  const seedMockAndGenerateSummary = useCallback(async () => {
    setMockLoading(true)
    setSummaryError(null)
    setSaveResult(null)
    try {
      const resolvedSessionId = ensureSessionId()
      const mockResponse = await fetch(
        `${API_BASE}/session/${resolvedSessionId}/mock-utterances`,
        { method: "POST" }
      )
      if (!mockResponse.ok) {
        throw new Error(await readErrorMessage(mockResponse))
      }
      const mockData = await mockResponse.json()
      const utteranceCount = Array.isArray(mockData.utterances) ? mockData.utterances.length : 0
      setMockResult(`已注入 ${utteranceCount} 条 mock 对话（会话 ${resolvedSessionId}）`)
      setSummaryLoading(true)
      await requestSummary(resolvedSessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setSummaryError(message)
    } finally {
      setSummaryLoading(false)
      setMockLoading(false)
    }
  }, [ensureSessionId, requestSummary])

  const savePrd = useCallback(async () => {
    if (!prdId) {
      setSaveResult("请先生成总结")
      return
    }
    setSaveLoading(true)
    setSaveResult(null)
    try {
      const response = await fetch(`${API_BASE}/prd/${prdId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ edited_markdown: editedMarkdown })
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      setSaveResult("已保存 PRD 修改")
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setSaveResult(message)
    } finally {
      setSaveLoading(false)
    }
  }, [editedMarkdown, prdId])

  return (
    <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-medium">阶段二：PRD 总结与编辑</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-medium text-white"
          onClick={generateSummary}
          disabled={summaryLoading || mockLoading}
        >
          {summaryLoading ? "生成中..." : "生成总结"}
        </button>
        <button
          className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white"
          onClick={seedMockAndGenerateSummary}
          disabled={mockLoading || summaryLoading}
        >
          {mockLoading ? "注入中..." : "注入 Mock 并生成总结"}
        </button>
        <button
          className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white"
          onClick={savePrd}
          disabled={saveLoading}
        >
          {saveLoading ? "保存中..." : "保存 PRD"}
        </button>
        <div className="text-sm text-slate-300">
          {prdId ? `当前 PRD：${prdId}` : "未生成 PRD"}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={ragEnabled}
            onChange={(event) => setRagEnabled(event.target.checked)}
          />
          启用 RAG
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={ragTopK}
          onChange={(event) => setRagTopK(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
          className="w-24 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
          placeholder="TopK"
        />
      </div>
      {summaryError ? (
        <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {summaryError}
        </div>
      ) : null}
      {saveResult ? (
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {saveResult}
        </div>
      ) : null}
      {mockResult ? (
        <div className="rounded-lg border border-violet-600/40 bg-violet-500/10 p-3 text-sm text-violet-200">
          {mockResult}
        </div>
      ) : null}
      <div className="grid gap-3">
        <div className="text-sm text-slate-400">生成结果</div>
        <textarea
          value={editedMarkdown}
          onChange={(event) => setEditedMarkdown(event.target.value)}
          placeholder="点击生成总结后可编辑 PRD 内容"
          className="min-h-[240px] w-full rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-100"
        />
        {prdMarkdown ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
            已生成原始 PRD，可在上方编辑并保存
          </div>
        ) : null}
        {prdMarkdown ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
            {ragUsed ? `本次总结已使用 RAG 检索结果，命中 ${hitChunkCount} 个 chunk` : "本次总结未命中可用检索结果"}
          </div>
        ) : null}
        {prdMarkdown && ragEnabled ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
            <div className="text-slate-400">RAG 检索 Query（由当前会话逐字稿拼接）</div>
            <div className="mt-1 whitespace-pre-wrap break-all">
              {retrievalQuery || "当前暂无可展示的检索 Query"}
            </div>
          </div>
        ) : null}
        {prdMarkdown && ragUsed ? (
          <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">
              命中 Chunk 列表（共 {hitChunkCount} 个）
            </div>
            {citations.map((item, index) => (
              <div key={item.chunk_id} className="rounded border border-slate-800 p-2 text-xs text-slate-300">
                <div>
                  #{index + 1} doc={item.document_id}
                </div>
                <div>
                  chunk={item.chunk_id}
                </div>
                <div>
                  page={item.page_no ?? "-"}
                </div>
                <div>
                  score={Number(item.score).toFixed(4)}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-slate-400">
                  命中内容为：{item.content || item.snippet || "无内容"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
