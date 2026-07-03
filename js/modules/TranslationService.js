/**
 * TranslationService - 翻译服务
 * 支持百度翻译和 Google 翻译双引擎
 */

import { tdeFetch } from "./api.js";

export class TranslationService {
    constructor(config) {
        this.config = config;
    }
    
    async translate(text, options = {}) {
        const engine = options.engine || this.config.translate_engine || "baidu";
        const fromLang = options.from || "auto";
        const toLang = options.to || "en";
        
        try {
            const result = await tdeFetch("/training-data/translate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: text,
                    engine: engine,
                    from_lang: fromLang,
                    to_lang: toLang,
                }),
            });

            if (result.error) {
                throw new Error(result.error);
            }

            return result.translated || text;
        } catch (error) {
            console.error("[TrainingDataEditor] 翻译失败:", error);
            throw error;
        }
    }
    
    async translateBatch(texts, options = {}) {
        const results = [];
        for (const text of texts) {
            try {
                const translated = await this.translate(text, options);
                results.push({ original: text, translated: translated, success: true });
            } catch (error) {
                results.push({ original: text, translated: text, success: false, error: error.message });
            }
        }
        return results;
    }
}
