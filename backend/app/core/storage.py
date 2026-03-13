import os
from .state import get_storage_root_dir

def get_knowledge_storage_dir() -> str:
    """获取知识库 PDF 文件存储目录"""
    directory = os.path.join(get_storage_root_dir(), "knowledge")
    os.makedirs(directory, exist_ok=True)
    return directory

def get_contract_storage_dir() -> str:
    """获取合同 PDF 文件存储目录"""
    directory = os.path.join(get_storage_root_dir(), "contracts")
    os.makedirs(directory, exist_ok=True)
    return directory
