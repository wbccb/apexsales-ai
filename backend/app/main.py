import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core import state
from .routers import knowledge, voice, session, poc, contract, model_config

# 初始化 FastAPI 应用实例
app = FastAPI(title="ApexSales AI API", version="0.1.0")

# 复用 Uvicorn 的错误日志通道，确保日志出现在控制台
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.INFO)

# 配置 CORS 跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# 挂载各模块路由
app.include_router(model_config.router)
app.include_router(knowledge.router)
app.include_router(voice.router)
app.include_router(session.router)
app.include_router(poc.router)
app.include_router(contract.router)

@app.get("/health")
def health() -> dict:
    """健康检查接口"""
    return {"status": "ok"}

@app.on_event("startup")
def startup_event():
    """应用启动时加载持久化状态"""
    state.load_runtime_state()

@app.on_event("shutdown")
def shutdown_event():
    """应用关闭时保存当前状态"""
    state.save_runtime_state()
