import os


def get_asr_model_name() -> str:
    return os.getenv("ASR_MODEL", "iic/SenseVoiceSmall")


def get_asr_device() -> str:
    return os.getenv("ASR_DEVICE", "cpu")


def get_speaker_similarity_threshold() -> float:
    value = os.getenv("SPEAKER_SIM_THRESHOLD", "0.8")
    try:
        return float(value)
    except ValueError:
        return 0.8


def get_prd_mode() -> str:
    return os.getenv("PRD_MODE", "rule").lower()


def get_llm_api_url() -> str:
    return os.getenv("LLM_API_URL", "")


def get_llm_api_key() -> str:
    return os.getenv("LLM_API_KEY", "")


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "")


def get_llm_temperature() -> float:
    value = os.getenv("LLM_TEMPERATURE", "0.2")
    try:
        return float(value)
    except ValueError:
        return 0.2


def get_llm_timeout_seconds() -> int:
    value = os.getenv("LLM_TIMEOUT_SECONDS", "60")
    try:
        return int(value)
    except ValueError:
        return 60


def get_prd_prompt_template() -> str:
    return (
        "你是资深售前产品经理。\n"
        "请基于以下会议逐字稿生成结构化 PRD，输出 Markdown：\n"
        "1. 需求背景\n"
        "2. 核心痛点\n"
        "3. 业务流程\n"
        "4. 功能清单\n"
        "5. 交互草图描述\n"
        "6. 报价建议\n"
        "要求：条目化、可执行、避免编造。\n"
        "会议逐字稿：\n"
        "{{transcript}}\n"
    )
