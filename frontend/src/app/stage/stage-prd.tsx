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
    return `<code class="rounded bg-gray-100 px-1 py-0.5 text-xs text-pink-600 font-mono border border-gray-200">${code}</code>`
  })
  return withInlineCode.replace(/\*\*([^*]+)\*\*/g, (_match, boldText) => {
    return `<strong class="font-semibold text-gray-900">${boldText}</strong>`
  })
}

function buildHeading(level: number, text: string) {
  const sizeClass =
    level === 1 ? "text-xl border-b pb-2" : level === 2 ? "text-lg" : level === 3 ? "text-base" : "text-sm"
  return `<h${level} class="mt-4 mb-2 ${sizeClass} font-bold text-gray-900">${formatInlineMarkdown(
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
          `<p class="text-sm text-gray-700 leading-6 mb-2">${formatInlineMarkdown(paragraphText)}</p>`
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
          .map((cell) => `<th class="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-900">${cell}</th>`)
          .join("")
        const bodyHtml = rowLines
          .map((row) => {
            const cells = parseTableRow(row).map((cell) => formatInlineMarkdown(cell))
            return `<tr>${cells
              .map((cell) => `<td class="border border-gray-300 px-2 py-1 text-gray-700">${cell}</td>`)
              .join("")}</tr>`
          })
          .join("")
        parts.push(
          `<div class="overflow-x-auto my-3"><table class="w-full border-collapse text-xs"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
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
          parts.push('<ul class="ml-4 list-disc text-sm text-gray-700 mb-2">')
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
          parts.push('<ol class="ml-4 list-decimal text-sm text-gray-700 mb-2">')
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
    html += `<pre class="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 font-mono"><code>${codeContent}</code></pre>`
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
    <div className="flex flex-col gap-4 bg-white p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-medium text-gray-900">阶段二：PRD 总结与编辑</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          onClick={generateSummary}
          disabled={summaryLoading || mockLoading}
        >
          {summaryLoading ? "生成中..." : "生成总结"}
        </button>
        <button
          className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          onClick={seedMockAndGenerateSummary}
          disabled={mockLoading || summaryLoading}
        >
          {mockLoading ? "注入中..." : "注入 Mock 并生成总结"}
        </button>
        <button
          className="rounded-full bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 transition-colors"
          onClick={savePrd}
          disabled={saveLoading}
        >
          {saveLoading ? "保存中..." : "保存 PRD"}
        </button>
        <div className="text-sm text-gray-500">
          {prdId ? `当前 PRD：${prdId}` : "未生成 PRD"}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={ragEnabled}
            onChange={(event) => setRagEnabled(event.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          启用 RAG
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={ragTopK}
          onChange={(event) => setRagTopK(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="TopK"
        />
      </div>
      {summaryLoading ? (
        <div className="grid gap-2">
          <div className="text-xs text-gray-500">AI 思考中...</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-1/3 animate-[shimmer_1s_infinite] rounded-full bg-indigo-500" />
          </div>
        </div>
      ) : null}
      {summaryError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {summaryError}
        </div>
      ) : null}
      {saveResult ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {saveResult}
        </div>
      ) : null}
      {mockResult ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-600">
          {mockResult}
        </div>
      ) : null}
      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">编辑内容</label>
          <textarea
            value={editedMarkdown}
            onChange={(event) => setEditedMarkdown(event.target.value)}
            placeholder="生成后可在此编辑..."
            className="min-h-[300px] w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none font-mono"
          />
        </div>
        {editedMarkdown ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Markdown 预览</div>
            <div
              className="prose prose-sm max-w-none text-gray-800"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        ) : null}
        
        {/* Retrieval Info Section */}
        {(prdMarkdown || ragUsed) && (
            <div className="border-t border-gray-100 pt-4 mt-2 grid gap-3">
                {prdMarkdown && (
                <div className="text-xs text-gray-500">
                    {ragUsed ? `本次总结已使用 RAG 检索结果，命中 ${hitChunkCount} 个 chunk` : "本次总结未命中可用检索结果"}
                </div>
                )}
                
                {prdMarkdown && ragEnabled && retrievalQuery && (
                <div className="rounded bg-gray-50 p-2 border border-gray-100">
                    <div className="text-xs font-medium text-gray-500 mb-1">检索 Query</div>
                    <div className="text-xs text-gray-600 whitespace-pre-wrap break-all font-mono bg-white p-1 rounded border border-gray-200">
                        {retrievalQuery}
                    </div>
                </div>
                )}
                
                {prdMarkdown && ragUsed && citations.length > 0 && (
                <div className="grid gap-2">
                    <div className="text-xs font-medium text-gray-500">
                        命中 Chunk 列表
                    </div>
                    <div className="grid gap-2 max-h-60 overflow-y-auto">
                        {citations.map((item, index) => (
                        <div key={item.chunk_id} className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
                            <div className="flex justify-between text-gray-500 mb-1">
                                <span>#{index + 1} doc={item.document_id}</span>
                                <span>score={Number(item.score).toFixed(4)}</span>
                            </div>
                            <div className="text-gray-700 whitespace-pre-wrap">
                                {item.content || item.snippet || "无内容"}
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
                )}
            </div>
        )}
      </div>
    </div>
  )
}
