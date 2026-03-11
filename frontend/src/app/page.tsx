"use client"

import { useState } from "react"
import { StageContract } from "./stage-contract"
import { StagePoc } from "./stage-poc"
import { StagePrd } from "./stage-prd"
import { StageVoice } from "./stage-voice"

export default function Home() {
  const [sessionId, setSessionId] = useState("")
  const [prdId, setPrdId] = useState<string | null>(null)

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">销售 AI 闭环系统</h1>
        <p className="text-slate-300">
          语音切片、实时对话、PRD 生成、POC 渲染、合同导出
        </p>
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
  )
}
