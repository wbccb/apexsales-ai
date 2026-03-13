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
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-900">
      <ModelConfigDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <KnowledgeDrawer
        open={knowledgeDrawerOpen}
        onClose={() => setKnowledgeDrawerOpen(false)}
      />

      {/* Left Main Area: Chat Interface */}
      <main className="flex flex-1 flex-col border-r border-gray-200 min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 px-6 bg-white shrink-0 z-10">
          <div>
            <h1 className="text-lg font-bold text-gray-900">ApexSales AI</h1>
            <p className="text-xs text-gray-500">语音转写与对话工作台</p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              onClick={() => setDrawerOpen(true)}
            >
              模型配置
            </button>
            <button
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              onClick={() => setKnowledgeDrawerOpen(true)}
            >
              知识库
            </button>
          </div>
        </header>
        
        {/* Chat Component takes remaining space */}
        <div className="flex-1 overflow-hidden relative">
          <StageVoice sessionId={sessionId} setSessionId={setSessionId} />
        </div>
      </main>

      {/* Right Sidebar: Functionality Stages */}
      <aside className="flex w-[500px] flex-col overflow-y-auto bg-gray-50 border-l border-gray-200 shadow-[inset_4px_0_8px_-4px_rgba(0,0,0,0.05)] shrink-0">
        <div className="flex flex-col gap-6 p-6">
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
                <StagePrd
                sessionId={sessionId}
                setSessionId={setSessionId}
                prdId={prdId}
                setPrdId={setPrdId}
                />
            </div>
            
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
                <StagePoc prdId={prdId} />
            </div>
            
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
                <StageContract prdId={prdId} />
            </div>
        </div>
      </aside>
    </div>
  )
}
