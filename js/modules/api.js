/**
 * API 请求封装 - 使用 ComfyUI fileURL，兼容子路径部署
 */

import { api } from "/scripts/api.js";

function buildHeaders(options = {}) {
    const headers = { ...(options.headers || {}) };
    if (api?.user) {
        headers["Comfy-User"] = api.user;
    }
    return headers;
}

function resolveUrl(path) {
    if (api?.fileURL) {
        return api.fileURL(path);
    }
    return path;
}

export async function tdeFetch(path, options = {}) {
    const url = resolveUrl(path);
    let resp;
    try {
        resp = await fetch(url, {
            cache: "no-cache",
            ...options,
            headers: buildHeaders(options),
        });
    } catch (e) {
        if (e?.name === "AbortError") {
            throw e;
        }
        throw new Error(e?.message || "网络请求失败");
    }

    const text = await resp.text();

    if (!text || !text.trim()) {
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: 空响应`);
        }
        return {};
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(
            `服务器返回无效 JSON (HTTP ${resp.status}): ${text.slice(0, 120)}`
        );
    }

    if (!resp.ok && !data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data;
}
