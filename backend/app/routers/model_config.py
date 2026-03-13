from fastapi import APIRouter
from ..models.schemas import (
    ModelConfigListResponse,
    ModelConfigItem,
    ModelConfigSaveRequest,
    ModelConfigSaveResponse
)
from ..core import state
from ..services.llm_service import build_model_config, normalize_stage_name


router = APIRouter(prefix="/model-configs", tags=["Model Config"])


def get_model_config_stages() -> list[str]:
    """获取所有模型配置阶段"""
    base_stages = ["voice", "prd", "poc", "contract"]
    extra = [stage for stage in state.model_configs_by_stage.keys() if stage not in base_stages]
    return base_stages + sorted(extra)


@router.get("", response_model=ModelConfigListResponse)
def get_model_configs() -> ModelConfigListResponse:
    """获取所有阶段的模型配置列表"""
    configs = [
        ModelConfigItem(**build_model_config(stage))
        for stage in get_model_config_stages()
    ]
    return ModelConfigListResponse(configs=configs)


@router.post("", response_model=ModelConfigSaveResponse)
def save_model_configs(payload: ModelConfigSaveRequest) -> ModelConfigSaveResponse:
    """批量保存模型配置"""
    for item in payload.configs:
        stage = normalize_stage_name(item.stage)
        state.model_configs_by_stage[stage] = {
            "base_url": item.base_url.strip(),
            "model_name": item.model_name.strip(),
            "api_key": item.api_key.strip()
        }
    state.save_runtime_state()
    configs = [
        ModelConfigItem(**build_model_config(stage))
        for stage in get_model_config_stages()
    ]
    return ModelConfigSaveResponse(saved=True, configs=configs)
