"use client"

import { useCallback, useEffect, useState } from "react"

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

type KnowledgeDrawerProps = {
  open: boolean
  onClose: () => void
}

export function KnowledgeDrawer({ open, onClose }: KnowledgeDrawerProps) {
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [businessTag, setBusinessTag] = useState("")
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null)
  const [chunks, setChunks] = useState<any[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)
  const [chunksError, setChunksError] = useState("")
  const [ragQuery, setRagQuery] = useState("")
  const [ragTopK, setRagTopK] = useState(5)
  const [ragBusinessTag, setRagBusinessTag] = useState("")
  const [ragLoading, setRagLoading] = useState(false)
  const [ragResults, setRagResults] = useState<any[]>([])

  const fetchKnowledgeDocs = useCallback(async () => {
    setKnowledgeLoading(true)
    try {
      const response = await fetch(`${API_BASE}/knowledge/documents?page_size=100`)
      if (response.ok) {
        const data = await response.json()
        setKnowledgeDocs(data.documents || [])
      }
    } catch {
    } finally {
      setKnowledgeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchKnowledgeDocs()
    }
  }, [open, fetchKnowledgeDocs])

  const fetchDocumentChunks = useCallback(async (documentId: string) => {
    setChunksLoading(true)
    setChunksError("")
    try {
      const response = await fetch(`${API_BASE}/knowledge/documents/${documentId}/chunks`)
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      const data = await response.json()
      setChunks(data.chunks || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : "获取切片失败"
      setChunks([])
      setChunksError(msg)
    } finally {
      setChunksLoading(false)
    }
  }, [])

  const handleSelectDoc = (doc: any) => {
    setSelectedDoc(doc)
    setChunks([])
    setChunksError("")
    fetchDocumentChunks(doc.document_id)
  }

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) {
      alert("请输入 query")
      return
    }
    setRagLoading(true)
    try {
      const response = await fetch(`${API_BASE}/knowledge/retrieve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: ragQuery,
          top_k: ragTopK,
          business_tag: ragBusinessTag || undefined
        })
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      const data = await response.json()
      setRagResults(data.matches || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : "检索失败"
      alert(msg)
    } finally {
      setRagLoading(false)
    }
  }

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

  return (
    <div
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        className={`absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-[400px] border-l border-gray-200 bg-white p-6 shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="text-lg font-semibold text-gray-900">知识库管理</div>
          <button
            className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-900">上传文档 (PDF)</h3>
          <div className="mt-3 grid gap-3">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <input
              type="text"
              value={businessTag}
              onChange={(e) => setBusinessTag(e.target.value)}
              placeholder="业务标签 (可选)"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
            />
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
            >
              {uploading ? "上传中..." : "上传并建立索引"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">知识库检索测试</h3>
            <button
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              onClick={handleRagSearch}
              disabled={ragLoading}
            >
              {ragLoading ? "检索中..." : "检索"}
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="输入 query"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={ragTopK}
                onChange={(e) => setRagTopK(Number(e.target.value || 1))}
                className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                value={ragBusinessTag}
                onChange={(e) => setRagBusinessTag(e.target.value)}
                placeholder="业务标签 (可选)"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {ragResults.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">暂无检索结果</div>
            ) : null}
            {ragResults.map((item: any) => (
              <div
                key={`${item.document_id}-${item.chunk_id}`}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <div>doc: {item.document_id}</div>
                  <div>score: {item.score?.toFixed?.(4) ?? item.score}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-400">
                  {item.page_no ? `页码: ${item.page_no}` : "页码: -"}
                </div>
                <div className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">文档列表</h3>
            <button
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              onClick={fetchKnowledgeDocs}
              disabled={knowledgeLoading}
            >
              刷新
            </button>
          </div>
          <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
            {knowledgeLoading && knowledgeDocs.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">加载中...</div>
            ) : null}
            {!knowledgeLoading && knowledgeDocs.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">暂无文档</div>
            ) : null}
            {knowledgeDocs.map((doc) => (
              <div
                key={doc.document_id}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-medium text-gray-900 break-all">
                    {doc.filename}
                  </div>
                  <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    doc.status === "ready" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                    doc.status === "failed" ? "bg-rose-50 text-rose-700 border border-rose-100" :
                    "bg-amber-50 text-amber-700 border border-amber-100"
                  }`}>
                    {doc.status}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                  <div>切片: {doc.chunk_count}</div>
                  <div>{new Date(doc.created_at).toLocaleString()}</div>
                </div>
                <button
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  onClick={() => handleSelectDoc(doc)}
                >
                  查看切片
                </button>
                {doc.error_message ? (
                  <div className="mt-2 text-[10px] text-rose-600 bg-rose-50 p-1 rounded">
                    {doc.error_message}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      {selectedDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => setSelectedDoc(null)}
          />
          <div className="relative w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 shrink-0">
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {selectedDoc.filename}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  共 {chunks.length} 个切片
                </div>
              </div>
              <button
                className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200 transition-colors"
                onClick={() => setSelectedDoc(null)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 pr-2">
              {chunksLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                </div>
              ) : null}
              {!chunksLoading && chunksError ? (
                <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-600 text-center">{chunksError}</div>
              ) : null}
              {!chunksLoading && !chunksError && chunks.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-8">暂无切片数据</div>
              ) : null}
              <div className="grid gap-3">
                {chunks.map((chunk: any) => (
                  <div
                    key={chunk.chunk_id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <div className="font-medium text-indigo-600">
                        片段 {Number(chunk.chunk_index || 0) + 1}
                      </div>
                      <div className="flex gap-3">
                        <span>{chunk.page_no ? `页码 ${chunk.page_no}` : "页码 -"}</span>
                        <span>tokens: {chunk.token_count}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {chunk.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
