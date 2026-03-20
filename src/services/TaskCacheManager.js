const fs = require('fs').promises;
const path = require('path');

class TaskCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '../../data/task_caches');
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create task cache directory:', error);
        }
    }

    getCacheFilePath(taskId) {
        return path.join(this.cacheDir, `${taskId}.json`);
    }

    async getCache(taskId) {
        try {
            const data = await fs.readFile(this.getCacheFilePath(taskId), 'utf-8');
            const arr = JSON.parse(data);
            return new Set(arr);
        } catch (error) {
            return new Set();
        }
    }

    async addCache(taskId, fileIds) {
        if (!fileIds || fileIds.length === 0) return;
        try {
            const cache = await this.getCache(taskId);
            let changed = false;
            for (const id of fileIds) {
                const strId = String(id);
                if (!cache.has(strId)) {
                    cache.add(strId);
                    changed = true;
                }
            }
            if (changed) {
                await fs.writeFile(this.getCacheFilePath(taskId), JSON.stringify(Array.from(cache)));
            }
        } catch (error) {
            console.error(`Failed to add cache for task ${taskId}:`, error);
        }
    }

    async clearCache(taskId) {
        try {
            await fs.unlink(this.getCacheFilePath(taskId));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Failed to clear cache for task ${taskId}:`, error);
            }
        }
    }
}

module.exports = new TaskCacheManager();
