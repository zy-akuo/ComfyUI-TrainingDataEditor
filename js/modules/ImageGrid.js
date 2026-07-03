/**
 * ImageGrid - 图片网格组件
 * 负责分页加载、懒加载、虚拟滚动
 */

export class ImageGrid {
    constructor(container, config, onSelect, onDelete) {
        this.container = container;
        this.config = config;
        this.onSelect = onSelect;
        this.onDelete = onDelete;
        
        this.pageSize = config.page_size || 50;
        this.currentPage = 0;
        this.allItems = [];
        this.visibleItems = [];
        this.selectedItem = null;
        
        this.observer = null;
        this.initObserver();
        
        this.createGrid();
        this.bindScrollEvent();
    }
    
    initObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadCardImage(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: "200px",
            threshold: 0.1
        });
    }
    
    createGrid() {
        this.gridElement = document.createElement("div");
        this.gridElement.className = "tde-grid";
        this.container.appendChild(this.gridElement);
    }
    
    bindScrollEvent() {
        this.container.addEventListener("scroll", () => {
            const { scrollTop, scrollHeight, clientHeight } = this.container;
            const threshold = 200;
            
            if (scrollHeight - scrollTop - clientHeight < threshold) {
                this.loadNextPage();
            }
        });
    }
    
    loadItems(items) {
        this.allItems = items;
        this.currentPage = 0;
        this.visibleItems = [];
        this.selectedItem = null;
        
        this.gridElement.innerHTML = "";
        this.loadNextPage();
    }
    
    loadNextPage() {
        const start = this.currentPage * this.pageSize;
        const end = start + this.pageSize;
        const pageItems = this.allItems.slice(start, end);
        
        if (pageItems.length === 0) return;
        
        pageItems.forEach((item, index) => {
            const card = this.createCard(item, start + index);
            this.gridElement.appendChild(card);
            this.visibleItems.push({ item, card, index: start + index });
        });
        
        this.currentPage++;
    }
    
    createCard(item, index) {
        const card = document.createElement("div");
        card.className = "tde-card";
        card.dataset.index = index;
        
        const thumbnail = document.createElement("div");
        thumbnail.className = "tde-card-thumbnail";
        thumbnail.dataset.path = item.image;
        
        const placeholder = document.createElement("div");
        placeholder.className = "tde-thumbnail-placeholder";
        placeholder.textContent = "🖼️";
        thumbnail.appendChild(placeholder);
        
        const info = document.createElement("div");
        info.className = "tde-card-info";
        
        const imageName = document.createElement("div");
        imageName.className = "tde-image-name";
        imageName.textContent = item.image_name;
        
        const textName = document.createElement("div");
        textName.className = "tde-text-name";
        textName.textContent = item.text_name || "(无文本)";
        
        info.appendChild(imageName);
        info.appendChild(textName);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "tde-card-delete-btn";
        deleteBtn.type = "button";
        deleteBtn.title = "删除图片和文本";
        deleteBtn.setAttribute("aria-label", "删除图片和文本");
        deleteBtn.textContent = "×";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.onDelete) {
                this.onDelete(item);
            }
        });
        
        card.appendChild(thumbnail);
        card.appendChild(info);
        card.appendChild(deleteBtn);
        
        card.addEventListener("click", () => {
            this.selectCard(card, item);
        });
        
        this.observer.observe(thumbnail);
        
        return card;
    }
    
    async loadCardImage(thumbnailElement) {
        const imagePath = thumbnailElement.dataset.path;
        if (!imagePath) return;
        
        try {
            const size = this.config.thumbnail_size || 256;
            const url = `/training-data/thumbnail?path=${encodeURIComponent(imagePath)}&size=${size}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            const img = document.createElement("img");
            img.src = imageUrl;
            img.alt = "缩略图";
            
            thumbnailElement.innerHTML = "";
            thumbnailElement.appendChild(img);
            
        } catch (error) {
            console.error("[TrainingDataEditor] 加载缩略图失败:", error);
            thumbnailElement.innerHTML = '<div class="tde-thumbnail-error">❌</div>';
        }
    }
    
    selectCard(cardElement, item) {
        if (this.selectedItem) {
            this.selectedItem.card.classList.remove("tde-card-selected");
        }
        
        cardElement.classList.add("tde-card-selected");
        this.selectedItem = { card: cardElement, item };
        
        if (this.onSelect) {
            this.onSelect(item);
        }
    }
    
    getSelectedItem() {
        return this.selectedItem ? this.selectedItem.item : null;
    }

    clearSelection() {
        if (this.selectedItem) {
            this.selectedItem.card.classList.remove("tde-card-selected");
            this.selectedItem = null;
        }
    }

    removeItem(item) {
        const imagePath = item.image;
        this.allItems = this.allItems.filter((entry) => entry.image !== imagePath);
        this.visibleItems = this.visibleItems.filter((entry) => {
            if (entry.item.image === imagePath) {
                entry.card.remove();
                return false;
            }
            return true;
        });

        if (this.selectedItem?.item.image === imagePath) {
            this.selectedItem = null;
        }
    }
    
    clear() {
        this.allItems = [];
        this.visibleItems = [];
        this.selectedItem = null;
        this.currentPage = 0;
        this.gridElement.innerHTML = "";
    }
    
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.clear();
    }
}
