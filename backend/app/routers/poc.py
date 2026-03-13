from uuid import uuid4
from fastapi import APIRouter, HTTPException
from ..models.schemas import PocResponse, PocFetchResponse
from ..core import state
from ..services.llm_service import generate_poc_code, strip_think_blocks


router = APIRouter(tags=["POC Generation"])


@router.post("/prd/{prd_id}/poc", response_model=PocResponse)
def generate_poc(prd_id: str) -> PocResponse:
    """基于 PRD 生成前端 POC 代码"""
    prd = state.prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
        
    markdown = prd.get("edited_markdown") or prd.get("markdown") or ""
    # 移除思考标签，确保生成代码质量
    markdown = strip_think_blocks(markdown)
    code = generate_poc_code(markdown)
    
    poc_id = str(uuid4())
    share_uuid = uuid4().hex[:10]
    state.pocs_by_id[poc_id] = {
        "id": poc_id,
        "prd_id": prd_id,
        "code": code,
        "share_uuid": share_uuid
    }
    state.pocs_by_share[share_uuid] = poc_id
    state.save_runtime_state()
    
    return PocResponse(poc_id=poc_id, code=code, share_uuid=share_uuid)


@router.get("/poc/{share_uuid}", response_model=PocFetchResponse)
def get_poc(share_uuid: str) -> PocFetchResponse:
    """根据分享 UUID 获取 POC 代码"""
    poc_id = state.pocs_by_share.get(share_uuid)
    if not poc_id:
        raise HTTPException(status_code=404, detail="POC 不存在")
    
    poc = state.pocs_by_id.get(poc_id)
    if not poc:
        raise HTTPException(status_code=404, detail="POC 不存在")
        
    return PocFetchResponse(poc_id=poc_id, code=poc.get("code", ""))
