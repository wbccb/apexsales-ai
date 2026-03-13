import os
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional, cast
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from ..models.schemas import (
    KnowledgeUploadResponse,
    KnowledgeDocumentsResponse,
    KnowledgeDocumentItem,
    KnowledgeReindexResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    KnowledgeMatch
)
from ..core import state
from ..core.storage import get_knowledge_storage_dir
from ..services.knowledge_service import (
    index_knowledge_document,
    search_knowledge_matches
)


router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


def save_upload_to_storage(file: UploadFile, suffix: str) -> str:
    """保存上传文件到知识库目录"""
    storage_dir = get_knowledge_storage_dir()
    file_path = os.path.join(storage_dir, f"{uuid4().hex}{suffix}")
    with open(file_path, "wb") as output:
        output.write(cast(bytes, file.file.read()))
    return file_path


@router.post("/upload", response_model=KnowledgeUploadResponse)
async def upload_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    owner_user_id: Optional[str] = Form(None),
    business_tag: Optional[str] = Form(None)
) -> KnowledgeUploadResponse:
    """上传 PDF 文档并异步建立索引"""
    if (file.filename or "").lower().endswith(".pdf") is False:
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")
    
    file_path = save_upload_to_storage(file, ".pdf")
    document_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    state.knowledge_documents_by_id[document_id] = {
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
    state.save_runtime_state()
    background_tasks.add_task(index_knowledge_document, document_id)
    
    return KnowledgeUploadResponse(
        document_id=document_id,
        status="pending",
        filename=file.filename or f"{document_id}.pdf"
    )


@router.get("/documents", response_model=KnowledgeDocumentsResponse)
def list_knowledge_documents(
    status: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> KnowledgeDocumentsResponse:
    """分页获取知识库文档列表"""
    safe_page = max(1, page)
    safe_page_size = max(1, min(100, page_size))
    docs = list(state.knowledge_documents_by_id.values())
    
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
            chunk_count=len(state.knowledge_chunks_by_doc.get(str(item["id"]), [])),
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


@router.post("/reindex/{document_id}", response_model=KnowledgeReindexResponse)
def reindex_knowledge_document_api(
    document_id: str,
    background_tasks: BackgroundTasks
) -> KnowledgeReindexResponse:
    """手动触发文档重新索引"""
    document = state.knowledge_documents_by_id.get(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    document["status"] = "pending"
    document["updated_at"] = datetime.now(timezone.utc).isoformat()
    document["error_message"] = None
    state.save_runtime_state()
    background_tasks.add_task(index_knowledge_document, document_id)
    
    return KnowledgeReindexResponse(document_id=document_id, status="pending")


@router.post("/retrieve", response_model=KnowledgeRetrieveResponse)
def retrieve_knowledge(payload: KnowledgeRetrieveRequest) -> KnowledgeRetrieveResponse:
    """知识检索接口"""
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query 不能为空")
    
    top_k = max(1, min(20, payload.top_k))
    candidates = search_knowledge_matches(query=query, top_k=top_k, business_tag=payload.business_tag)
    
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
