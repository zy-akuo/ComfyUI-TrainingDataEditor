"""
ComfyUI Training Data Editor - 训练素材编辑器
浏览和编辑图像模型训练素材（图像+文本配对文件）

标准 ComfyUI 自定义节点插件，无需修改 ComfyUI 核心代码。
"""

import os

from server import PromptServer

from .server import routes
from .config_manager import ConfigManager

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
config_manager = ConfigManager(os.path.join(PLUGIN_DIR, "config.json"))

# 注册 HTTP API 到 ComfyUI（与 WorkflowManager、prompt_assistant 等插件相同方式）
PromptServer.instance.app.add_routes(routes)

WEB_DIRECTORY = "./js"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
