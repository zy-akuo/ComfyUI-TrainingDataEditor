# ComfyUI Training Data Editor

ComfyUI 训练素材编辑器 —— 浏览、编辑图像模型训练素材（图像 + 文本配对文件）。

**标准 ComfyUI 插件**：克隆到 `custom_nodes` 目录即可使用，**无需修改 ComfyUI 核心代码**。

## 功能

- 图像-文本配对浏览（`.txt` / `.json` / `.yaml` / `.csv`）
- 缩略图网格、分页加载、懒加载
- 单条文本编辑、保存、查看原图（灯箱）
- 单条 / 批量翻译（百度 + Google）
- 批量文本编辑：头部追加、尾部追加、删除指定字符串
- 左侧边栏图标入口，独立弹窗操作界面

## 环境要求

- ComfyUI（新版前端，带左侧边栏菜单）
- Python 3.9+
- 网络连接（翻译功能）

> `aiohttp` 由 ComfyUI 自带，无需单独安装。

## 安装

### 方式一：Git 克隆（推荐）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/zy-akuo/ComfyUI-TrainingDataEditor.git
cd ComfyUI-TrainingDataEditor
pip install -r requirements.txt
```

### 方式二：ComfyUI Manager

在 Manager 中搜索 **Training Data Editor** 安装（发布到仓库后）。

### 方式三：手动下载

将本仓库解压到 `ComfyUI/custom_nodes/ComfyUI-TrainingDataEditor/`。

安装依赖后 **重启 ComfyUI**。

## 使用

1. 启动 ComfyUI，点击左侧边栏 **训练素材编辑器** 图标（图片+文本线条图标）
2. 输入训练素材目录路径，点击 **扫描目录**
3. 点击缩略图卡片，在右侧编辑文本
4. 使用工具栏进行批量翻译或批量文本编辑

## 翻译配置

在弹窗内点击 **设置**：

| 引擎 | 说明 |
|------|------|
| 百度翻译 | 需填写 [百度翻译 API](https://fanyi-api.baidu.com/) 的 AppID 和 AppKey |
| Google 翻译 | 免费使用，无需配置（需能访问 Google） |

配置保存在插件目录下的 `config.json`（首次保存后自动生成，已加入 `.gitignore`）。

## 项目结构

```
ComfyUI-TrainingDataEditor/
├── __init__.py           # 插件入口（注册路由与前端）
├── server.py             # 后端 API
├── config_manager.py     # 配置管理
├── requirements.txt
├── pyproject.toml        # ComfyUI Manager 兼容
├── js/                   # 前端扩展
└── _cache/               # 缩略图缓存（运行时自动生成）
```

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/training-data/scan` | POST | 扫描目录 |
| `/training-data/thumbnail` | GET | 缩略图 |
| `/training-data/image` | GET | 原图 |
| `/training-data/text` | GET/PUT | 读写文本 |
| `/training-data/translate` | POST | 翻译 |
| `/training-data/batch-translate` | POST | 批量翻译 |
| `/training-data/batch-text-edit` | POST | 批量追加/删除 |
| `/training-data/batch-save` | POST | 批量保存 |
| `/training-data/config` | GET/PUT | 配置 |

## 快捷键

- `Ctrl+S`：保存当前文本
- `Esc`：关闭编辑器 / 弹窗 / 原图灯箱

## 开源说明

- 本插件完全独立，所有代码在 `custom_nodes/ComfyUI-TrainingDataEditor/` 内
- 通过 ComfyUI 公开 API 集成：`PromptServer`、`WEB_DIRECTORY`、`app.registerExtension`
- 不 patch、不 fork ComfyUI 源码
- MIT License

## 许可证

MIT License
