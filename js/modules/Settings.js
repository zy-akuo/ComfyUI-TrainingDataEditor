/**
 * Settings - 设置面板
 * 管理翻译引擎配置、缩略图大小等
 */

export class Settings {
    constructor(config, onSave) {
        this.config = config;
        this.onSave = onSave;
        this.dialog = null;
    }

    open() {
        if (this.dialog) {
            this.dialog.style.display = "flex";
            return;
        }

        this.createDialog();
    }

    close() {
        if (this.dialog) {
            this.dialog.style.display = "none";
        }
    }

    createDialog() {
        this.dialog = document.createElement("div");
        this.dialog.className = "tde-settings-dialog";
        this.dialog.innerHTML = `
            <div class="tde-settings-overlay"></div>
            <div class="tde-settings-container">
                <div class="tde-settings-header">
                    <h3>设置</h3>
                    <button class="tde-settings-close">&times;</button>
                </div>
                <div class="tde-settings-body">
                    <div class="tde-settings-section">
                        <h4>翻译设置</h4>
                        <div class="tde-settings-row">
                            <label>翻译引擎：</label>
                            <select class="tde-engine-select">
                                <option value="baidu">百度翻译</option>
                                <option value="google">Google 翻译</option>
                            </select>
                        </div>
                        <div class="tde-settings-row tde-baidu-config">
                            <label>百度 AppID：</label>
                            <input type="text" class="tde-appid-input" placeholder="输入百度翻译 AppID" />
                        </div>
                        <div class="tde-settings-row tde-baidu-config">
                            <label>百度 AppKey：</label>
                            <input type="password" class="tde-appkey-input" placeholder="输入百度翻译 AppKey" />
                        </div>
                        <div class="tde-settings-row">
                            <label>默认翻译方向：</label>
                            <select class="tde-from-select">
                                <option value="auto">自动检测</option>
                                <option value="zh">中文</option>
                                <option value="en">英文</option>
                                <option value="ja">日文</option>
                            </select>
                            <span> → </span>
                            <select class="tde-to-select">
                                <option value="en">英文</option>
                                <option value="zh">中文</option>
                                <option value="ja">日文</option>
                            </select>
                        </div>
                    </div>
                    <div class="tde-settings-section">
                        <h4>性能设置</h4>
                        <div class="tde-settings-row">
                            <label>缩略图大小：</label>
                            <input type="number" class="tde-thumbnail-size-input" min="128" max="512" step="64" />
                            <span>像素</span>
                        </div>
                        <div class="tde-settings-row">
                            <label>每页加载数量：</label>
                            <input type="number" class="tde-page-size-input" min="20" max="200" step="10" />
                            <span>张</span>
                        </div>
                    </div>
                </div>
                <div class="tde-settings-footer">
                    <button class="tde-btn tde-btn-cancel">取消</button>
                    <button class="tde-btn tde-btn-primary tde-settings-save">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);
        this.loadConfig();
        this.bindEvents();
    }

    loadConfig() {
        const engineSelect = this.dialog.querySelector(".tde-engine-select");
        const appidInput = this.dialog.querySelector(".tde-appid-input");
        const appkeyInput = this.dialog.querySelector(".tde-appkey-input");
        const fromSelect = this.dialog.querySelector(".tde-from-select");
        const toSelect = this.dialog.querySelector(".tde-to-select");
        const thumbnailSizeInput = this.dialog.querySelector(".tde-thumbnail-size-input");
        const pageSizeInput = this.dialog.querySelector(".tde-page-size-input");

        engineSelect.value = this.config.translate_engine || "baidu";
        appidInput.value = this.config.baidu_appid || "";
        appkeyInput.value = this.config.baidu_appkey || "";
        fromSelect.value = this.config.translate_from || "auto";
        toSelect.value = this.config.translate_to || "en";
        thumbnailSizeInput.value = this.config.thumbnail_size || 256;
        pageSizeInput.value = this.config.page_size || 50;

        this.updateBaiduConfigVisibility();
    }

    bindEvents() {
        const closeBtn = this.dialog.querySelector(".tde-settings-close");
        const overlay = this.dialog.querySelector(".tde-settings-overlay");
        const cancelBtn = this.dialog.querySelector(".tde-btn-cancel");
        const saveBtn = this.dialog.querySelector(".tde-settings-save");
        const engineSelect = this.dialog.querySelector(".tde-engine-select");

        closeBtn.onclick = () => this.close();
        overlay.onclick = () => this.close();
        cancelBtn.onclick = () => this.close();
        saveBtn.onclick = () => this.save();

        engineSelect.onchange = () => this.updateBaiduConfigVisibility();
    }

    updateBaiduConfigVisibility() {
        const engineSelect = this.dialog.querySelector(".tde-engine-select");
        const baiduConfigs = this.dialog.querySelectorAll(".tde-baidu-config");
        const showBaidu = engineSelect.value === "baidu";

        baiduConfigs.forEach(el => {
            el.style.display = showBaidu ? "flex" : "none";
        });
    }

    async save() {
        const engineSelect = this.dialog.querySelector(".tde-engine-select");
        const appidInput = this.dialog.querySelector(".tde-appid-input");
        const appkeyInput = this.dialog.querySelector(".tde-appkey-input");
        const fromSelect = this.dialog.querySelector(".tde-from-select");
        const toSelect = this.dialog.querySelector(".tde-to-select");
        const thumbnailSizeInput = this.dialog.querySelector(".tde-thumbnail-size-input");
        const pageSizeInput = this.dialog.querySelector(".tde-page-size-input");

        const newConfig = {
            translate_engine: engineSelect.value,
            baidu_appid: appidInput.value,
            baidu_appkey: appkeyInput.value,
            translate_from: fromSelect.value,
            translate_to: toSelect.value,
            thumbnail_size: parseInt(thumbnailSizeInput.value),
            page_size: parseInt(pageSizeInput.value),
        };

        this.config = newConfig;

        if (this.onSave) {
            await this.onSave(newConfig);
        }

        this.close();
    }
}
