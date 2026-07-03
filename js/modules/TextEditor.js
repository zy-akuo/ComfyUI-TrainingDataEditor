/**
 * TextEditor - 文本编辑器组件
 * 支持多格式（txt/json/yaml/csv）编辑、翻译集成、保存
 */

import { TranslationService } from "./TranslationService.js";
import { SOURCE_LANG_OPTIONS, TARGET_LANG_OPTIONS, renderLangOptions } from "./languages.js";

export class TextEditor {
    constructor(container, config, onNotify) {
        this.container = container;
        this.config = config;
        this.onNotify = onNotify;
        this.translationService = new TranslationService(config);
        this.currentItem = null;
        this.currentContent = "";
        this.currentFormat = "text";
        this.isDirty = false;
        this.isTranslating = false;
        this.currentImageUrl = "";
        this.lightbox = null;

        this.createUI();
        this.createLightbox();
    }

    createUI() {
        this.container.innerHTML = `
            <div class="tde-editor-image-wrap" style="display:none;">
                <div class="tde-editor-image" title="点击查看原图">
                    <img class="tde-editor-img" alt="原图预览" />
                    <div class="tde-editor-img-overlay">
                        <span class="tde-zoom-icon"></span>
                        <span class="tde-zoom-hint">查看原图</span>
                    </div>
                </div>
            </div>
            <div class="tde-editor-img-placeholder">🖼️</div>
            <div class="tde-editor-text">
                <div class="tde-editor-toolbar">
                    <div class="tde-format-selector">
                        <label>格式：</label>
                        <select class="tde-format-select">
                            <option value="text">TXT</option>
                            <option value="json">JSON</option>
                            <option value="yaml">YAML</option>
                            <option value="csv">CSV</option>
                        </select>
                    </div>
                    <div class="tde-translate-controls">
                        <select class="tde-translate-from">${renderLangOptions(SOURCE_LANG_OPTIONS, "auto")}</select>
                        <span class="tde-translate-arrow">→</span>
                        <select class="tde-translate-to">${renderLangOptions(TARGET_LANG_OPTIONS, "en")}</select>
                        <button class="tde-btn tde-btn-small tde-btn-primary tde-translate-btn">翻译</button>
                    </div>
                </div>
                <textarea class="tde-textarea" placeholder="文本内容将在此显示，可直接编辑后再次翻译..."></textarea>
            </div>
        `;

        this.bindEvents();
    }

    createLightbox() {
        if (this.lightbox) return;

        this.lightbox = document.createElement("div");
        this.lightbox.className = "tde-image-lightbox";
        this.lightbox.innerHTML = `
            <div class="tde-image-lightbox-overlay"></div>
            <div class="tde-image-lightbox-content">
                <button class="tde-image-lightbox-close" title="关闭">&times;</button>
                <img class="tde-image-lightbox-img" alt="原图" />
            </div>
        `;
        document.body.appendChild(this.lightbox);

        const overlay = this.lightbox.querySelector(".tde-image-lightbox-overlay");
        const closeBtn = this.lightbox.querySelector(".tde-image-lightbox-close");

        overlay.addEventListener("click", () => this.closeLightbox());
        closeBtn.addEventListener("click", () => this.closeLightbox());

        this._lightboxKeyHandler = (e) => {
            if (e.key === "Escape" && this.lightbox?.classList.contains("tde-image-lightbox-show")) {
                this.closeLightbox();
            }
        };
        document.addEventListener("keydown", this._lightboxKeyHandler);
    }

    bindEvents() {
        const textarea = this.container.querySelector(".tde-textarea");
        const formatSelect = this.container.querySelector(".tde-format-select");
        const translateBtn = this.container.querySelector(".tde-translate-btn");
        const imageBox = this.container.querySelector(".tde-editor-image");

        textarea.addEventListener("input", () => {
            this.isDirty = true;
        });

        formatSelect.addEventListener("change", () => {
            this.currentFormat = formatSelect.value;
        });

        translateBtn.addEventListener("click", () => this.translateText());
        imageBox?.addEventListener("click", () => this.openLightbox());
    }

    openLightbox() {
        if (!this.currentImageUrl || !this.lightbox) return;

        const img = this.lightbox.querySelector(".tde-image-lightbox-img");
        img.src = this.currentImageUrl;
        this.lightbox.classList.add("tde-image-lightbox-show");
        document.body.style.overflow = "hidden";
    }

    closeLightbox() {
        if (!this.lightbox) return;

        this.lightbox.classList.remove("tde-image-lightbox-show");
        document.body.style.overflow = "";

        const img = this.lightbox.querySelector(".tde-image-lightbox-img");
        if (img) img.src = "";
    }

    notify(message, type = "info") {
        if (this.onNotify) {
            this.onNotify(message, type);
        }
    }

    async load(item) {
        this.currentItem = item;
        this.isDirty = false;

        const img = this.container.querySelector(".tde-editor-img");
        const imageWrap = this.container.querySelector(".tde-editor-image-wrap");
        const imgPlaceholder = this.container.querySelector(".tde-editor-img-placeholder");
        const textarea = this.container.querySelector(".tde-textarea");
        const formatSelect = this.container.querySelector(".tde-format-select");

        this.currentImageUrl = "";
        this.closeLightbox();

        if (item.image) {
            try {
                const url = `/training-data/image?path=${encodeURIComponent(item.image)}`;
                this.currentImageUrl = url;
                img.src = url;
                imageWrap.style.display = "block";
                imgPlaceholder.style.display = "none";
            } catch (e) {
                console.error("[TrainingDataEditor] 加载原图失败:", e);
                imageWrap.style.display = "none";
                imgPlaceholder.style.display = "flex";
            }
        } else {
            imageWrap.style.display = "none";
            imgPlaceholder.style.display = "flex";
        }

        if (item.text) {
            try {
                const url = `/training-data/text?path=${encodeURIComponent(item.text)}`;
                const resp = await fetch(url);
                const result = await resp.json();

                if (result.error) {
                    textarea.value = "";
                    this.currentContent = "";
                } else {
                    this.currentFormat = result.format || "text";
                    this.currentContent = result.content;

                    if (this.currentFormat === "json") {
                        textarea.value = JSON.stringify(result.content, null, 2);
                    } else if (typeof result.content === "string") {
                        textarea.value = result.content;
                    } else {
                        textarea.value = JSON.stringify(result.content, null, 2);
                    }

                    formatSelect.value = this.currentFormat;
                }
            } catch (e) {
                console.error("[TrainingDataEditor] 加载文本失败:", e);
                textarea.value = "";
                this.currentContent = "";
            }
        } else {
            textarea.value = "";
            this.currentContent = "";
        }

        this.isDirty = false;
    }

    async translateText() {
        if (this.isTranslating) return;

        const textarea = this.container.querySelector(".tde-textarea");
        const translateBtn = this.container.querySelector(".tde-translate-btn");
        const fromLang = this.container.querySelector(".tde-translate-from").value;
        const toLang = this.container.querySelector(".tde-translate-to").value;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const hasSelection = start !== end;

        let textToTranslate = hasSelection
            ? textarea.value.substring(start, end)
            : textarea.value;

        if (!textToTranslate.trim()) {
            this.notify("请先输入或选择要翻译的文本", "warning");
            return;
        }

        const originalBtnText = translateBtn.textContent;
        this.isTranslating = true;
        translateBtn.disabled = true;
        translateBtn.textContent = "翻译中...";

        try {
            const translated = await this.translationService.translate(textToTranslate, {
                from: fromLang,
                to: toLang,
            });

            if (hasSelection) {
                textarea.value =
                    textarea.value.substring(0, start) +
                    translated +
                    textarea.value.substring(end);
                textarea.selectionStart = start;
                textarea.selectionEnd = start + translated.length;
            } else {
                textarea.value = translated;
                textarea.selectionStart = 0;
                textarea.selectionEnd = translated.length;
            }

            this.isDirty = true;
            textarea.focus();
            this.notify("翻译完成，可继续编辑", "success");
        } catch (e) {
            console.error("[TrainingDataEditor] 翻译失败:", e);
            this.notify("翻译失败: " + e.message, "error");
        } finally {
            this.isTranslating = false;
            translateBtn.disabled = false;
            translateBtn.textContent = originalBtnText;
        }
    }

    getData() {
        if (!this.currentItem) return null;

        const textarea = this.container.querySelector(".tde-textarea");
        let content = textarea.value;

        let savePath = this.currentItem.text;
        if (!savePath) {
            const base = this.currentItem.image.replace(/\.[^.]+$/, "");
            savePath = base + ".txt";
        }

        if (this.currentFormat === "json") {
            try {
                content = JSON.parse(content);
            } catch (e) {
                // 保留原始字符串
            }
        }

        return {
            path: savePath,
            content: content,
            format: this.currentFormat,
        };
    }

    clear() {
        this.currentItem = null;
        this.currentContent = "";
        this.isDirty = false;

        const img = this.container.querySelector(".tde-editor-img");
        const imageWrap = this.container.querySelector(".tde-editor-image-wrap");
        const imgPlaceholder = this.container.querySelector(".tde-editor-img-placeholder");
        const textarea = this.container.querySelector(".tde-textarea");

        this.currentImageUrl = "";
        this.closeLightbox();
        img.src = "";
        imageWrap.style.display = "none";
        imgPlaceholder.style.display = "flex";
        textarea.value = "";
    }

    isVisible() {
        return this.container.closest(".tde-editor-panel")?.style.display !== "none";
    }
}
