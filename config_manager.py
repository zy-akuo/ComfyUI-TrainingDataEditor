"""
配置管理器 - 管理翻译 API 密钥和其他设置
"""

import os
import json
import threading


DEFAULT_CONFIG = {
    "translate_engine": "baidu",
    "baidu_appid": "",
    "baidu_appkey": "",
    "translate_from": "auto",
    "translate_to": "en",
    "thumbnail_size": 256,
    "thumbnail_cache_max": 2000,
    "page_size": 50,
    "image_extensions": [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"],
    "text_extensions": [".txt", ".json", ".yaml", ".yml", ".csv"],
}


class ConfigManager:
    def __init__(self, config_path):
        self._path = config_path
        self._config = dict(DEFAULT_CONFIG)
        self._lock = threading.Lock()
        self._load()

    def _load(self):
        if os.path.isfile(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                for k, v in saved.items():
                    if k in self._config:
                        self._config[k] = v
            except Exception:
                pass

    def _save(self):
        try:
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._config, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def get(self, key=None):
        with self._lock:
            if key is None:
                return dict(self._config)
            return self._config.get(key)

    def set(self, updates):
        with self._lock:
            for k, v in updates.items():
                if k in self._config:
                    self._config[k] = v
            self._save()

    def get_translate_config(self):
        with self._lock:
            return {
                "engine": self._config["translate_engine"],
                "baidu_appid": self._config["baidu_appid"],
                "baidu_appkey": self._config["baidu_appkey"],
                "from_lang": self._config["translate_from"],
                "to_lang": self._config["translate_to"],
            }
