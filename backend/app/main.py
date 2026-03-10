from datetime import datetime, timezone
import json
import os
import re
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional, cast
from uuid import uuid4

import numpy as np
import requests
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from resemblyzer import VoiceEncoder, preprocess_wav
from pypdf import PdfReader

from .config import (
    get_asr_device,
    get_asr_model_name,
    get_llm_api_key,
    get_llm_api_url,
    get_llm_model,
    get_llm_temperature,
    get_llm_timeout_seconds,
    get_poc_mode,
    get_poc_prompt_template,
    get_poc_rule_template_path,
    get_prd_mode,
    get_prd_prompt_template,
    get_contract_style_path,
    get_contract_template_path,
    get_contract_title,
    get_speaker_similarity_threshold
)

app = FastAPI(title="ApexSales AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# 会话逐字稿内存缓存
utterances_by_session = cast(Dict[str, List[Dict[str, Any]]], {})
# PRD 内存缓存
prds_by_id = cast(Dict[str, Dict[str, Any]], {})
prds_by_session = cast(Dict[str, str], {})
# POC 内存缓存
pocs_by_id = cast(Dict[str, Dict[str, Any]], {})
pocs_by_share = cast(Dict[str, str], {})
# 合同内存缓存
contracts_by_id = cast(Dict[str, Dict[str, Any]], {})
# 声纹内存缓存
voice_embeddings_by_user = cast(Dict[str, np.ndarray], {})
# 知识库文档内存缓存
knowledge_documents_by_id = cast(Dict[str, Dict[str, Any]], {})
# 文档切片内存缓存
knowledge_chunks_by_doc = cast(Dict[str, List[Dict[str, Any]]], {})
# 模型懒加载容器
asr_model = None
voice_encoder = None

DEFAULT_POC_RULE_TEMPLATE = (
    'import React from "react";\n'
    "\n"
    "const prd = `{{prd}}`;\n"
    "\n"
    "const features = [\n"
    '  { title: "需求分析", desc: "自动抽取关键痛点与流程" },\n'
    '  { title: "方案推荐", desc: "结构化输出可执行方案" },\n'
    '  { title: "交互预览", desc: "快速生成前端 Demo" },\n'
    "];\n"
    "\n"
    "export default function App() {\n"
    "  return (\n"
    '    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">\n'
    '      <header className="mx-auto max-w-5xl space-y-2">\n'
    '        <h1 className="text-3xl font-semibold">POC Demo</h1>\n'
    '        <p className="text-slate-300">基于 PRD 自动生成的前端原型</p>\n'
    "      </header>\n"
    '      <main className="mx-auto mt-8 grid max-w-5xl gap-6">\n'
    '        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">\n'
    '          <h2 className="text-xl font-medium">核心功能</h2>\n'
    '          <div className="mt-4 grid gap-4 md:grid-cols-3">\n'
    "            {features.map((item) => (\n"
    '              <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">\n'
    '                <h3 className="text-base font-semibold">{item.title}</h3>\n'
    '                <p className="mt-2 text-sm text-slate-300">{item.desc}</p>\n'
    "              </div>\n"
    "            ))}\n"
    "          </div>\n"
    "        </section>\n"
    '        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">\n'
    '          <h2 className="text-xl font-medium">PRD 摘要</h2>\n'
    '          <pre className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{prd}</pre>\n'
    "        </section>\n"
    "      </main>\n"
    "    </div>\n"
    "  );\n"
    "}\n"
)

DEFAULT_CONTRACT_TEMPLATE = (
    "签署日期：{{date}}\n"
    "\n"
    "项目背景与需求：\n"
    "{{prd_markdown}}\n"
)

DEFAULT_CONTRACT_STYLE: Dict[str, Any] = {
    "title": "销售 AI 项目合作合同",
    "render_title": True,
    "title_font": "Helvetica-Bold",
    "title_size": 16,
    "body_font": "Helvetica",
    "body_size": 11,
    "margin_left": 40,
    "margin_top": 40,
    "margin_bottom": 40,
    "line_height": 16,
    "title_spacing": 20,
    "max_chars": 80
}


class UtteranceResponse(BaseModel):
    utterance_id: str
    speaker: str
    text: str
    ts: str


class VoiceRegisterResponse(BaseModel):
    user_id: str
    voice_embedding_saved: bool


class VoiceVerifyResponse(BaseModel):
    user_id: str
    similarity: float
    is_sales: bool
    threshold: float


class UtteranceItem(BaseModel):
    id: str
    speaker: str
    text: str
    ts: str


class SessionUtterancesResponse(BaseModel):
    session_id: str
    utterances: List[UtteranceItem]


class SummaryResponse(BaseModel):
    prd_id: str
    markdown: str


class PrdSaveRequest(BaseModel):
    edited_markdown: str


class PrdSaveResponse(BaseModel):
    prd_id: str
    saved: bool


class PocResponse(BaseModel):
    poc_id: str
    code: str
    share_uuid: str


class PocFetchResponse(BaseModel):
    poc_id: str
    code: str


class ContractResponse(BaseModel):
    contract_id: str
    pdf_url: str


class KnowledgeUploadResponse(BaseModel):
    document_id: str
    status: str
    filename: str


class KnowledgeDocumentItem(BaseModel):
    document_id: str
    filename: str
    status: str
    owner_user_id: Optional[str]
    business_tag: Optional[str]
    created_at: str
    updated_at: str
    chunk_count: int
    error_message: Optional[str]


class KnowledgeDocumentsResponse(BaseModel):
    total: int
    page: int
    page_size: int
    documents: List[KnowledgeDocumentItem]


class KnowledgeReindexResponse(BaseModel):
    document_id: str
    status: str


class KnowledgeRetrieveRequest(BaseModel):
    query: str
    top_k: int = 5
    business_tag: Optional[str] = None


class KnowledgeMatch(BaseModel):
    document_id: str
    chunk_id: str
    score: float
    page_no: Optional[int]
    content: str


class KnowledgeRetrieveResponse(BaseModel):
    matches: List[KnowledgeMatch]


@app.get("/health")
# 健康检查接口
def health() -> dict:
    return {"status": "ok"}


def get_asr_model():
    # ASR 模型懒加载，避免启动时加载过慢
    global asr_model
    if asr_model is None:
        model_name = get_asr_model_name()
        device = get_asr_device()
        asr_model = AutoModel(
            model=model_name,
            device=device,
            trust_remote_code=True
        )
    return asr_model


def get_voice_encoder():
    # 声纹编码器懒加载
    global voice_encoder
    if voice_encoder is None:
        voice_encoder = VoiceEncoder()
    return voice_encoder


async def save_upload_to_temp(audio: UploadFile) -> str:
    # 将上传音频保存到临时文件，便于模型读取
    with NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(await audio.read())
        return temp_file.name


def compute_embedding(file_path: str) -> np.ndarray:
    # 提取音频声纹向量
    wav = preprocess_wav(file_path)
    encoder = get_voice_encoder()
    embedding = encoder.embed_utterance(wav)
    return embedding


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    # 计算余弦相似度
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def asr_transcribe(file_path: str) -> str:
    # 调用 ASR 模型转写
    model = get_asr_model()
    res = model.generate(
        input=file_path,
        cache={},
        language="auto",
        use_itn=True,
        batch_size_s=60,
        merge_vad=True
    )
    if not res:
        return ""
    text = res[0].get("text", "")
    return rich_transcription_postprocess(text)


def get_knowledge_storage_dir() -> str:
    directory = os.path.join(os.path.dirname(__file__), "..", "storage", "knowledge")
    abs_directory = os.path.abspath(directory)
    os.makedirs(abs_directory, exist_ok=True)
    return abs_directory


def save_upload_to_storage(file: UploadFile, suffix: str) -> str:
    storage_dir = get_knowledge_storage_dir()
    file_path = os.path.join(storage_dir, f"{uuid4().hex}{suffix}")
    with open(file_path, "wb") as output:
        output.write(cast(bytes, file.file.read()))
    return file_path


def tokenize_text(text: str) -> List[str]:
    return re.findall(r"[\u4e00-\u9fffA-Za-z0-9_]+", text.lower())


def text_to_embedding(text: str, dim: int = 256) -> np.ndarray:
    embedding = np.zeros(dim, dtype=np.float32)
    tokens = tokenize_text(text)
    if not tokens:
        return embedding
    for token in tokens:
        index = sum(token.encode("utf-8")) % dim
        embedding[index] += 1.0
    norm = np.linalg.norm(embedding)
    if norm == 0:
        return embedding
    return embedding / norm


def split_text_to_chunks(text: str, max_chars: int = 500, overlap: int = 100) -> List[str]:
    cleaned = text.strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]
    chunks: List[str] = []
    start = 0
    step = max(1, max_chars - overlap)
    while start < len(cleaned):
        end = min(len(cleaned), start + max_chars)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(cleaned):
            break
        start += step
    return chunks


def extract_pdf_pages(file_path: str) -> List[str]:
    reader = PdfReader(file_path)
    pages: List[str] = []
    for page in reader.pages:
        pages.append((page.extract_text() or "").strip())
    return pages


def index_knowledge_document(document_id: str) -> None:
    document = knowledge_documents_by_id.get(document_id)
    if document is None:
        return
    document["status"] = "processing"
    document["updated_at"] = datetime.now(timezone.utc).isoformat()
    knowledge_chunks_by_doc[document_id] = []
    try:
        pages = extract_pdf_pages(str(document["file_path"]))
        chunk_index = 0
        for page_no, page_text in enumerate(pages, start=1):
            for chunk_text in split_text_to_chunks(page_text):
                chunk_id = str(uuid4())
                embedding = text_to_embedding(chunk_text)
                knowledge_chunks_by_doc[document_id].append(
                    {
                        "chunk_id": chunk_id,
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "page_no": page_no,
                        "content": chunk_text,
                        "token_count": len(tokenize_text(chunk_text)),
                        "embedding": embedding
                    }
                )
                chunk_index += 1
        document["status"] = "ready"
        document["updated_at"] = datetime.now(timezone.utc).isoformat()
        document["error_message"] = None
    except Exception as exc:
        document["status"] = "failed"
        document["updated_at"] = datetime.now(timezone.utc).isoformat()
        document["error_message"] = str(exc)


def build_transcript(utterances: List[Dict[str, Any]]) -> str:
    # 将逐条 utterance 拼接为完整逐字稿
    lines = []
    for item in utterances:
        speaker = item.get("speaker", "")
        text = item.get("text", "")
        if text:
            lines.append(f"[{speaker}] {text}")
    return "\n".join(lines)


def generate_prd_markdown_rule(transcript: str) -> str:
    # 规则版 PRD 生成，确保无 LLM 时可用
    lines = [line for line in transcript.splitlines() if line.strip()]
    highlights = lines[:6]
    bullets = "\n".join([f"- {item}" for item in highlights]) or "- 暂无可用逐字稿片段"
    return "\n".join(
        [
            "# 需求概述",
            "",
            "## 需求背景",
            bullets,
            "",
            "## 核心痛点",
            bullets,
            "",
            "## 业务流程",
            "- 待补充",
            "",
            "## 功能清单",
            "- 待补充",
            "",
            "## 交互草图描述",
            "- 待补充",
            "",
            "## 报价建议",
            "- 待补充"
        ]
    )


def generate_prd_markdown_llm(transcript: str) -> str:
    # LLM 版 PRD 生成，通过统一 API 调用
    api_url = get_llm_api_url()
    model = get_llm_model()
    if not api_url or not model:
        raise HTTPException(status_code=500, detail="LLM 未配置")
    prompt = get_prd_prompt_template().replace("{{transcript}}", transcript)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    api_key = get_llm_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_llm_timeout_seconds()
        )
    except requests.RequestException:
        raise HTTPException(status_code=500, detail="LLM 请求失败")
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="LLM 返回异常")
    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    return content


def generate_prd_markdown(transcript: str) -> str:
    # 根据模式选择规则版或 LLM 版 PRD
    mode = get_prd_mode()
    if mode == "llm":
        return generate_prd_markdown_llm(transcript)
    return generate_prd_markdown_rule(transcript)


def load_text_template(path: str, fallback: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
    except OSError:
        return fallback
    if not content.strip():
        return fallback
    return content


def load_json_template(path: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
    except OSError:
        return fallback
    if not content.strip():
        return fallback
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return fallback
    if isinstance(data, dict):
        merged = fallback.copy()
        merged.update(data)
        return merged
    return fallback


def generate_poc_code_rule(prd_markdown: str) -> str:
    safe_prd = prd_markdown.replace("`", "\\`")
    template = load_text_template(
        get_poc_rule_template_path(),
        DEFAULT_POC_RULE_TEMPLATE
    )
    return template.replace("{{prd}}", safe_prd)


def generate_poc_code_llm(prd_markdown: str) -> str:
    # LLM 版 POC 代码生成，通过统一 API 调用
    api_url = get_llm_api_url()
    model = get_llm_model()
    if not api_url or not model:
        raise HTTPException(status_code=500, detail="LLM 未配置")
    prompt = get_poc_prompt_template().replace("{{prd}}", prd_markdown)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    api_key = get_llm_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_llm_timeout_seconds()
        )
    except requests.RequestException:
        raise HTTPException(status_code=500, detail="LLM 请求失败")
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="LLM 返回异常")
    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    return content


def generate_poc_code(prd_markdown: str) -> str:
    # 根据模式选择规则版或 LLM 版 POC
    mode = get_poc_mode()
    if mode == "llm":
        return generate_poc_code_llm(prd_markdown)
    return generate_poc_code_rule(prd_markdown)


def wrap_contract_text(text: str, max_chars: int) -> List[str]:
    # 简单按字符长度做换行，避免 PDF 文字溢出
    lines: List[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        while len(line) > max_chars:
            lines.append(line[:max_chars])
            line = line[max_chars:]
        lines.append(line)
    return lines


def render_contract_pdf(prd_markdown: str, file_path: str) -> None:
    style = load_json_template(get_contract_style_path(), DEFAULT_CONTRACT_STYLE)
    title = style.get("title") or get_contract_title()
    template = load_text_template(
        get_contract_template_path(),
        DEFAULT_CONTRACT_TEMPLATE
    )
    rendered = (
        template.replace("{{title}}", title)
        .replace("{{date}}", datetime.now().strftime("%Y-%m-%d"))
        .replace("{{prd_markdown}}", prd_markdown)
    )
    pdf = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4
    margin_left = float(style.get("margin_left", 40))
    margin_top = float(style.get("margin_top", 40))
    margin_bottom = float(style.get("margin_bottom", 40))
    line_height = float(style.get("line_height", 16))
    max_chars = int(style.get("max_chars", 80))
    y = height - margin_top
    if bool(style.get("render_title", True)):
        pdf.setFont(
            str(style.get("title_font", "Helvetica-Bold")),
            float(style.get("title_size", 16))
        )
        pdf.drawString(margin_left, y, title)
        y -= float(style.get("title_spacing", 20))
    pdf.setFont(
        str(style.get("body_font", "Helvetica")),
        float(style.get("body_size", 11))
    )
    for line in wrap_contract_text(rendered, max_chars):
        if y < margin_bottom:
            pdf.showPage()
            y = height - margin_top
            pdf.setFont(
                str(style.get("body_font", "Helvetica")),
                float(style.get("body_size", 11))
            )
        pdf.drawString(margin_left, y, line)
        y -= line_height
    pdf.save()


@app.post("/knowledge/upload", response_model=KnowledgeUploadResponse)
async def upload_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    owner_user_id: Optional[str] = Form(None),
    business_tag: Optional[str] = Form(None)
) -> KnowledgeUploadResponse:
    if (file.filename or "").lower().endswith(".pdf") is False:
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")
    file_path = save_upload_to_storage(file, ".pdf")
    document_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    knowledge_documents_by_id[document_id] = {
        "id": document_id,
        "filename": file.filename or f"{document_id}.pdf",
        "file_path": file_path,
        "status": "pending",
        "owner_user_id": owner_user_id,
        "business_tag": business_tag,
        "created_at": now,
        "updated_at": now,
        "error_message": None
    }
    background_tasks.add_task(index_knowledge_document, document_id)
    return KnowledgeUploadResponse(
        document_id=document_id,
        status="pending",
        filename=file.filename or f"{document_id}.pdf"
    )


@app.get("/knowledge/documents", response_model=KnowledgeDocumentsResponse)
def list_knowledge_documents(
    status: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> KnowledgeDocumentsResponse:
    safe_page = max(1, page)
    safe_page_size = max(1, min(100, page_size))
    docs = list(knowledge_documents_by_id.values())
    if status:
        docs = [doc for doc in docs if doc.get("status") == status]
    if owner_user_id:
        docs = [doc for doc in docs if doc.get("owner_user_id") == owner_user_id]
    docs.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    page_docs = docs[start:end]
    items = [
        KnowledgeDocumentItem(
            document_id=str(item["id"]),
            filename=str(item["filename"]),
            status=str(item["status"]),
            owner_user_id=cast(Optional[str], item.get("owner_user_id")),
            business_tag=cast(Optional[str], item.get("business_tag")),
            created_at=str(item["created_at"]),
            updated_at=str(item["updated_at"]),
            chunk_count=len(knowledge_chunks_by_doc.get(str(item["id"]), [])),
            error_message=cast(Optional[str], item.get("error_message"))
        )
        for item in page_docs
    ]
    return KnowledgeDocumentsResponse(
        total=len(docs),
        page=safe_page,
        page_size=safe_page_size,
        documents=items
    )


@app.post("/knowledge/reindex/{document_id}", response_model=KnowledgeReindexResponse)
def reindex_knowledge_document(
    document_id: str,
    background_tasks: BackgroundTasks
) -> KnowledgeReindexResponse:
    document = knowledge_documents_by_id.get(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    document["status"] = "pending"
    document["updated_at"] = datetime.now(timezone.utc).isoformat()
    document["error_message"] = None
    background_tasks.add_task(index_knowledge_document, document_id)
    return KnowledgeReindexResponse(document_id=document_id, status="pending")


@app.post("/knowledge/retrieve", response_model=KnowledgeRetrieveResponse)
def retrieve_knowledge(payload: KnowledgeRetrieveRequest) -> KnowledgeRetrieveResponse:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query 不能为空")
    top_k = max(1, min(20, payload.top_k))
    query_embedding = text_to_embedding(query)
    candidates: List[Dict[str, Any]] = []
    for document in knowledge_documents_by_id.values():
        if document.get("status") != "ready":
            continue
        if payload.business_tag and document.get("business_tag") != payload.business_tag:
            continue
        document_id = str(document["id"])
        for chunk in knowledge_chunks_by_doc.get(document_id, []):
            score = cosine_similarity(
                cast(np.ndarray, chunk["embedding"]),
                query_embedding
            )
            candidates.append(
                {
                    "document_id": document_id,
                    "chunk_id": str(chunk["chunk_id"]),
                    "score": score,
                    "page_no": cast(Optional[int], chunk.get("page_no")),
                    "content": str(chunk["content"])
                }
            )
    candidates.sort(key=lambda item: cast(float, item["score"]), reverse=True)
    matches = [
        KnowledgeMatch(
            document_id=str(item["document_id"]),
            chunk_id=str(item["chunk_id"]),
            score=float(item["score"]),
            page_no=cast(Optional[int], item.get("page_no")),
            content=str(item["content"])
        )
        for item in candidates[:top_k]
    ]
    return KnowledgeRetrieveResponse(matches=matches)


@app.post("/voice/register", response_model=VoiceRegisterResponse)
# 声纹注册接口
async def voice_register(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceRegisterResponse:
    temp_path = await save_upload_to_temp(audio)
    try:
        embedding = compute_embedding(temp_path)
        voice_embeddings_by_user[user_id] = embedding
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    return VoiceRegisterResponse(user_id=user_id, voice_embedding_saved=True)


@app.post("/voice/verify", response_model=VoiceVerifyResponse)
# 声纹验证接口
async def voice_verify(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceVerifyResponse:
    sales_embedding = voice_embeddings_by_user.get(user_id)
    if sales_embedding is None:
        raise HTTPException(status_code=400, detail="销售声纹未注册")
    temp_path = await save_upload_to_temp(audio)
    try:
        current_embedding = compute_embedding(temp_path)
        similarity = cosine_similarity(current_embedding, sales_embedding)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    threshold = get_speaker_similarity_threshold()
    return VoiceVerifyResponse(
        user_id=user_id,
        similarity=similarity,
        is_sales=similarity >= threshold,
        threshold=threshold
    )


@app.post("/asr/transcribe", response_model=UtteranceResponse)
# ASR + 声纹二分接口
async def transcribe(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    sales_id: Optional[str] = Form(None)
) -> UtteranceResponse:
    temp_path = await save_upload_to_temp(audio)
    try:
        text = asr_transcribe(temp_path)
        speaker = "客户"
        similarity = None
        if sales_id:
            sales_embedding = voice_embeddings_by_user.get(sales_id)
            if sales_embedding is None:
                raise HTTPException(status_code=400, detail="销售声纹未注册")
            current_embedding = compute_embedding(temp_path)
            similarity = cosine_similarity(current_embedding, sales_embedding)
            threshold = get_speaker_similarity_threshold()
            speaker = "销售" if similarity >= threshold else "客户"
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    ts = datetime.now(timezone.utc).isoformat()
    utterance_id = str(uuid4())
    utterance = {
        "id": utterance_id,
        "speaker": speaker,
        "text": text,
        "ts": ts,
        "audio_filename": audio.filename,
        "similarity": similarity
    }
    utterances_by_session.setdefault(session_id, []).append(utterance)
    return UtteranceResponse(
        utterance_id=utterance_id,
        speaker=speaker,
        text=text,
        ts=ts
    )


@app.get("/session/{session_id}/utterances", response_model=SessionUtterancesResponse)
# 获取会话逐字稿接口
def get_session_utterances(session_id: str) -> SessionUtterancesResponse:
    utterances = utterances_by_session.get(session_id, [])
    return SessionUtterancesResponse(
        session_id=session_id,
        utterances=[UtteranceItem(**item) for item in utterances]
    )


@app.post("/session/{session_id}/summary", response_model=SummaryResponse)
# 会话总结生成接口
def session_summary(session_id: str) -> SummaryResponse:
    utterances = utterances_by_session.get(session_id, [])
    if not utterances:
        raise HTTPException(status_code=400, detail="会话暂无逐字稿")
    transcript = build_transcript(utterances)
    markdown = generate_prd_markdown(transcript)
    prd_id = str(uuid4())
    prds_by_id[prd_id] = {
        "id": prd_id,
        "session_id": session_id,
        "markdown": markdown,
        "edited_markdown": None
    }
    prds_by_session[session_id] = prd_id
    return SummaryResponse(prd_id=prd_id, markdown=markdown)


@app.post("/prd/{prd_id}/save", response_model=PrdSaveResponse)
# 保存 PRD 编辑结果
def save_prd(prd_id: str, payload: PrdSaveRequest) -> PrdSaveResponse:
    prd = prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
    prd["edited_markdown"] = payload.edited_markdown
    return PrdSaveResponse(prd_id=prd_id, saved=True)


@app.post("/prd/{prd_id}/poc", response_model=PocResponse)
# POC 生成接口
def generate_poc(prd_id: str) -> PocResponse:
    prd = prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
    markdown = prd.get("edited_markdown") or prd.get("markdown") or ""
    code = generate_poc_code(markdown)
    poc_id = str(uuid4())
    share_uuid = uuid4().hex[:10]
    pocs_by_id[poc_id] = {
        "id": poc_id,
        "prd_id": prd_id,
        "code": code,
        "share_uuid": share_uuid
    }
    pocs_by_share[share_uuid] = poc_id
    return PocResponse(poc_id=poc_id, code=code, share_uuid=share_uuid)


@app.get("/poc/{share_uuid}", response_model=PocFetchResponse)
# POC 分享获取接口
def get_poc(share_uuid: str) -> PocFetchResponse:
    poc_id = pocs_by_share.get(share_uuid)
    if not poc_id:
        raise HTTPException(status_code=404, detail="POC 不存在")
    poc = pocs_by_id.get(poc_id)
    if not poc:
        raise HTTPException(status_code=404, detail="POC 不存在")
    return PocFetchResponse(poc_id=poc_id, code=poc.get("code", ""))


@app.post("/contract/{prd_id}", response_model=ContractResponse)
# 合同生成接口
def generate_contract(prd_id: str) -> ContractResponse:
    prd = prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
    markdown = prd.get("edited_markdown") or prd.get("markdown") or ""
    with NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        file_path = temp_file.name
    render_contract_pdf(markdown, file_path)
    contract_id = str(uuid4())
    contracts_by_id[contract_id] = {
        "id": contract_id,
        "prd_id": prd_id,
        "pdf_path": file_path
    }
    pdf_url = f"/contract/{contract_id}/download"
    return ContractResponse(contract_id=contract_id, pdf_url=pdf_url)


@app.get("/contract/{contract_id}/download")
# 合同下载接口
def download_contract(contract_id: str):
    contract = contracts_by_id.get(contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    pdf_path = contract.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="合同文件不存在")
    return FileResponse(pdf_path, filename=f"contract-{contract_id}.pdf")
