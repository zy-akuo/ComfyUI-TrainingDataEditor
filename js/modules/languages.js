/**
 * 翻译语言选项
 */

export const SOURCE_LANG_OPTIONS = [
    { value: "auto", label: "自动检测" },
    { value: "zh", label: "中文" },
    { value: "en", label: "英文" },
    { value: "ja", label: "日文" },
    { value: "ko", label: "韩文" },
    { value: "fr", label: "法文" },
    { value: "de", label: "德文" },
    { value: "es", label: "西班牙文" },
    { value: "ru", label: "俄文" },
];

export const TARGET_LANG_OPTIONS = SOURCE_LANG_OPTIONS.filter((item) => item.value !== "auto");

export function renderLangOptions(options, selectedValue) {
    return options
        .map(
            (item) =>
                `<option value="${item.value}"${item.value === selectedValue ? " selected" : ""}>${item.label}</option>`
        )
        .join("");
}

export function getLangLabel(value) {
    const item = SOURCE_LANG_OPTIONS.find((opt) => opt.value === value);
    return item ? item.label : value;
}
