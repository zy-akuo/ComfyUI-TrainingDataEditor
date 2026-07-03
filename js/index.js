/**
 * ComfyUI Training Data Editor - 前端入口
 * 通过 ComfyUI 官方侧边栏 API 注册图标按钮
 */

import { app } from "/scripts/app.js";

const TAB_ID = "training-data-editor";
const SIDEBAR_ICON = "pi pi-file-edit";
let manager = null;
let sidebarRegistered = false;

function loadStyles() {
    if (document.getElementById("tde-styles")) return;
    const link = document.createElement("link");
    link.id = "tde-styles";
    link.rel = "stylesheet";
    link.href = new URL("./styles/training-data.css", import.meta.url).href;
    document.head.appendChild(link);
}

function waitForExtensionManager() {
    return new Promise((resolve) => {
        const check = () => {
            if (app.extensionManager?.registerSidebarTab) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

async function ensureManager() {
    if (!manager) {
        const { TrainingDataManager } = await import("./modules/TrainingDataManager.js");
        manager = new TrainingDataManager();
    }
    return manager;
}

function registerSidebarTab() {
    if (sidebarRegistered) {
        return true;
    }

    if (!app.extensionManager?.registerSidebarTab) {
        console.error("[TrainingDataEditor] extensionManager 不可用");
        return false;
    }

    try {
        app.extensionManager.registerSidebarTab({
            id: TAB_ID,
            icon: SIDEBAR_ICON,
            title: "Training Data Editor",
            tooltip: "训练素材编辑器",
            type: "custom",
            render: (el) => {
                el.innerHTML = `
                    <div class="tde-sidebar-panel">
                        <p>训练素材编辑器已打开</p>
                        <button class="tde-btn tde-btn-primary tde-reopen-btn">重新打开编辑器</button>
                    </div>
                `;
                el.querySelector(".tde-reopen-btn")?.addEventListener("click", async () => {
                    const mgr = await ensureManager();
                    mgr.open();
                });

                ensureManager().then((mgr) => mgr.open());
            },
        });

        sidebarRegistered = true;
        console.log("[TrainingDataEditor] 侧边栏标签已注册");
        return true;
    } catch (error) {
        console.error("[TrainingDataEditor] 注册侧边栏失败:", error);
        return false;
    }
}

async function initSidebarTab() {
    loadStyles();

    // 清理旧版手动插入的浮动按钮
    document.querySelectorAll(".tde-sidebar-btn").forEach((el) => el.remove());

    if (registerSidebarTab()) {
        return;
    }

    await waitForExtensionManager();

    for (const delay of [200, 500, 1000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (registerSidebarTab()) {
            return;
        }
    }

    console.error("[TrainingDataEditor] 侧边栏注册失败，请刷新页面重试");
}

app.registerExtension({
    name: "ComfyUI.TrainingDataEditor",

    async setup() {
        await initSidebarTab();
    },
});
