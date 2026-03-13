"use client"

import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react"

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

function stripThinkContent(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

function extractMarkdownBlock(text: string) {
  const markdownBlockMatch = text.match(/```markdown\s*([\s\S]*?)```/i)
  if (markdownBlockMatch?.[1]) {
    return markdownBlockMatch[1].trim()
  }
  const genericBlockMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)```/i)
  if (genericBlockMatch?.[1]) {
    return genericBlockMatch[1].trim()
  }
  return text.trim()
}

function cleanPrdMarkdown(raw: string) {
  const withoutThink = stripThinkContent(raw)
  return extractMarkdownBlock(withoutThink)
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatInlineMarkdown(text: string) {
  const withInlineCode = text.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code class="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-100">${code}</code>`
  })
  return withInlineCode.replace(/\*\*([^*]+)\*\*/g, (_match, boldText) => {
    return `<strong class="font-semibold text-slate-100">${boldText}</strong>`
  })
}

function buildHeading(level: number, text: string) {
  const sizeClass =
    level === 1 ? "text-lg" : level === 2 ? "text-base" : level === 3 ? "text-sm" : "text-xs"
  return `<h${level} class="mt-2 ${sizeClass} font-semibold text-slate-100">${formatInlineMarkdown(
    text
  )}</h${level}>`
}

function parseTableRow(line: string) {
  const trimmed = line.trim()
  const parts = trimmed.split("|")
  if (parts.length <= 1) {
    return []
  }
  const cells = [...parts]
  if (trimmed.startsWith("|")) {
    cells.shift()
  }
  if (trimmed.endsWith("|")) {
    cells.pop()
  }
  return cells.map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)
}

function markdownToHtml(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n")
  const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g
  let lastIndex = 0
  let html = ""
  let match: RegExpExecArray | null

  const renderTextBlock = (textBlock: string) => {
    const lines = textBlock.split("\n")
    const parts: string[] = []
    let paragraphBuffer: string[] = []
    let inUnorderedList = false
    let inOrderedList = false
    let index = 0

    const closeLists = () => {
      if (inUnorderedList) {
        parts.push("</ul>")
        inUnorderedList = false
      }
      if (inOrderedList) {
        parts.push("</ol>")
        inOrderedList = false
      }
    }

    const flushParagraph = () => {
      if (paragraphBuffer.length > 0) {
        const paragraphText = paragraphBuffer.join(" ")
        parts.push(
          `<p class="text-sm text-slate-200 leading-6">${formatInlineMarkdown(paragraphText)}</p>`
        )
        paragraphBuffer = []
      }
    }

    while (index < lines.length) {
      const rawLine = lines[index]
      const line = rawLine.trimEnd()

      if (line.trim() === "") {
        flushParagraph()
        closeLists()
        index += 1
        continue
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        flushParagraph()
        closeLists()
        const level = headingMatch[1].length
        parts.push(buildHeading(level, headingMatch[2]))
        index += 1
        continue
      }

      if (
        line.includes("|") &&
        index + 1 < lines.length &&
        isTableSeparator(lines[index + 1])
      ) {
        flushParagraph()
        closeLists()
        const headerCells = parseTableRow(line).map((cell) => formatInlineMarkdown(cell))
        const rowLines: string[] = []
        index += 2
        while (index < lines.length && lines[index].includes("|")) {
          rowLines.push(lines[index])
          index += 1
        }
        const headerHtml = headerCells
          .map((cell) => `<th class="border border-slate-700 px-2 py-1 text-left">${cell}</th>`)
          .join("")
        const bodyHtml = rowLines
          .map((row) => {
            const cells = parseTableRow(row).map((cell) => formatInlineMarkdown(cell))
            return `<tr>${cells
              .map((cell) => `<td class="border border-slate-800 px-2 py-1">${cell}</td>`)
              .join("")}</tr>`
          })
          .join("")
        parts.push(
          `<div class="overflow-x-auto"><table class="mt-2 w-full border-collapse text-xs text-slate-200"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
        )
        continue
      }

      const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/)
      if (unorderedMatch) {
        flushParagraph()
        if (inOrderedList) {
          parts.push("</ol>")
          inOrderedList = false
        }
        if (!inUnorderedList) {
          parts.push('<ul class="ml-4 list-disc text-sm text-slate-200">')
          inUnorderedList = true
        }
        parts.push(`<li class="mb-1">${formatInlineMarkdown(unorderedMatch[1])}</li>`)
        index += 1
        continue
      }

      const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/)
      if (orderedMatch) {
        flushParagraph()
        if (inUnorderedList) {
          parts.push("</ul>")
          inUnorderedList = false
        }
        if (!inOrderedList) {
          parts.push('<ol class="ml-4 list-decimal text-sm text-slate-200">')
          inOrderedList = true
        }
        parts.push(`<li class="mb-1">${formatInlineMarkdown(orderedMatch[1])}</li>`)
        index += 1
        continue
      }

      paragraphBuffer.push(formatInlineMarkdown(line))
      index += 1
    }

    flushParagraph()
    closeLists()
    return parts.join("")
  }

  while ((match = codeBlockRegex.exec(normalized)) !== null) {
    const textChunk = normalized.slice(lastIndex, match.index)
    if (textChunk) {
      html += renderTextBlock(escapeHtml(textChunk))
    }
    const codeContent = escapeHtml(match[1] ?? "")
    html += `<pre class="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200"><code>${codeContent}</code></pre>`
    lastIndex = match.index + match[0].length
  }
  const remaining = normalized.slice(lastIndex)
  if (remaining) {
    html += renderTextBlock(escapeHtml(remaining))
  }
  return html
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
      const rawMarkdown = typeof data?.markdown === "string" ? data.markdown : ""
      const cleanedMarkdown = cleanPrdMarkdown(rawMarkdown)
      setPrdId(data.prd_id)
      setPrdMarkdown(cleanedMarkdown)
      setEditedMarkdown(cleanedMarkdown)
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

  const previewHtml = useMemo(() => {
    return editedMarkdown ? markdownToHtml(editedMarkdown) : ""
  }, [editedMarkdown])

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
      {summaryLoading ? (
        <div className="grid gap-2">
          <div className="text-xs text-slate-400">LLM 查询中，请稍候...</div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-500" />
          </div>
        </div>
      ) : null}
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
        {editedMarkdown ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <div className="mb-2 text-xs text-slate-400">Markdown 预览</div>
            <div
              className="grid gap-2 text-sm text-slate-200"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        ) : null}
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
