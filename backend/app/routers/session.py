from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from ..models.schemas import (
    SessionUtterancesResponse,
    UtteranceItem,
    SummaryRequest,
    SummaryResponse,
    CitationItem,
    PrdSaveRequest,
    PrdSaveResponse
)
from ..core import state
from ..services.knowledge_service import search_knowledge_matches
from ..services.llm_service import generate_prd_markdown


router = APIRouter(tags=["Session & PRD"])


def build_transcript(utterances: List[Dict[str, Any]]) -> str:
    """将逐条 utterance 拼接为完整逐字稿文本"""
    lines = []
    for item in utterances:
        speaker = item.get("speaker", "")
        text = item.get("text", "")
        if text:
            lines.append(f"[{speaker}] {text}")
    return "\n".join(lines)


def build_mock_utterances() -> List[Dict[str, Any]]:
    """生成模拟对话逐字稿"""
    base_time = datetime.now(timezone.utc)
    dialogue = [
        ("销售", "您好，我们这边主要想升级门店线索管理系统，当前销售跟进比较分散。"),
        ("客户", "我们现在最大的痛点是线索分配慢，而且跟进记录不完整。"),
        ("销售", "明白，您希望先解决分配效率，还是先统一客户画像和沟通记录？"),
        ("客户", "先做分配和提醒，后面再补客户画像。"),
        ("销售", "好的，那我们会设计线索自动分配、SLA 超时提醒、以及阶段转化看板。"),
        ("客户", "可以，再加一个周报导出，方便给管理层复盘。")
    ]
    utterances: List[Dict[str, Any]] = []
    for index, (speaker, text) in enumerate(dialogue):
        utterances.append(
            {
                "id": str(uuid4()),
                "speaker": speaker,
                "text": text,
                "ts": (base_time + timedelta(seconds=index * 12)).isoformat(),
                "asr_engine": "mock",
                "asr_fallback": False,
                "audio_filename": f"mock-{index + 1}.wav",
                "similarity": None
            }
        )
    return utterances


def build_rag_context(citations: List[Dict[str, Any]]) -> str:
    """构建用于注入 LLM 的检索上下文文本"""
    if not citations:
        return ""
    context_lines: List[str] = []
    for item in citations:
        context_lines.append(
            f"- doc={item['document_id']} chunk={item['chunk_id']} page={item.get('page_no')} score={float(item['score']):.4f}"
        )
        context_lines.append(f"  内容：{item['content']}")
    return "\n".join(context_lines)


def build_citation_models(citations: List[Dict[str, Any]]) -> List[CitationItem]:
    """转换检索结果为 Pydantic 响应模型"""
    return [
        CitationItem(
            document_id=str(item["document_id"]),
            chunk_id=str(item["chunk_id"]),
            score=float(item["score"]),
            page_no=item.get("page_no"),
            snippet=str(item["content"])[:240],
            content=str(item["content"])
        )
        for item in citations
    ]


def append_citations_to_markdown(markdown: str, citations: List[CitationItem]) -> str:
    """在 Markdown 结尾追加来源依据"""
    if not citations:
        return markdown
    lines = [markdown, "", "## 来源依据"]
    for citation in citations:
        lines.append(
            f"- document_id={citation.document_id} chunk_id={citation.chunk_id} page_no={citation.page_no} score={citation.score:.4f}"
        )
        lines.append(f"  - {citation.snippet}")
    return "\n".join(lines)


@router.get("/session/{session_id}/utterances", response_model=SessionUtterancesResponse)
def get_session_utterances(session_id: str) -> SessionUtterancesResponse:
    """获取指定会话的全部逐字稿"""
    utterances = state.utterances_by_session.get(session_id, [])
    return SessionUtterancesResponse(
        session_id=session_id,
        utterances=[UtteranceItem(**item) for item in utterances]
    )


@router.post("/session/{session_id}/mock-utterances", response_model=SessionUtterancesResponse)
def inject_mock_utterances(session_id: str) -> SessionUtterancesResponse:
    """为指定会话注入模拟对话数据（用于演示）"""
    utterances = build_mock_utterances()
    state.utterances_by_session[session_id] = utterances
    state.save_runtime_state()
    return SessionUtterancesResponse(
        session_id=session_id,
        utterances=[UtteranceItem(**item) for item in utterances]
    )


@router.post("/session/{session_id}/summary", response_model=SummaryResponse)
def session_summary(session_id: str, payload: Optional[SummaryRequest] = None) -> SummaryResponse:
    """基于逐字稿（和可选的 RAG）生成 PRD 摘要"""
    try:
        state.logger.info(f"summary_start session_id={session_id}")
        utterances = state.utterances_by_session.get(session_id, [])
        if not utterances:
            raise HTTPException(status_code=400, detail="会话暂无逐字稿")

        rag_enabled = payload.rag_enabled if payload else True
        top_k = max(1, min(20, payload.top_k if payload else 5))
        business_tag = payload.business_tag if payload else None

        transcript = build_transcript(utterances)
        if not transcript.strip():
            raise HTTPException(status_code=400, detail="逐字稿内容为空，无法生成总结")

        retrieved: List[Dict[str, Any]] = []
        if rag_enabled:
            try:
                retrieved = search_knowledge_matches(query=transcript, top_k=top_k, business_tag=business_tag)
            except Exception as e:
                state.logger.warning(f"RAG retrieval failed: {e}")

        citations = build_citation_models(retrieved)
        rag_context = build_rag_context(retrieved)
        
        markdown = generate_prd_markdown(transcript, rag_context)
        markdown = append_citations_to_markdown(markdown, citations)

        prd_id = str(uuid4())
        state.prds_by_id[prd_id] = {
            "id": prd_id,
            "session_id": session_id,
            "markdown": markdown,
            "edited_markdown": None,
            "rag_enabled": rag_enabled
        }
        state.prd_citations_by_prd[prd_id] = [c.model_dump() for c in citations]
        state.prds_by_session[session_id] = prd_id
        state.save_runtime_state()

        return SummaryResponse(
            prd_id=prd_id,
            markdown=markdown,
            citations=citations,
            rag_used=len(citations) > 0,
            retrieval_query=transcript
        )
    except HTTPException:
        raise
    except Exception as e:
        state.logger.exception(f"PRD summary failed: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {e}")


@router.post("/prd/{prd_id}/save", response_model=PrdSaveResponse)
def save_prd(prd_id: str, payload: PrdSaveRequest) -> PrdSaveResponse:
    """保存用户编辑后的 PRD 内容"""
    prd = state.prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
    prd["edited_markdown"] = payload.edited_markdown
    state.save_runtime_state()
    return PrdSaveResponse(prd_id=prd_id, saved=True)
