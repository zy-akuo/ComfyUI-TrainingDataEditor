"""
后端 API 路由 - 目录扫描、缩略图生成、图片/文本读写、翻译代理
"""

import os
import io
import json
import hashlib
import time
import random
import asyncio
import threading
from pathlib import Path
from collections import OrderedDict
from aiohttp import web
from PIL import Image

routes = web.RouteTableDef()

# 延迟导入 config_manager，避免循环依赖
_config_manager = None

def get_config_manager():
    global _config_manager
    if _config_manager is None:
        from .config_manager import ConfigManager
        plugin_dir = os.path.dirname(os.path.abspath(__file__))
        _config_manager = ConfigManager(os.path.join(plugin_dir, "config.json"))
    return _config_manager


# 缩略图缓存（LRU）
_thumbnail_cache = OrderedDict()
_cache_lock = threading.Lock()
_cache_dir = None


def get_cache_dir():
    global _cache_dir
    if _cache_dir is None:
        plugin_dir = os.path.dirname(os.path.abspath(__file__))
        _cache_dir = os.path.join(plugin_dir, "_cache")
        os.makedirs(_cache_dir, exist_ok=True)
    return _cache_dir


def get_file_hash(filepath):
    """生成文件路径的 hash 作为缓存键"""
    stat = os.stat(filepath)
    key = f"{filepath}_{stat.st_mtime}_{stat.st_size}"
    return hashlib.md5(key.encode()).hexdigest()


def generate_thumbnail(image_path, size=256):
    """生成缩略图，返回 bytes"""
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((size, size), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
            return buf.getvalue()
    except Exception as e:
        print(f"[TrainingDataEditor] 生成缩略图失败: {image_path}, {e}")
        return None


def match_text_file(image_path, text_extensions):
    """根据图片路径匹配对应的文本文件"""
    base = os.path.splitext(image_path)[0]
    for ext in text_extensions:
        text_path = base + ext
        if os.path.isfile(text_path):
            return text_path
    return None


def scan_directory(directory, image_extensions, text_extensions):
    """扫描目录，返回图像-文本配对列表"""
    pairs = []
    if not os.path.isdir(directory):
        return pairs

    for entry in os.scandir(directory):
        if not entry.is_file():
            continue
        name_lower = entry.name.lower()
        ext = os.path.splitext(name_lower)[1]
        if ext in image_extensions:
            image_path = entry.path
            text_path = match_text_file(image_path, text_extensions)
            pairs.append({
                "image": image_path,
                "image_name": entry.name,
                "text": text_path,
                "text_name": os.path.basename(text_path) if text_path else None,
            })

    pairs.sort(key=lambda x: x["image_name"].lower())
    return pairs


def _get_text_format(text_path):
    ext = os.path.splitext(text_path)[1].lower()
    if ext == ".json":
        return "json"
    if ext in (".yaml", ".yml"):
        return "yaml"
    if ext == ".csv":
        return "csv"
    return "text"


def _read_text_file(text_path):
    fmt = _get_text_format(text_path)
    if fmt == "json":
        with open(text_path, "r", encoding="utf-8") as f:
            return json.load(f), fmt
    if fmt == "yaml":
        try:
            import yaml
            with open(text_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f), fmt
        except ImportError:
            with open(text_path, "r", encoding="utf-8") as f:
                return f.read(), "text"
    with open(text_path, "r", encoding="utf-8") as f:
        return f.read(), fmt


def _write_text_file(text_path, content, fmt):
    os.makedirs(os.path.dirname(text_path), exist_ok=True)
    if fmt == "json":
        with open(text_path, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
    elif fmt == "yaml":
        try:
            import yaml
            with open(text_path, "w", encoding="utf-8") as f:
                yaml.dump(content, f, allow_unicode=True, default_flow_style=False)
        except ImportError:
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(str(content))
    elif fmt == "csv":
        with open(text_path, "w", encoding="utf-8") as f:
            f.write(content)
    else:
        with open(text_path, "w", encoding="utf-8") as f:
            f.write(content)


def _extract_translatable_text(content, fmt):
    """从文件内容中提取可翻译文本，返回 (text, update_mode, key)"""
    if fmt in ("text", "csv"):
        return (content if isinstance(content, str) else str(content or ""), "replace", None)

    if fmt == "json":
        if isinstance(content, str):
            return (content, "replace", None)
        if isinstance(content, dict):
            for key in ("caption", "text", "prompt", "description", "tags"):
                if key in content and isinstance(content[key], str):
                    return (content[key], "json_key", key)
        return (json.dumps(content, ensure_ascii=False), "replace", None)

    if fmt == "yaml":
        if isinstance(content, str):
            return (content, "replace", None)
        if isinstance(content, dict):
            for key in ("caption", "text", "prompt", "description", "tags"):
                if key in content and isinstance(content[key], str):
                    return (content[key], "yaml_key", key)
        return (str(content), "replace", None)

    return (str(content or ""), "replace", None)


def _apply_translation(content, fmt, translated, update_mode, key):
    if update_mode == "json_key" and isinstance(content, dict) and key:
        content[key] = translated
        return content
    if update_mode == "yaml_key" and isinstance(content, dict) and key:
        content[key] = translated
        return content
    if fmt in ("text", "csv"):
        return translated
    if fmt == "json" and isinstance(content, str):
        return translated
    if fmt == "yaml" and isinstance(content, str):
        return translated
    return translated


# ============ API 路由 ============

@routes.post("/training-data/scan")
async def api_scan(request):
    """扫描目录，返回文件配对列表"""
    try:
        data = await request.json()
        directory = data.get("directory", "")
        if not directory or not os.path.isdir(directory):
            return web.json_response({"error": "无效的目录路径"}, status=400)

        cfg = get_config_manager().get()
        image_ext = cfg.get("image_extensions", [])
        text_ext = cfg.get("text_extensions", [])

        pairs = scan_directory(directory, image_ext, text_ext)

        return web.json_response({
            "directory": directory,
            "total": len(pairs),
            "items": pairs,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.get("/training-data/thumbnail")
async def api_thumbnail(request):
    """获取缩略图（带缓存）"""
    try:
        image_path = request.query.get("path", "")
        if not image_path or not os.path.isfile(image_path):
            return web.Response(status=404, text="Image not found")

        cfg = get_config_manager().get()
        size = int(request.query.get("size", cfg.get("thumbnail_size", 256)))
        cache_max = cfg.get("thumbnail_cache_max", 2000)

        file_hash = get_file_hash(image_path)
        cache_key = f"{file_hash}_{size}"

        with _cache_lock:
            if cache_key in _thumbnail_cache:
                _thumbnail_cache.move_to_end(cache_key)
                data = _thumbnail_cache[cache_key]
                return web.Response(body=data, content_type="image/webp")

        # 生成缩略图
        data = generate_thumbnail(image_path, size)
        if data is None:
            return web.Response(status=500, text="Failed to generate thumbnail")

        # 写入磁盘缓存
        cache_dir = get_cache_dir()
        cache_file = os.path.join(cache_dir, f"{cache_key}.webp")
        try:
            with open(cache_file, "wb") as f:
                f.write(data)
        except Exception:
            pass

        # 写入内存缓存（LRU）
        with _cache_lock:
            _thumbnail_cache[cache_key] = data
            _thumbnail_cache.move_to_end(cache_key)
            while len(_thumbnail_cache) > cache_max:
                _thumbnail_cache.popitem(last=False)

        return web.Response(body=data, content_type="image/webp")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@routes.get("/training-data/image")
async def api_image(request):
    """获取原图"""
    try:
        image_path = request.query.get("path", "")
        if not image_path or not os.path.isfile(image_path):
            return web.Response(status=404, text="Image not found")

        ext = os.path.splitext(image_path)[1].lower()
        content_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".gif": "image/gif",
        }
        content_type = content_types.get(ext, "image/png")

        with open(image_path, "rb") as f:
            data = f.read()

        return web.Response(body=data, content_type=content_type)
    except Exception as e:
        return web.Response(status=500, text=str(e))


@routes.get("/training-data/text")
async def api_text_read(request):
    """读取文本文件内容"""
    try:
        text_path = request.query.get("path", "")
        if not text_path or not os.path.isfile(text_path):
            return web.json_response({"error": "文件不存在"}, status=404)

        ext = os.path.splitext(text_path)[1].lower()

        if ext == ".json":
            with open(text_path, "r", encoding="utf-8") as f:
                content = json.load(f)
            return web.json_response({"content": content, "format": "json"})
        elif ext in (".yaml", ".yml"):
            try:
                import yaml
                with open(text_path, "r", encoding="utf-8") as f:
                    content = yaml.safe_load(f)
                return web.json_response({"content": content, "format": "yaml"})
            except ImportError:
                with open(text_path, "r", encoding="utf-8") as f:
                    raw = f.read()
                return web.json_response({"content": raw, "format": "text"})
        elif ext == ".csv":
            with open(text_path, "r", encoding="utf-8") as f:
                raw = f.read()
            return web.json_response({"content": raw, "format": "csv"})
        else:
            with open(text_path, "r", encoding="utf-8") as f:
                raw = f.read()
            return web.json_response({"content": raw, "format": "text"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.put("/training-data/text")
async def api_text_write(request):
    """保存文本文件内容"""
    try:
        data = await request.json()
        text_path = data.get("path", "")
        content = data.get("content", "")
        fmt = data.get("format", "text")

        if not text_path:
            return web.json_response({"error": "路径不能为空"}, status=400)

        # 确保目录存在
        os.makedirs(os.path.dirname(text_path), exist_ok=True)

        if fmt == "json":
            with open(text_path, "w", encoding="utf-8") as f:
                json.dump(content, f, ensure_ascii=False, indent=2)
        elif fmt in ("yaml", "yml"):
            try:
                import yaml
                with open(text_path, "w", encoding="utf-8") as f:
                    yaml.dump(content, f, allow_unicode=True, default_flow_style=False)
            except ImportError:
                with open(text_path, "w", encoding="utf-8") as f:
                    f.write(str(content))
        elif fmt == "csv":
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(content)
        else:
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(content)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/training-data/delete")
async def api_delete_item(request):
    """删除图片及配对的文本文件"""
    try:
        data = await request.json()
        image_path = data.get("image", "")
        text_path = data.get("text", "")

        if not image_path or not os.path.isfile(image_path):
            return web.json_response({"error": "图片文件不存在"}, status=400)

        deleted = {"image": False, "text": False}
        warnings = []

        try:
            os.remove(image_path)
            deleted["image"] = True
        except Exception as e:
            return web.json_response({"error": f"删除图片失败: {e}"}, status=500)

        if text_path and os.path.isfile(text_path):
            try:
                os.remove(text_path)
                deleted["text"] = True
            except Exception as e:
                warnings.append(f"删除文本失败: {e}")

        return web.json_response({
            "success": True,
            "deleted": deleted,
            "warnings": warnings,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/training-data/batch-save")
async def api_batch_save(request):
    """批量保存多个文本文件"""
    try:
        data = await request.json()
        items = data.get("items", [])
        results = []

        for item in items:
            text_path = item.get("path", "")
            content = item.get("content", "")
            fmt = item.get("format", "text")

            if not text_path:
                results.append({"path": text_path, "success": False, "error": "路径为空"})
                continue

            try:
                os.makedirs(os.path.dirname(text_path), exist_ok=True)

                if fmt == "json":
                    with open(text_path, "w", encoding="utf-8") as f:
                        json.dump(content, f, ensure_ascii=False, indent=2)
                elif fmt in ("yaml", "yml"):
                    try:
                        import yaml
                        with open(text_path, "w", encoding="utf-8") as f:
                            yaml.dump(content, f, allow_unicode=True, default_flow_style=False)
                    except ImportError:
                        with open(text_path, "w", encoding="utf-8") as f:
                            f.write(str(content))
                else:
                    with open(text_path, "w", encoding="utf-8") as f:
                        f.write(content)

                results.append({"path": text_path, "success": True})
            except Exception as e:
                results.append({"path": text_path, "success": False, "error": str(e)})

        return web.json_response({"results": results})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/training-data/batch-translate")
async def api_batch_translate(request):
    """批量翻译多个文本文件并保存"""
    try:
        data = await request.json()
        items = data.get("items", [])
        from_lang = data.get("from_lang", "auto")
        to_lang = data.get("to_lang", "en")
        engine = data.get("engine", "")

        if not items:
            return web.json_response({"error": "没有可翻译的文件"}, status=400)

        cfg = get_config_manager().get_translate_config()
        if not engine:
            engine = cfg["engine"]

        results = []
        success_count = 0
        fail_count = 0
        skip_count = 0

        for item in items:
            text_path = item.get("text")
            image_name = item.get("image_name", "")

            if not text_path or not os.path.isfile(text_path):
                skip_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": False,
                    "skipped": True,
                    "error": "无文本文件",
                })
                continue

            try:
                content, fmt = _read_text_file(text_path)
                text, update_mode, key = _extract_translatable_text(content, fmt)

                if not text.strip():
                    skip_count += 1
                    results.append({
                        "path": text_path,
                        "image_name": image_name,
                        "success": False,
                        "skipped": True,
                        "error": "文本为空",
                    })
                    continue

                translated = await _translate_with_engine(
                    text, from_lang, to_lang, engine, cfg
                )

                new_content = _apply_translation(content, fmt, translated, update_mode, key)
                _write_text_file(text_path, new_content, fmt)

                success_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": True,
                })

                await asyncio.sleep(0.15)
            except Exception as e:
                fail_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": False,
                    "error": str(e),
                })

        return web.json_response({
            "total": len(items),
            "success_count": success_count,
            "fail_count": fail_count,
            "skip_count": skip_count,
            "results": results,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/training-data/batch-text-edit")
async def api_batch_text_edit(request):
    """批量文本编辑：头部追加、尾部追加、删除指定字符串"""
    try:
        data = await request.json()
        items = data.get("items", [])
        operation = data.get("operation", "")
        value = data.get("value", "")

        if operation not in ("append_head", "append_tail", "remove"):
            return web.json_response({"error": "无效操作类型"}, status=400)

        if operation in ("append_head", "append_tail") and not value:
            return web.json_response({"error": "追加内容不能为空"}, status=400)

        if operation == "remove" and not value:
            return web.json_response({"error": "要删除的字符串不能为空"}, status=400)

        if not items:
            return web.json_response({"error": "没有可编辑的文件"}, status=400)

        results = []
        success_count = 0
        fail_count = 0
        skip_count = 0

        for item in items:
            text_path = item.get("text")
            image_name = item.get("image_name", "")

            if not text_path or not os.path.isfile(text_path):
                skip_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": False,
                    "skipped": True,
                    "error": "无文本文件",
                })
                continue

            try:
                content, fmt = _read_text_file(text_path)
                text, update_mode, key = _extract_translatable_text(content, fmt)

                if operation == "append_head":
                    new_text = value + text
                elif operation == "append_tail":
                    new_text = text + value
                else:
                    new_text = text.replace(value, "")

                new_content = _apply_translation(content, fmt, new_text, update_mode, key)
                _write_text_file(text_path, new_content, fmt)

                success_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": True,
                })
            except Exception as e:
                fail_count += 1
                results.append({
                    "path": text_path,
                    "image_name": image_name,
                    "success": False,
                    "error": str(e),
                })

        return web.json_response({
            "total": len(items),
            "success_count": success_count,
            "fail_count": fail_count,
            "skip_count": skip_count,
            "results": results,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/training-data/translate")
async def api_translate(request):
    """翻译文本（百度/Google 双引擎）"""
    try:
        data = await request.json()
        text = data.get("text", "")
        engine = data.get("engine", "")
        from_lang = data.get("from_lang", "auto")
        to_lang = data.get("to_lang", "en")

        if not text.strip():
            return web.json_response({"translated": "", "engine": engine})

        cfg = get_config_manager().get_translate_config()
        if not engine:
            engine = cfg["engine"]

        result = await _translate_with_engine(text, from_lang, to_lang, engine, cfg)
        return web.json_response({"translated": result, "engine": engine})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


BAIDU_LANG_MAP = {
    "auto": "auto",
    "zh": "zh",
    "en": "en",
    "ja": "jp",
    "ko": "kor",
    "fr": "fra",
    "de": "de",
    "es": "spa",
    "ru": "ru",
}


def _to_baidu_lang(lang):
    return BAIDU_LANG_MAP.get(lang, lang)


def _split_text_for_translate(text, max_len=1800):
    """将长文本按逗号边界切分，避免超出翻译 API 长度限制"""
    if len(text) <= max_len:
        return [text]

    if "," not in text:
        return [text[i:i + max_len] for i in range(0, len(text), max_len)]

    parts = text.split(",")
    chunks = []
    current = ""

    for part in parts:
        segment = part if not current else f"{current},{part}"
        if len(segment) <= max_len:
            current = segment
        else:
            if current:
                chunks.append(current)
            current = part

    if current:
        chunks.append(current)

    return chunks or [text]


async def _translate_with_engine(text, from_lang, to_lang, engine, cfg):
    chunks = _split_text_for_translate(text)
    translated_chunks = []

    for chunk in chunks:
        if not chunk.strip():
            continue
        if engine == "baidu":
            translated_chunks.append(await _translate_baidu(chunk, from_lang, to_lang, cfg))
        elif engine == "google":
            translated_chunks.append(await _translate_google(chunk, from_lang, to_lang, cfg))
        else:
            raise Exception(f"不支持的翻译引擎: {engine}")
        if len(chunks) > 1:
            await asyncio.sleep(0.1)

    if len(translated_chunks) == 1:
        return translated_chunks[0]
    if "," in text:
        return ",".join(translated_chunks)
    return "".join(translated_chunks)


async def _translate_baidu(text, from_lang, to_lang, cfg):
    """百度翻译 API"""
    import hashlib
    import aiohttp

    appid = cfg.get("baidu_appid", "")
    appkey = cfg.get("baidu_appkey", "")

    if not appid or not appkey:
        raise Exception("百度翻译 AppID 或 AppKey 未配置，请在设置中填写")

    url = "https://fanyi-api.baidu.com/api/trans/vip/translate"
    salt = random.randint(32768, 65536)
    sign_str = f"{appid}{text}{salt}{appkey}"
    sign = hashlib.md5(sign_str.encode("utf-8")).hexdigest()

    params = {
        "appid": appid,
        "q": text,
        "from": _to_baidu_lang(from_lang),
        "to": _to_baidu_lang(to_lang),
        "salt": salt,
        "sign": sign,
    }

    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise Exception(f"百度翻译请求失败: HTTP {resp.status}")
            result = await resp.json()

    if "error_code" in result:
        error_msg = result.get("error_msg", "未知错误")
        raise Exception(f"百度翻译错误 [{result['error_code']}]: {error_msg}")

    trans_result = result.get("trans_result", [])
    if trans_result:
        return "\n".join(item.get("dst", "") for item in trans_result)
    return text


async def _translate_google(text, from_lang, to_lang, cfg=None):
    """Google 翻译（使用免费接口）"""
    import aiohttp

    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": from_lang if from_lang != "auto" else "auto",
        "tl": to_lang,
        "dt": "t",
        "q": text,
    }

    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise Exception(f"Google 翻译请求失败: HTTP {resp.status}")
            body = await resp.text()
            try:
                result = json.loads(body)
            except json.JSONDecodeError:
                raise Exception(f"Google 翻译返回无效响应: {body[:120]}")

    if result and result[0]:
        translated_parts = []
        for part in result[0]:
            if part[0]:
                translated_parts.append(part[0])
        return "".join(translated_parts)
    return text


@routes.get("/training-data/config")
async def api_config_get(request):
    """获取配置"""
    try:
        cfg = get_config_manager().get()
        safe_cfg = dict(cfg)
        if "baidu_appkey" in safe_cfg and safe_cfg["baidu_appkey"]:
            key = safe_cfg["baidu_appkey"]
            safe_cfg["baidu_appkey"] = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
        return web.json_response(safe_cfg)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.put("/training-data/config")
async def api_config_set(request):
    """更新配置"""
    try:
        data = await request.json()
        # 如果 appkey 是掩码形式，不更新
        if "baidu_appkey" in data and "****" in data["baidu_appkey"]:
            del data["baidu_appkey"]
        if "baidu_appid" in data and "****" in data["baidu_appid"]:
            del data["baidu_appid"]
        get_config_manager().set(data)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
