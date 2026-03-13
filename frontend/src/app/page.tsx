"use client"

import { useState } from "react"
import { KnowledgeDrawer } from "./knowledge/knowledge-drawer"
import { ModelConfigDrawer } from "./llm/model-config-drawer"
import { StageContract } from "./stage/stage-contract"
import { StagePoc } from "./stage/stage-poc"
import { StagePrd } from "./stage/stage-prd"
import { StageVoice } from "./stage/stage-voice"

export default function Home() {
  const [sessionId, setSessionId] = useState("")
  const [prdId, setPrdId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [knowledgeDrawerOpen, setKnowledgeDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <ModelConfigDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <KnowledgeDrawer
        open={knowledgeDrawerOpen}
        onClose={() => setKnowledgeDrawerOpen(false)}
      />

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
