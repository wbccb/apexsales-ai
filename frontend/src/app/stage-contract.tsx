"use client"

import { useCallback, useState } from "react"

type StageContractProps = {
  prdId: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

export function StageContract({ prdId }: StageContractProps) {
  const [contractLoading, setContractLoading] = useState(false)
  const [contractResult, setContractResult] = useState<string | null>(null)
  const [contractDownloadUrl, setContractDownloadUrl] = useState<string | null>(null)

  const generateContract = useCallback(async () => {
    if (!prdId) {
      setContractResult("请先生成 PRD")
      setContractDownloadUrl(null)
      return
    }
    setContractLoading(true)
    setContractResult(null)
    setContractDownloadUrl(null)
    try {
      const response = await fetch(`${API_BASE}/contract/${prdId}`, {
        method: "POST"
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      const pdfUrl = `${API_BASE}${data.pdf_url}`
      setContractResult(pdfUrl)
      setContractDownloadUrl(pdfUrl)
      window.open(pdfUrl, "_blank", "noopener,noreferrer")
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setContractResult(message)
      setContractDownloadUrl(null)
    } finally {
      setContractLoading(false)
    }
  }, [prdId])

  return (
    <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-medium">阶段四：合同导出</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950"
          onClick={generateContract}
          disabled={contractLoading}
        >
          {contractLoading ? "导出中..." : "导出合同"}
        </button>
        {contractDownloadUrl ? (
          <a
            className="rounded-full border border-emerald-400 px-5 py-2 text-sm font-medium text-emerald-200"
            href={contractDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            下载合同
          </a>
        ) : null}
        <div className="text-sm text-slate-300">
          {contractResult ? contractResult : "尚未生成合同"}
        </div>
      </div>
    </section>
  )
}
