/**
 * TrainingDataManager - 主面板 UI 管理器
 * 管理弹窗、工具栏、图片网格、编辑器的整体布局和交互
 */

import { ImageGrid } from "./ImageGrid.js";
import { TextEditor } from "./TextEditor.js";
import { Settings } from "./Settings.js";
import { SOURCE_LANG_OPTIONS, TARGET_LANG_OPTIONS, renderLangOptions, getLangLabel } from "./languages.js";
import { tdeFetch } from "./api.js";

export class TrainingDataManager {
    constructor() {
        this.dialog = null;
        this.imageGrid = null;
        this.textEditor = null;
        this.settings = null;
        this.currentDirectory = "";
        this.allItems = [];
        this.config = {};
        this.isBatchTranslating = false;
        this.isBatchProcessing = false;
        this.batchTranslateAbortController = null;
    }

    async open() {
        try {
            if (!this.dialog) {
                await this.loadConfig();
                this.createDialog();
                this.bindEvents();
            }
            this.dialog.style.display = "flex";
        } catch (e) {
            console.error("[TrainingDataEditor] 打开编辑器失败:", e);
            alert("打开训练素材编辑器失败: " + e.message);
        }
    }

    close() {
        if (this.dialog) {
            this.dialog.style.display = "none";
        }
    }

    async loadConfig() {
        try {
            this.config = await tdeFetch("/training-data/config");
        } catch (e) {
            console.error("[TrainingDataEditor] 加载配置失败:", e);
            this.config = {};
        }
    }

    getItemsWithText() {
        return this.allItems.filter((item) => item.text);
    }

    showBatchProgress(show, text = "处理中...", options = {}) {
        const progressEl = this.dialog.querySelector(".tde-batch-progress");
        const progressText = this.dialog.querySelector(".tde-batch-progress-text");
        const progressFill = this.dialog.querySelector(".tde-batch-progress-fill");
        const abortBtn = this.dialog.querySelector(".tde-batch-abort-btn");
        progressEl.style.display = show ? "flex" : "none";
        if (abortBtn) {
            abortBtn.style.display = show && options.showAbort ? "inline-flex" : "none";
            if (!show) {
                abortBtn.disabled = false;
                abortBtn.textContent = "中止";
            }
        }
        if (show) {
            progressText.textContent = text;
            progressFill.style.width = "0%";
        }
    }

    abortBatchTranslate() {
        if (!this.isBatchTranslating || !this.batchTranslateAbortController) {
            return;
        }

        this.batchTranslateAbortController.abort();
        const abortBtn = this.dialog.querySelector(".tde-batch-abort-btn");
        if (abortBtn) {
            abortBtn.disabled = true;
            abortBtn.textContent = "中止中...";
        }
    }

    updateBatchProgress(processed, total, progressLabel) {
        const progressFill = this.dialog.querySelector(".tde-batch-progress-fill");
        const progressText = this.dialog.querySelector(".tde-batch-progress-text");
        const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${progressLabel} ${processed}/${total}...`;
    }

    async runChunkedBatch(endpoint, payloadBuilder, total, progressLabel, options = {}) {
        const CHUNK_SIZE = 20;
        const { signal } = options;
        let totalSuccess = 0;
        let totalFail = 0;
        let totalSkip = 0;
        const progressLabelText = progressLabel;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
            if (signal?.aborted) {
                return { totalSuccess, totalFail, totalSkip, aborted: true };
            }

            try {
                const result = await tdeFetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payloadBuilder(i, CHUNK_SIZE)),
                    signal,
                });

                if (result.error) {
                    throw new Error(result.error);
                }

                totalSuccess += result.success_count || 0;
                totalFail += result.fail_count || 0;
                totalSkip += result.skip_count || 0;

                const processed = totalSuccess + totalFail + totalSkip;
                this.updateBatchProgress(processed, total, progressLabelText);
            } catch (e) {
                if (signal?.aborted || e?.name === "AbortError") {
                    return { totalSuccess, totalFail, totalSkip, aborted: true };
                }
                throw e;
            }
        }

        return { totalSuccess, totalFail, totalSkip, aborted: false };
    }

    async refreshOpenEditor() {
        const selected = this.imageGrid.getSelectedItem();
        if (selected && this.textEditor.isVisible()) {
            await this.textEditor.load(selected);
        }
    }

    createDialog() {
        this.dialog = document.createElement("div");
        this.dialog.className = "tde-dialog";
        this.dialog.innerHTML = `
            <div class="tde-overlay"></div>
            <div class="tde-container">
                <div class="tde-header">
                    <h2>训练素材编辑器</h2>
                    <button class="tde-close" title="关闭">&times;</button>
                </div>
                <div class="tde-toolbar">
                    <div class="tde-toolbar-left">
                        <input type="text" class="tde-path-input" placeholder="输入或拖拽目录路径..." />
                        <button class="tde-btn tde-btn-primary tde-scan-btn">扫描目录</button>
                    </div>
                    <div class="tde-toolbar-right">
                        <div class="tde-batch-translate-group">
                            <select class="tde-batch-from" title="源语言">${renderLangOptions(SOURCE_LANG_OPTIONS, "auto")}</select>
                            <span class="tde-translate-arrow">→</span>
                            <select class="tde-batch-to" title="目标语言">${renderLangOptions(TARGET_LANG_OPTIONS, "en")}</select>
                            <button class="tde-btn tde-btn-primary tde-batch-translate-btn" title="批量翻译全部文本">批量翻译</button>
                        </div>
                        <button class="tde-btn tde-settings-btn" title="设置">设置</button>
                        <span class="tde-stats"></span>
                    </div>
                </div>
                <div class="tde-batch-edit-panel">
                    <div class="tde-batch-edit-header">
                        <span class="tde-batch-edit-icon">✦</span>
                        <span class="tde-batch-edit-title">批量文本编辑</span>
                        <span class="tde-batch-edit-hint">对所有已加载的文本文件生效</span>
                    </div>
                    <div class="tde-batch-edit-body">
                        <input
                            type="text"
                            class="tde-batch-edit-input"
                            placeholder="输入要追加或删除的字符串，例如：masterpiece, best quality,"
                        />
                        <div class="tde-batch-edit-actions">
                            <button class="tde-btn tde-btn-accent tde-batch-append-head" title="在每条文本开头追加">头部追加</button>
                            <button class="tde-btn tde-btn-accent tde-batch-append-tail" title="在每条文本末尾追加">尾部追加</button>
                            <button class="tde-btn tde-btn-danger tde-batch-remove" title="从每条文本中删除指定字符串">删除字符串</button>
                        </div>
                    </div>
                </div>
                <div class="tde-batch-progress" style="display:none;">
                    <div class="tde-batch-progress-bar">
                        <div class="tde-batch-progress-fill"></div>
                    </div>
                    <span class="tde-batch-progress-text">处理中...</span>
                    <button class="tde-btn tde-btn-danger tde-batch-abort-btn" style="display:none;" title="中止批量翻译">中止</button>
                </div>
                <div class="tde-body">
                    <div class="tde-grid-panel">
                        <div class="tde-grid-container"></div>
                        <div class="tde-loading" style="display:none;">
                            <div class="tde-spinner"></div>
                            <span>加载中...</span>
                        </div>
                        <div class="tde-empty" style="display:none;">
                            <p>暂无数据，请先扫描目录</p>
                        </div>
                    </div>
                    <div class="tde-editor-panel" style="display:none;">
                        <div class="tde-editor-header">
                            <span class="tde-editor-title">编辑文本</span>
                            <div class="tde-editor-actions">
                                <button class="tde-btn tde-btn-small tde-save-btn">保存</button>
                                <button class="tde-btn tde-btn-small tde-close-editor-btn">关闭</button>
                            </div>
                        </div>
                        <div class="tde-editor-content"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);

        // 初始化子组件
        this.imageGrid = new ImageGrid(
            this.dialog.querySelector(".tde-grid-container"),
            this.config,
            (item) => this.onItemSelect(item),
            (item) => this.deleteItem(item)
        );

        this.textEditor = new TextEditor(
            this.dialog.querySelector(".tde-editor-content"),
            this.config,
            (message, type) => this.showToast(message, type)
        );

        this.settings = new Settings(this.config, async (newConfig) => {
            this.config = newConfig;
            await this.saveConfig(newConfig);
        });
    }

    bindEvents() {
        const closeBtn = this.dialog.querySelector(".tde-close");
        const overlay = this.dialog.querySelector(".tde-overlay");
        const scanBtn = this.dialog.querySelector(".tde-scan-btn");
        const pathInput = this.dialog.querySelector(".tde-path-input");
        const settingsBtn = this.dialog.querySelector(".tde-settings-btn");
        const batchTranslateBtn = this.dialog.querySelector(".tde-batch-translate-btn");
        const saveBtn = this.dialog.querySelector(".tde-save-btn");
        const closeEditorBtn = this.dialog.querySelector(".tde-close-editor-btn");

        closeBtn.onclick = () => this.close();
        overlay.onclick = () => this.close();
        scanBtn.onclick = () => this.scanDirectory();
        settingsBtn.onclick = () => this.settings.open();
        batchTranslateBtn.onclick = () => this.batchTranslateAll();
        this.dialog.querySelector(".tde-batch-abort-btn").onclick = () =>
            this.abortBatchTranslate();
        this.dialog.querySelector(".tde-batch-append-head").onclick = () =>
            this.batchTextEdit("append_head");
        this.dialog.querySelector(".tde-batch-append-tail").onclick = () =>
            this.batchTextEdit("append_tail");
        this.dialog.querySelector(".tde-batch-remove").onclick = () =>
            this.batchTextEdit("remove");
        saveBtn.onclick = () => this.saveCurrentText();
        closeEditorBtn.onclick = () => this.closeEditor();

        pathInput.onkeydown = (e) => {
            if (e.key === "Enter") this.scanDirectory();
        };

        // 拖拽目录路径
        pathInput.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        };
        pathInput.ondrop = (e) => {
            e.preventDefault();
            const text = e.dataTransfer.getData("text");
            if (text) {
                pathInput.value = text;
                this.scanDirectory();
            }
        };

        // 键盘快捷键
        this.dialog.onkeydown = (e) => {
            if (e.key === "Escape") {
                if (this.textEditor.isVisible()) {
                    this.closeEditor();
                } else {
                    this.close();
                }
            }
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                if (this.textEditor.isVisible()) {
                    this.saveCurrentText();
                }
            }
        };
    }

    async scanDirectory() {
        const pathInput = this.dialog.querySelector(".tde-path-input");
        const directory = pathInput.value.trim();

        if (!directory) {
            this.showToast("请输入目录路径", "warning");
            return;
        }

        this.currentDirectory = directory;
        this.showLoading(true);
        this.closeEditor();

        try {
            const result = await tdeFetch("/training-data/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ directory }),
            });

            if (result.error) {
                this.showToast(result.error, "error");
                this.showEmpty(true);
                return;
            }

            this.allItems = result.items;
            this.updateStats(result.total);
            this.imageGrid.loadItems(this.allItems);
            this.showEmpty(this.allItems.length === 0);
            this.showLoading(false);

            if (this.allItems.length > 0) {
                this.showToast(`已加载 ${result.total} 个文件`, "success");
            }
        } catch (e) {
            console.error("[TrainingDataEditor] 扫描失败:", e);
            this.showToast("扫描失败: " + e.message, "error");
            this.showLoading(false);
        }
    }

    onItemSelect(item) {
        this.openEditor(item);
    }

    async deleteItem(item) {
        if (!item?.image) return;

        const textHint = item.text_name ? ` 和 ${item.text_name}` : "";
        const confirmed = confirm(
            `确定删除 ${item.image_name}${textHint} 吗？\n此操作不可恢复。`
        );
        if (!confirmed) return;

        try {
            const result = await tdeFetch("/training-data/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: item.image,
                    text: item.text || "",
                }),
            });

            if (result.error) {
                this.showToast(result.error, "error");
                return;
            }

            const wasSelected = this.imageGrid.getSelectedItem()?.image === item.image;
            this.allItems = this.allItems.filter((entry) => entry.image !== item.image);
            this.imageGrid.removeItem(item);
            this.updateStats(this.allItems.length);
            this.showEmpty(this.allItems.length === 0);

            if (wasSelected) {
                this.imageGrid.clearSelection();
                this.closeEditor();
            }

            if (result.warnings?.length) {
                this.showToast(result.warnings.join("；"), "warning");
            } else {
                this.showToast("已删除", "success");
            }
        } catch (e) {
            console.error("[TrainingDataEditor] 删除失败:", e);
            this.showToast("删除失败: " + e.message, "error");
        }
    }

    async openEditor(item) {
        const editorPanel = this.dialog.querySelector(".tde-editor-panel");
        const editorTitle = this.dialog.querySelector(".tde-editor-title");

        editorPanel.style.display = "flex";
        editorTitle.textContent = item.image_name;

        await this.textEditor.load(item);
    }

    closeEditor() {
        const editorPanel = this.dialog.querySelector(".tde-editor-panel");
        editorPanel.style.display = "none";
        this.textEditor.clear();
    }

    async saveCurrentText() {
        const data = this.textEditor.getData();
        if (!data) return;

        try {
            const result = await tdeFetch("/training-data/text", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (result.success) {
                this.showToast("保存成功", "success");
                // 更新 item 的 text 路径
                if (data.path) {
                    const item = this.imageGrid.getSelectedItem();
                    if (item) {
                        item.text = data.path;
                        item.text_name = data.path.split(/[\\/]/).pop();
                    }
                }
            } else {
                this.showToast("保存失败: " + (result.error || "未知错误"), "error");
            }
        } catch (e) {
            console.error("[TrainingDataEditor] 保存失败:", e);
            this.showToast("保存失败: " + e.message, "error");
        }
    }

    async batchTranslateAll() {
        if (this.isBatchTranslating || this.isBatchProcessing) return;

        if (!this.allItems.length) {
            this.showToast("请先扫描目录", "warning");
            return;
        }

        const fromLang = this.dialog.querySelector(".tde-batch-from").value;
        const toLang = this.dialog.querySelector(".tde-batch-to").value;
        const withText = this.getItemsWithText();

        if (!withText.length) {
            this.showToast("没有可翻译的文本文件", "warning");
            return;
        }

        const fromLabel = getLangLabel(fromLang);
        const toLabel = getLangLabel(toLang);
        const confirmed = confirm(
            `确定将 ${withText.length} 个文本文件从【${fromLabel}】批量翻译为【${toLabel}】吗？\n翻译结果将直接覆盖原文件。`
        );
        if (!confirmed) return;

        this.isBatchTranslating = true;
        this.batchTranslateAbortController = new AbortController();
        const batchBtn = this.dialog.querySelector(".tde-batch-translate-btn");
        batchBtn.disabled = true;
        this.showBatchProgress(true, "批量翻译中 0/" + withText.length, { showAbort: true });

        try {
            const { totalSuccess, totalFail, totalSkip, aborted } = await this.runChunkedBatch(
                "/training-data/batch-translate",
                (offset, chunkSize) => {
                    const chunk = withText.slice(offset, offset + chunkSize);
                    return {
                        items: chunk.map((item) => ({
                            text: item.text,
                            image_name: item.image_name,
                        })),
                        from_lang: fromLang,
                        to_lang: toLang,
                        engine: this.config.translate_engine || "google",
                    };
                },
                withText.length,
                "批量翻译中",
                { signal: this.batchTranslateAbortController.signal }
            );

            await this.refreshOpenEditor();

            const processed = totalSuccess + totalFail + totalSkip;
            if (aborted) {
                this.showToast(
                    `批量翻译已中止：已处理 ${processed}/${withText.length}，成功 ${totalSuccess}，失败 ${totalFail}，跳过 ${totalSkip}`,
                    "warning"
                );
            } else {
                this.showToast(
                    `批量翻译完成：成功 ${totalSuccess}，失败 ${totalFail}，跳过 ${totalSkip}`,
                    totalFail > 0 ? "warning" : "success"
                );
            }
        } catch (e) {
            console.error("[TrainingDataEditor] 批量翻译失败:", e);
            this.showToast("批量翻译失败: " + e.message, "error");
        } finally {
            this.isBatchTranslating = false;
            this.batchTranslateAbortController = null;
            batchBtn.disabled = false;
            setTimeout(() => this.showBatchProgress(false), 1500);
        }
    }

    async batchTextEdit(operation) {
        if (this.isBatchProcessing || this.isBatchTranslating) return;

        if (!this.allItems.length) {
            this.showToast("请先扫描目录", "warning");
            return;
        }

        const value = this.dialog.querySelector(".tde-batch-edit-input").value;
        const withText = this.getItemsWithText();

        if (!withText.length) {
            this.showToast("没有可编辑的文本文件", "warning");
            return;
        }

        const opLabels = {
            append_head: "头部追加",
            append_tail: "尾部追加",
            remove: "删除字符串",
        };

        if (operation !== "remove" && !value) {
            this.showToast("请输入要追加的内容", "warning");
            return;
        }
        if (operation === "remove" && !value) {
            this.showToast("请输入要删除的字符串", "warning");
            return;
        }

        const preview =
            operation === "remove"
                ? `删除「${value}」`
                : `${opLabels[operation]}「${value}」`;

        const confirmed = confirm(
            `确定对 ${withText.length} 个文本文件执行【${preview}】吗？\n此操作将直接覆盖原文件。`
        );
        if (!confirmed) return;

        this.isBatchProcessing = true;
        const actionBtns = this.dialog.querySelectorAll(
            ".tde-batch-append-head, .tde-batch-append-tail, .tde-batch-remove"
        );
        actionBtns.forEach((btn) => (btn.disabled = true));
        this.showBatchProgress(true, `${opLabels[operation]} 0/${withText.length}`);

        try {
            const { totalSuccess, totalFail, totalSkip } = await this.runChunkedBatch(
                "/training-data/batch-text-edit",
                (offset, chunkSize) => {
                    const chunk = withText.slice(offset, offset + chunkSize);
                    return {
                        items: chunk.map((item) => ({
                            text: item.text,
                            image_name: item.image_name,
                        })),
                        operation,
                        value,
                    };
                },
                withText.length,
                opLabels[operation]
            );

            await this.refreshOpenEditor();
            this.showToast(
                `${opLabels[operation]}完成：成功 ${totalSuccess}，失败 ${totalFail}，跳过 ${totalSkip}`,
                totalFail > 0 ? "warning" : "success"
            );
        } catch (e) {
            console.error("[TrainingDataEditor] 批量编辑失败:", e);
            this.showToast("批量编辑失败: " + e.message, "error");
        } finally {
            this.isBatchProcessing = false;
            actionBtns.forEach((btn) => (btn.disabled = false));
            setTimeout(() => this.showBatchProgress(false), 1500);
        }
    }

    async saveConfig(config) {
        try {
            await tdeFetch("/training-data/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            this.showToast("设置已保存", "success");
        } catch (e) {
            console.error("[TrainingDataEditor] 保存配置失败:", e);
            this.showToast("保存配置失败", "error");
        }
    }

    showLoading(show) {
        const loading = this.dialog.querySelector(".tde-loading");
        loading.style.display = show ? "flex" : "none";
    }

    showEmpty(show) {
        const empty = this.dialog.querySelector(".tde-empty");
        empty.style.display = show ? "flex" : "none";
    }

    updateStats(total) {
        const stats = this.dialog.querySelector(".tde-stats");
        stats.textContent = `共 ${total} 个文件`;
    }

    showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `tde-toast tde-toast-${type}`;
        toast.textContent = message;
        this.dialog.appendChild(toast);

        setTimeout(() => toast.classList.add("tde-toast-show"), 10);
        setTimeout(() => {
            toast.classList.remove("tde-toast-show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
