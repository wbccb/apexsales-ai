import re
import numpy as np
from uuid import uuid4
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, cast
from ..core import state
from .pdf_service import extract_pdf_pages
from .voice_service import cosine_similarity


def tokenize_text(text: str) -> List[str]:
    """文本分词（简单规则）"""
    return re.findall(r"[\u4e00-\u9fffA-Za-z0-9_]+", text.lower())


def text_to_embedding(text: str, dim: int = 256) -> np.ndarray:
    """文本转稀疏向量（基于 token 哈希）"""
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
    """将长文本切分为带重叠的片段"""
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


def index_knowledge_document(document_id: str) -> None:
    """建立文档索引（后台任务）"""
    document = state.knowledge_documents_by_id.get(document_id)
    if document is None:
        return
    document["status"] = "processing"
    document["updated_at"] = datetime.now(timezone.utc).isoformat()
    state.knowledge_chunks_by_doc[document_id] = []
    try:
        pages = extract_pdf_pages(str(document["file_path"]))
        chunk_index = 0
        for page_no, page_text in enumerate(pages, start=1):
            for chunk_text in split_text_to_chunks(page_text):
                chunk_id = str(uuid4())
                embedding = text_to_embedding(chunk_text)
                state.knowledge_chunks_by_doc[document_id].append(
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
    state.save_runtime_state()


def search_knowledge_matches(
    query: str,
    top_k: int,
    business_tag: Optional[str]
) -> List[Dict[str, Any]]:
    """基于向量相似度检索相关片段"""
    query_embedding = text_to_embedding(query)
    candidates: List[Dict[str, Any]] = []
    for document in state.knowledge_documents_by_id.values():
        if document.get("status") != "ready":
            continue
        if business_tag and document.get("business_tag") != business_tag:
            continue
        document_id = str(document["id"])
        for chunk in state.knowledge_chunks_by_doc.get(document_id, []):
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
    return candidates[:top_k]
