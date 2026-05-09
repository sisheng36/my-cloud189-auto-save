const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');

class TaskRebuildService {
    constructor(taskService, taskRepo) {
        this.taskService = taskService;
        this.taskRepo = taskRepo;
    }
    
    async shouldRebuildTask(task, tmdbResult) {
        const config = {
            enabled: ConfigService.getConfigValue('task.autoRebuildUnidentifiedTask'),
            maxCount: ConfigService.getConfigValue('task.autoRebuildMaxCount') || 1,
            minInterval: ConfigService.getConfigValue('task.autoRebuildMinInterval') || 600000,
            deleteOriginal: ConfigService.getConfigValue('task.autoRebuildDeleteOriginal'),
            notifyUser: ConfigService.getConfigValue('task.autoRebuildNotifyUser')
        };
        
        if (!config.enabled) {
            return { should: false, reason: '功能未启用', config };
        }
        
        if (task.isRebuiltTask === true) {
            logTaskEvent(`[智能重建] ⛔ 终止：该任务已是重建任务 (ID: ${task.id})`);
            return { should: false, reason: '已是重建任务', config };
        }
        
        const rebuildCount = task.rebuildCount || 0;
        if (rebuildCount >= config.maxCount) {
            logTaskEvent(`[智能重建] ⛔ 终止：已达到重建次数上限 (${rebuildCount}/${config.maxCount})`);
            return { should: false, reason: `已达重建上限 ${rebuildCount}次`, config };
        }
        
        if (!tmdbResult || !tmdbResult.id || !tmdbResult.title) {
            logTaskEvent(`[智能重建] ⛔ 终止：TMDB 信息无效`);
            return { should: false, reason: 'TMDB 信息无效', config };
        }
        
        const normalizedTaskName = this._normalizeName(task.resourceName);
        const normalizedTmdbName = this._normalizeName(tmdbResult.title);
        
        if (normalizedTaskName === normalizedTmdbName) {
            logTaskEvent(`[智能重建] ℹ️ 跳过：任务名称已匹配 ("${task.resourceName}" === "${tmdbResult.title}")`);
            return { should: false, reason: '名称已一致', config };
        }
        
        if (task.tmdbId && String(task.tmdbId) === String(tmdbResult.id)) {
            logTaskEvent(`[智能重建] ℹ️ 跳过：TMDB ID 已一致 (${task.tmdbId})`);
            return { should: false, reason: 'TMDB ID 已一致', config };
        }
        
        if (task.lastRebuildTime) {
            const elapsed = Date.now() - new Date(task.lastRebuildTime).getTime();
            if (elapsed < config.minInterval) {
                const waitTime = Math.ceil((config.minInterval - elapsed) / 1000);
                logTaskEvent(`[智能重建] ℹ️ 跳过：间隔过短，还需等待 ${waitTime}秒`);
                return { should: false, reason: `间隔过短，等待${waitTime}秒`, config };
            }
        }
        
        if (task.rebuildFromTaskId) {
            const hasLoop = await this._detectRebuildLoop(task.rebuildFromTaskId, task.id);
            if (hasLoop) {
                logTaskEvent(`[智能重建] ⛔ 终止：检测到循环引用！`);
                return { should: false, reason: '检测到循环引用', config };
            }
        }
        
        logTaskEvent(`[智能重建] ✅ 通过所有检查，可以重建任务`);
        
        return {
            should: true,
            reason: '满足重建条件',
            config,
            details: {
                originalName: task.resourceName,
                tmdbName: tmdbResult.title,
                tmdbId: tmdbResult.id,
                rebuildCount: rebuildCount + 1
            }
        };
    }
    
    async rebuildTask(params) {
        const { originalTask, tmdbInfo, deleteOriginal, notifyUser } = params;
        
        logTaskEvent(`[智能重建] ========== 开始重建任务 ==========`);
        logTaskEvent(`  原任务 ID: ${originalTask.id}`);
        logTaskEvent(`  原任务名称: "${originalTask.resourceName}"`);
        logTaskEvent(`  TMDB 标题: "${tmdbInfo.title}"`);
        logTaskEvent(`  TMDB ID: ${tmdbInfo.id}`);
        logTaskEvent(`  TMDB 类型: ${tmdbInfo.type || 'tv'}`);
        
        let newTask = null;
        
        try {
            const newTaskInfo = this._buildNewTaskInfo(originalTask, tmdbInfo);
            
            logTaskEvent(`  新任务名称: "${newTaskInfo.resourceName}"`);
            logTaskEvent(`  新保存路径: "${newTaskInfo.targetFolder}"`);
            
            newTask = await this.taskService.createTask({
                accountId: originalTask.accountId,
                shareLink: originalTask.shareLink,
                accessCode: originalTask.accessCode,
                resourceName: newTaskInfo.resourceName,
                targetFolder: newTaskInfo.targetFolder,
                videoType: newTaskInfo.videoType,
                tmdbId: String(tmdbInfo.id),
                tmdbTitle: tmdbInfo.title,
                isRebuiltTask: true,
                rebuildFromTaskId: originalTask.id,
                rebuildCount: (originalTask.rebuildCount || 0) + 1,
                lastRebuildTime: new Date(),
                enableCron: false
            });
            
            logTaskEvent(`[智能重建] ✅ 新任务已创建: ID=${newTask.id}`);
            
            if (notifyUser && this.taskService.messageUtil) {
                await this._sendRebuildNotification({
                    originalTask,
                    newTask,
                    tmdbInfo,
                    deleteOriginal
                });
            }
            
            logTaskEvent(`[智能重建] 🚀 开始执行新任务...`);
            const executeResult = await this.taskService.processTask(newTask);
            
            if (!executeResult) {
                logTaskEvent(`[智能重建] ⚠️ 新任务执行失败，准备回滚`);
                await this.taskService.deleteTask(newTask.id, true);
                logTaskEvent(`[智能重建] 🔄 已回滚：删除创建的新任务`);
                return { success: false, reason: '新任务执行失败' };
            }
            
            logTaskEvent(`[智能重建] ✅ 新任务执行完成`);
            
            if (deleteOriginal) {
                logTaskEvent(`[智能重建] 🗑️ 删除原任务及网盘文件...`);
                await this.taskService.deleteTask(originalTask.id, true);
                logTaskEvent(`[智能重建] ✅ 原任务已删除（包含网盘文件）`);
            } else {
                await this.taskService.updateTask(originalTask.id, {
                    rebuildCount: (originalTask.rebuildCount || 0) + 1,
                    lastRebuildTime: new Date()
                });
                logTaskEvent(`[智能重建] ℹ️ 原任务已保留，更新重建计数`);
            }
            
            logTaskEvent(`[智能重建] ========== 重建完成 ==========`);
            
            return {
                success: true,
                newTaskId: newTask.id,
                originalTaskId: originalTask.id,
                deleted: deleteOriginal
            };
            
        } catch (error) {
            logTaskEvent(`[智能重建] ❌ 重建失败: ${error.message}`);
            console.error('[智能重建] 详细错误:', error);
            
            if (newTask) {
                try {
                    await this.taskService.deleteTask(newTask.id, true);
                    logTaskEvent(`[智能重建] 🔄 已回滚：删除创建的新任务`);
                } catch (rollbackError) {
                    logTaskEvent(`[智能重建] ⚠️ 回滚失败: ${rollbackError.message}`);
                }
            }
            
            return {
                success: false,
                reason: error.message,
                error
            };
        }
    }
    
    _buildNewTaskInfo(originalTask, tmdbInfo) {
        const year = tmdbInfo.year ? ` (${tmdbInfo.year})` : '';
        const resourceName = `${tmdbInfo.title}${year}`;
        
        const videoType = tmdbInfo.type || 'tv';
        const pathTemplate = ConfigService.getConfigValue('task.autoRebuildPathTemplate');
        
        let targetFolder;
        if (pathTemplate && pathTemplate[videoType]) {
            targetFolder = pathTemplate[videoType]
                .replace('{title}', tmdbInfo.title)
                .replace('{year}', tmdbInfo.year || '');
        } else {
            const typeDir = videoType === 'movie' ? '电影' : '电视剧';
            const baseDir = originalTask.account?.localStrmPrefix || '/media';
            targetFolder = `${baseDir}/${typeDir}/${resourceName}`;
        }
        
        return {
            resourceName,
            targetFolder,
            videoType
        };
    }
    
    async _sendRebuildNotification(params) {
        const { originalTask, newTask, tmdbInfo, deleteOriginal } = params;
        
        const content = 
            `✅ 任务重建成功\n\n` +
            `📦 原任务: ${originalTask.resourceName}\n` +
            `   ID: ${originalTask.id}\n\n` +
            `🎬 新任务: ${newTask.resourceName}\n` +
            `   ID: ${newTask.id}\n` +
            `   TMDB: ${tmdbInfo.title} (ID: ${tmdbInfo.id})\n` +
            `   类型: ${tmdbInfo.type === 'movie' ? '电影' : '电视剧'}\n\n` +
            `📁 新路径: ${newTask.targetFolder}\n\n` +
            `🗑️ 删除原任务: ${deleteOriginal ? '是' : '否'}`;
        
        await this.taskService.messageUtil.sendMessage({
            title: '🤖 智能任务重建',
            content
        });
    }
    
    async _detectRebuildLoop(parentId, currentId, visited = new Set()) {
        if (parentId === currentId) {
            return true;
        }
        
        if (visited.has(parentId)) {
            return false;
        }
        
        visited.add(parentId);
        
        const parentTask = await this.taskRepo.findOneBy({ id: parentId });
        if (!parentTask || !parentTask.rebuildFromTaskId) {
            return false;
        }
        
        return this._detectRebuildLoop(parentTask.rebuildFromTaskId, currentId, visited);
    }
    
    _normalizeName(name) {
        if (!name) return '';
        return name
            .replace(/\s*\(\d{4}\)$/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
}

module.exports = TaskRebuildService;
