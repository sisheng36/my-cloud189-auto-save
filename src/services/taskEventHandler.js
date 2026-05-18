const { StrmService } = require('./strm');
const { EmbyService } = require('./emby');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { ScrapeService } = require('./ScrapeService');

class TaskEventHandler {
    constructor(messageUtil) {
        this.messageUtil = messageUtil;
    }

    async handle(taskCompleteEventDto) {
        if (taskCompleteEventDto.fileList.length === 0) {
            return;
        }
        const task = taskCompleteEventDto.task;
        const taskRepo = taskCompleteEventDto.taskRepo;
        logTaskEvent(` ${task.resourceName} 触发事件:`);
        try {
            await this._handleAutoRename(taskCompleteEventDto);
            await this._handleLatestSavedDisplay(taskCompleteEventDto);
            await this._handleStrmGeneration(taskCompleteEventDto);
            await this._handleAlistCache(taskCompleteEventDto);
            await this._handleMediaScraping(taskCompleteEventDto);
            this._handleEmbyNotification(taskCompleteEventDto)
        } catch (error) {
            console.error(error);
            logTaskEvent(`任务完成后处理失败: ${error.message}`);
        }
        logTaskEvent(`================事件处理完成================`);

        // 事件处理完成后，恢复任务状态为 pending（除非已 completed）
        if (taskRepo && task.status === 'processing') {
            task.status = 'pending';
            await taskRepo.save(task);
            logTaskEvent(`任务状态已恢复为 pending`);
        }
    }

    _extractEpisodeInfo(fileName) {
        if (!fileName) return null;
        const patterns = [
            /S(\d{1,2})E(\d{1,4})/i,
            /第\s*(\d{1,4})\s*[集话话]/,
            /(?:EP|E)(\d{1,4})(?!\d)/i
        ];
        for (const pattern of patterns) {
            const match = fileName.match(pattern);
            if (!match) continue;
            if (match.length >= 3 && /S/i.test(match[0])) {
                return {
                    season: parseInt(match[1], 10),
                    episode: parseInt(match[2], 10),
                    label: `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}`
                };
            }
            const episode = parseInt(match[1], 10);
            return {
                season: null,
                episode,
                label: `第${episode}集`
            };
        }
        return null;
    }

    _isSeriesTask(task, fileList) {
        if (task.videoType) {
            return task.videoType !== 'movie';
        }
        if ((task.totalEpisodes || 0) > 1) {
            return true;
        }
        return fileList.some(file => this._extractEpisodeInfo(file.name));
    }

    buildLatestSavedDisplay(task, allFiles = []) {
        const mediaFiles = (allFiles || []).filter(file => !file.isFolder);
        if (mediaFiles.length === 0) {
            return {
                lastSavedFileName: null,
                lastSavedDisplayText: null,
                missingEpisodes: null
            };
        }

        const latestFile = mediaFiles[mediaFiles.length - 1];
        let lastSavedDisplayText = latestFile.name;
        let missingEpisodes = null;

        if (this._isSeriesTask(task, mediaFiles)) {
            const episodeInfos = mediaFiles
                .map(file => ({ file, episodeInfo: this._extractEpisodeInfo(file.name) }))
                .filter(item => item.episodeInfo && Number.isInteger(item.episodeInfo.episode));

            if (episodeInfos.length > 0) {
                episodeInfos.sort((a, b) => {
                    const seasonA = a.episodeInfo.season || 1;
                    const seasonB = b.episodeInfo.season || 1;
                    if (seasonA !== seasonB) return seasonA - seasonB;
                    return a.episodeInfo.episode - b.episodeInfo.episode;
                });

                const latestEpisode = episodeInfos[episodeInfos.length - 1].episodeInfo;
                lastSavedDisplayText = `已更新到${latestEpisode.label}`;

                const targetSeason = latestEpisode.season || episodeInfos[0].episodeInfo.season || 1;
                const seasonEpisodes = episodeInfos
                    .filter(item => (item.episodeInfo.season || 1) === targetSeason)
                    .map(item => item.episodeInfo.episode);
                const episodeSet = new Set(seasonEpisodes);
                const missing = [];
                for (let ep = 1; ep < latestEpisode.episode; ep++) {
                    if (!episodeSet.has(ep)) {
                        missing.push(targetSeason ? `S${String(targetSeason).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : `第${ep}集`);
                    }
                }
                if (missing.length > 0) {
                    missingEpisodes = JSON.stringify(missing);
                }
            }
        }

        return {
            lastSavedFileName: latestFile.name,
            lastSavedDisplayText,
            missingEpisodes
        };
    }

    async _handleLatestSavedDisplay(taskCompleteEventDto) {
        const { task, taskRepo } = taskCompleteEventDto;
        const finalFiles = (taskCompleteEventDto.fileList || []).filter(file => !file.isFolder);
        if (finalFiles.length === 0 || !taskRepo) {
            return;
        }
        const allFiles = [
            ...((taskCompleteEventDto.existingFiles || []).filter(file => !file.isFolder)),
            ...finalFiles
        ];
        const latestSavedDisplay = this.buildLatestSavedDisplay(task, allFiles);
        task.lastSavedFileName = latestSavedDisplay.lastSavedFileName;
        task.lastSavedDisplayText = latestSavedDisplay.lastSavedDisplayText;
        task.missingEpisodes = latestSavedDisplay.missingEpisodes;
        await taskRepo.save(task);
    }
    async _handleAutoRename(taskCompleteEventDto) {
        try {
            const {task, taskService, cloud189, taskRepo} = taskCompleteEventDto;
            const originalFileCount = (taskCompleteEventDto.fileList || []).filter(file => !file.isFolder).length;
            // 重新从数据库获取最新的任务对象，确保包含用户手动绑定的 TMDB 信息
            const freshTask = await taskRepo.findOneBy({ id: task.id });
            if (freshTask) {
                // 合并最新字段到当前 task 对象
                task.manualTmdbBound = freshTask.manualTmdbBound;
                task.tmdbId = freshTask.tmdbId;
                task.tmdbTitle = freshTask.tmdbTitle;
                task.videoType = freshTask.videoType;
                task.manualSeason = freshTask.manualSeason;
            }
            const result = await taskService.autoRename(cloud189, task);
            const hasResultFiles = result && result.newFiles && result.newFiles.length > 0;
            const folderPath = task.realFolderName || task.realFolderId || '';
            const shouldTriggerWebhook = originalFileCount > 0;
            const webhookFileCount = hasResultFiles ? result.newFiles.length : originalFileCount;

            if (result && result.newFiles && result.newFiles.length > 0) {
                taskCompleteEventDto.fileList = result.newFiles;
                // 发送重命名完成通知（带详细内容）
                let message = `✅《${task.resourceName}》重命名完成\n已处理 ${result.newFiles.length} 个文件`;
                if (folderPath) {
                    message += `\n📁 ${folderPath}`;
                }
                // 添加重命名详情（最多显示10条，避免消息过长）
                if (result.renameMessages && result.renameMessages.length > 0) {
                    const details = result.renameMessages.slice(0, 10);
                    message += `\n${details.join('\n')}`;
                    if (result.renameMessages.length > 10) {
                        message += `\n└─ ... 等${result.renameMessages.length}个文件`;
                    }
                }
                this.messageUtil.sendMessage(message);
            }

            if (shouldTriggerWebhook) {
                let webhookMessage = `✅《${task.resourceName}》新增文件后处理完成\n已处理 ${webhookFileCount} 个文件`;
                if (folderPath) {
                    webhookMessage += `\n📁 ${folderPath}`;
                }
                // webhook 在自动重命名步骤之后触发，确保下游系统处理的是最终文件状态。
                await this.messageUtil.sendWebhookMessage(webhookMessage);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`自动重命名失败: ${error.message}`);
        }
    }

    async _handleStrmGeneration(taskCompleteEventDto) {
        try {
            const {task,taskService, overwriteStrm} = taskCompleteEventDto;
            const strmService = new StrmService();
            if (ConfigService.getConfigValue('strm.enable')) {
                // 获取文件列表
                const fileList = await taskService.getFilesByTask(task)
                const message = await strmService.generate(task, fileList, overwriteStrm);
                this.messageUtil.sendMessage(message);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`生成STRM文件失败: ${error.message}`);
        }
    }

    async _handleAlistCache(taskCompleteEventDto) {
        try {
            const {task, taskService, firstExecution} = taskCompleteEventDto;
            await taskService.refreshAlistCache(task, firstExecution)
        } catch (error) {
            console.error(error);
            logTaskEvent(`刷新Alist缓存失败: ${error.message}`);
        }
    }

    async _handleMediaScraping(taskCompleteEventDto) {
        try {
            const {task, taskRepo} = taskCompleteEventDto;
            if (ConfigService.getConfigValue('tmdb.enableScraper') && task?.enableTaskScraper) {
                const strmService = new StrmService();
                const strmPath = strmService.getStrmPath(task);
                if (strmPath) {
                    const scrapeService = new ScrapeService();
                    logTaskEvent(`开始刮削tmdbId: ${task.tmdbId}的媒体信息, 路径: ${strmPath}`);
                    const mediaDetails = await scrapeService.scrapeFromDirectory(strmPath, task.tmdbId);
                    if (mediaDetails) {
                        if (task.tmdbId != mediaDetails.tmdbId) {
                            await taskRepo.update(task.id, {
                                tmdbId: mediaDetails.tmdbId,
                                tmdbContent: JSON.stringify(mediaDetails)
                            });
                        }
                        const shortOverview = mediaDetails.overview ? 
                            (mediaDetails.overview.length > 20 ? mediaDetails.overview.substring(0, 50) + '...' : mediaDetails.overview) : 
                            '暂无';
                        const message = {
                            title: `✅ 刮削成功：${mediaDetails.title}`,
                            image: mediaDetails.backdropPath,
                            description: shortOverview,
                            rating: mediaDetails.voteAverage,
                            type: mediaDetails.type
                        }
                        this.messageUtil.sendScrapeMessage(message);
                    }
                }
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`媒体刮削失败: ${error.message}`);
        }
    }

    async _handleEmbyNotification(taskCompleteEventDto) {
        try {
            const {task} = taskCompleteEventDto;
            const embyEnabled = ConfigService.getConfigValue('emby.enable');
            const embyUrl = ConfigService.getConfigValue('emby.serverUrl');
            // 同时检查启用状态和服务器地址是否已配置
            if (embyEnabled && embyUrl) {
                const embyService = new EmbyService();
                await embyService.notify(task);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`通知Emby失败: ${error.message}`);
        }
    }
}

module.exports = { TaskEventHandler };
