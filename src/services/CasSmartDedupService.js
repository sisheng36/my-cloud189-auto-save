/**
 * CAS 智能去重服务
 * 用于初次执行/清缓存后批量处理 CAS 文件
 * 流程：转存 → 重命名 → 比对 → 删除已存在/秒传缺失
 */

const CasUtils = require('../utils/CasUtils');
const BatchTaskDto = require('../dto/BatchTaskDto');
const taskCacheManager = require('./TaskCacheManager');
const Cloud189Service = require('./cloud189');

class CasSmartDedupService {
    constructor(taskService) {
        this.taskService = taskService;
        this.logTaskEvent = taskService.logTaskEvent.bind(taskService);
    }

    /**
     * CAS 智能去重主流程
     * @param {Object} task - 任务对象
     * @param {Object} cloud189 - 云盘服务实例
     * @param {Array} newCasFiles - 需处理的 CAS 文件列表
     * @param {string} tmdbTitle - TMDB 标题
     * @param {Object} options - 配置选项
     * @returns {Object} 处理结果
     */
    async process(task, cloud189, newCasFiles, tmdbTitle, options = {}) {
        const {
            enableCasFamilyTransfer = false,
            casFamilyFolderIdActual = '',
            familyCloud189 = null,
            account = null,
            enableDeleteCasFile = true
        } = options;

        const successFiles = [];
        const casResults = [];
        const failedShareFileIds = new Set();
        let casSuccessCount = 0;

        this.logTaskEvent('[CAS智能去重] 开始处理 ' + newCasFiles.length + ' 个 CAS 文件');
        this.logTaskEvent('[CAS智能去重] TMDB 标题: ' + tmdbTitle);

        // 1. 批量转存所有 CAS 文件
        const transferResult = await this._batchTransfer(task, cloud189, newCasFiles);
        if (!transferResult.success) {
            for (const f of newCasFiles) {
                failedShareFileIds.add(String(f.id));
            }
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        }

        // 2. 刷新目录获取转存后的 CAS 文件
        let savedCasFiles = [];
        try {
            const folderFilesAfter = await this.taskService.getAllFolderFiles(cloud189, task);
            savedCasFiles = folderFilesAfter.filter(f => CasUtils.isCasFile(f.name));
            this.logTaskEvent('[CAS智能去重] 目标目录现有 ' + savedCasFiles.length + ' 个 CAS 文件');
        } catch (e) {
            this.logTaskEvent('[CAS智能去重] 刷新目录失败: ' + e.message);
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        }

        // 3. 批量重命名 CAS 文件
        this.logTaskEvent('[CAS智能去重] 开始重命名 CAS 文件...');
        const renamedFiles = await this._renameCasFiles(cloud189, savedCasFiles, tmdbTitle);

        // 4. 刷新目录获取重命名后的文件和目标目录视频
        const compareResult = await this._refreshAndCompare(cloud189, task);
        if (!compareResult.success) {
            return { successFiles, casResults, failedShareFileIds, casSuccessCount };
        }

        const { existingBaseNames, existingVideoNames, renamedCasFiles } = compareResult;

        // 5. 去后缀比对，分类处理
        const { toDelete, toUpload } = this._compareCasWithExisting(renamedCasFiles, existingBaseNames, existingVideoNames);

        this.logTaskEvent('[CAS智能去重] 已存在 ' + toDelete.length + ' 个，需秒传 ' + toUpload.length + ' 个');

        // 6. 删除已存在的 CAS 文件并缓存
        if (toDelete.length > 0) {
            const deleteResult = await this._deleteExistingCas(cloud189, task, toDelete);
            casSuccessCount += deleteResult.deletedCount;
        }

        // 7. 秒传缺失的文件
        if (toUpload.length > 0) {
            this.logTaskEvent('[CAS智能去重] 开始秒传 ' + toUpload.length + ' 个缺失文件...');
            const uploadResult = await this._uploadMissingFiles(
                task, cloud189, toUpload,
                enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account
            );

            successFiles.push(...uploadResult.successFiles);
            casResults.push(...uploadResult.casResults);
            for (const id of uploadResult.failedShareFileIds) {
                failedShareFileIds.add(id);
            }
            casSuccessCount += uploadResult.casSuccessCount;
        }

        // 8. 清理目标目录所有 CAS 文件（如果配置启用）
        if (enableDeleteCasFile) {
            await this._cleanupAllCas(cloud189, task);
        }

        return { successFiles, casResults, failedShareFileIds, casSuccessCount };
    }

    // 批量转存
    async _batchTransfer(task, cloud189, casFiles) {
        let retryCount = 0;
        const MAX_RETRY = 3;

        while (retryCount < MAX_RETRY) {
            try {
                const casTaskInfoList = casFiles.map(f => ({
                    fileId: f.id,
                    fileName: f.name,
                    isFolder: 0,
                    md5: f.md5,
                }));
                const casBatchTask = new BatchTaskDto({
                    taskInfos: JSON.stringify(casTaskInfoList),
                    type: 'SHARE_SAVE',
                    targetFolderId: task.realFolderId,
                    shareId: task.shareId
                });
                await this.taskService.createBatchTask(cloud189, casBatchTask);
                this.logTaskEvent('[CAS智能去重] ' + casFiles.length + ' 个 CAS 文件批量转存完成');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return { success: true };
            } catch (error) {
                if (error.message.includes('ShareSaveTaskIsAlreadyExist') || error.message.includes('BatchOperFileFailed')) {
                    retryCount++;
                    this.logTaskEvent('[CAS智能去重] 队列堵塞，等待5秒重试(' + retryCount + '/' + MAX_RETRY + ')');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    this.logTaskEvent('[CAS智能去重] 批量转存失败: ' + error.message);
                    return { success: false };
                }
            }
        }
        return { success: false };
    }

    // 批量重命名 CAS 文件
    async _renameCasFiles(cloud189, casFiles, tmdbTitle) {
        const renamedFiles = [];
        for (const casFile of casFiles) {
            try {
                const { season, episode } = this.taskService._extractSeasonEpisode(casFile.name);
                if (!episode) {
                    renamedFiles.push(casFile);
                    continue;
                }
                const newName = this.taskService._generateCasTargetName(casFile.name, tmdbTitle, season, episode);
                if (casFile.name === newName) {
                    renamedFiles.push(casFile);
                    continue;
                }
                const renameResult = await cloud189.renameFile(casFile.id, newName);
                if (renameResult && renameResult.res_code === 0) {
                    this.logTaskEvent('[CAS重命名] ' + casFile.name + ' -> ' + newName);
                    renamedFiles.push({ ...casFile, name: newName });
                } else {
                    this.logTaskEvent('[CAS重命名] ' + casFile.name + ' 失败');
                    renamedFiles.push(casFile);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                this.logTaskEvent('[CAS重命名] ' + casFile.name + ' 异常: ' + error.message);
                renamedFiles.push(casFile);
            }
        }
        return renamedFiles;
    }

    // 刷新目录并构建比对集合
    async _refreshAndCompare(cloud189, task) {
        try {
            const folderFiles = await this.taskService.getAllFolderFiles(cloud189, task);
            const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];

            const getBaseNameWithoutExt = (name) => {
                name = name.replace(/\.cas$/i, '');
                for (const ext of mediaExtensions) {
                    if (name.toLowerCase().endsWith(ext)) return name.slice(0, -ext.length);
                }
                return name;
            };

            const existingBaseNames = new Set(
                folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => getBaseNameWithoutExt(f.name))
            );
            const existingVideoNames = new Set(
                folderFiles.filter(f => !CasUtils.isCasFile(f.name)).map(f => f.name)
            );
            const renamedCasFiles = folderFiles.filter(f => CasUtils.isCasFile(f.name));

            this.logTaskEvent('[CAS智能去重] 目标目录已有 ' + existingBaseNames.size + ' 个视频文件');

            return { success: true, existingBaseNames, existingVideoNames, renamedCasFiles };
        } catch (e) {
            this.logTaskEvent('[CAS智能去重] 刷新目录失败: ' + e.message);
            return { success: false };
        }
    }

    // 去后缀比对
    _compareCasWithExisting(casFiles, existingBaseNames, existingVideoNames) {
        const toDelete = [];
        const toUpload = [];
        const mediaExtensions = ['.mkv', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.ts', '.flv', '.mov', '.iso', '.mpg', '.rm'];

        const getBaseNameWithoutExt = (name) => {
            name = name.replace(/\.cas$/i, '');
            for (const ext of mediaExtensions) {
                if (name.toLowerCase().endsWith(ext)) return name.slice(0, -ext.length);
            }
            return name;
        };

        for (const casFile of casFiles) {
            const videoName = casFile.name.replace(/\.cas$/i, '');
            const baseName = getBaseNameWithoutExt(videoName);
            if (existingBaseNames.has(baseName) || existingVideoNames.has(videoName)) {
                toDelete.push(casFile);
            } else {
                toUpload.push(casFile);
            }
        }

        return { toDelete, toUpload };
    }

    // 删除已存在的 CAS
    async _deleteExistingCas(cloud189, task, casFiles) {
        let deletedCount = 0;
        this.logTaskEvent('[CAS智能去重] 删除 ' + casFiles.length + ' 个已存在的 CAS...');
        for (const casFile of casFiles) {
            try {
                await cloud189.deleteFile(casFile.id);
                await taskCacheManager.addCache(task.id, String(casFile.id));
                deletedCount++;
            } catch (e) {
                this.logTaskEvent('[CAS删除] ' + casFile.name + ' 失败: ' + e.message);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return { deletedCount };
    }

    // 秒传缺失文件
    async _uploadMissingFiles(task, cloud189, casFiles, enableCasFamilyTransfer, casFamilyFolderIdActual, familyCloud189, account) {
        const successFiles = [];
        const casResults = [];
        const failedShareFileIds = new Set();
        let casSuccessCount = 0;

        // 家庭账号初始化
        let familyCloud189Actual = familyCloud189 || cloud189;
        let casFamilyInfo = this.taskService._casFamilyInfo;
        let casFamilyFolderId = casFamilyFolderIdActual;

        if (enableCasFamilyTransfer && task.casFamilyAccountId && task.casFamilyAccountId !== task.accountId) {
            const familyAccount = await this.taskService.accountRepo.findOneBy({ id: task.casFamilyAccountId });
            if (familyAccount) {
                familyCloud189Actual = Cloud189Service.getInstance(familyAccount);
            }
        }

        if (enableCasFamilyTransfer && !casFamilyInfo) {
            casFamilyInfo = await familyCloud189Actual.getFamilyInfo();
        }

        if (enableCasFamilyTransfer && casFamilyInfo && !casFamilyFolderId) {
            const familyId = casFamilyInfo.familyId;
            if (!this.taskService._casFamilyRootFolderId) {
                this.taskService._casFamilyRootFolderId = await familyCloud189Actual.getFamilyRootFolderId(familyId);
            }
            const familyFolderIdResult = await this.taskService._getFamilyFolderId(account, familyCloud189Actual, familyId, this.taskService._casFamilyRootFolderId);
            casFamilyFolderId = familyFolderIdResult.folderId || this.taskService._casFamilyRootFolderId;
        }

        const familyFolderId = casFamilyFolderId || this.taskService._casFamilyRootFolderId;

        // 批次秒传
        const BATCH_SIZE = 3;
        let batchNum = 1;
        let remainingFiles = [...casFiles];

        while (remainingFiles.length > 0) {
            const batchFiles = remainingFiles.slice(0, BATCH_SIZE);
            this.logTaskEvent('[CAS秒传] 第' + batchNum + '批次，' + batchFiles.length + ' 个文件');

            for (const casFile of batchFiles) {
                try {
                    const content = await cloud189.downloadFileContent(casFile.id);
                    const parsed = CasUtils.parseCasContent(content);
                    if (!parsed || !parsed.md5 || !parsed.slice_md5) {
                        this.logTaskEvent('[CAS秒传] ' + casFile.name + ' 解析失败');
                        failedShareFileIds.add(String(casFile.id));
                        continue;
                    }

                    const videoName = casFile.name.replace(/\.cas$/i, '');

                    if (enableCasFamilyTransfer && casFamilyInfo) {
                        const familyResult = await familyCloud189Actual.familyRapidUpload(
                            videoName, parseInt(parsed.size),
                            parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(),
                            casFamilyInfo.familyId, familyFolderId
                        );
                        if (familyResult.success && familyResult.familyFileId) {
                            const saveResult = await cloud189.saveFamilyFileToPersonal(
                                casFamilyInfo.familyId, familyResult.familyFileId, task.realFolderId, familyFolderId, videoName
                            );
                            if (saveResult.success) {
                                this.logTaskEvent('[家庭中转] 完成 ' + videoName);
                                successFiles.push(videoName);
                                casResults.push({ fileName: videoName, success: true });
                                try { await familyCloud189Actual.deleteFamilyFile(casFamilyInfo.familyId, familyResult.familyFileId); } catch (e) {}
                                try { await cloud189.deleteFile(casFile.id); await taskCacheManager.addCache(task.id, String(casFile.id)); } catch (e) {}
                                casSuccessCount++;
                            } else {
                                this.logTaskEvent('[家庭中转] ' + videoName + ' 转存失败');
                                failedShareFileIds.add(String(casFile.id));
                            }
                        } else {
                            this.logTaskEvent('[家庭中转] ' + videoName + ' 秒传失败');
                            failedShareFileIds.add(String(casFile.id));
                        }
                    } else {
                        const uploadResult = await cloud189.rapidUpload(
                            videoName, parseInt(parsed.size),
                            parsed.md5.toUpperCase(), parsed.slice_md5.toUpperCase(),
                            task.realFolderId
                        );
                        if (uploadResult.success) {
                            this.logTaskEvent('[CAS秒传] 完成 ' + videoName);
                            successFiles.push(videoName);
                            casResults.push({ fileName: videoName, success: true });
                            try { await cloud189.deleteFile(casFile.id); await taskCacheManager.addCache(task.id, String(casFile.id)); } catch (e) {}
                            casSuccessCount++;
                        } else {
                            this.logTaskEvent('[CAS秒传] ' + videoName + ' 失败');
                            failedShareFileIds.add(String(casFile.id));
                        }
                    }
                } catch (error) {
                    this.logTaskEvent('[CAS秒传] ' + casFile.name + ' 异常: ' + error.message);
                    failedShareFileIds.add(String(casFile.id));
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 批次结束清理
            if (enableCasFamilyTransfer && familyCloud189Actual) {
                familyCloud189Actual._sessionKey = null;
                familyCloud189Actual._rsaKey = null;
            }
            remainingFiles = remainingFiles.slice(BATCH_SIZE);
            batchNum++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return { successFiles, casResults, failedShareFileIds, casSuccessCount };
    }

    // 清理所有 CAS 文件
    async _cleanupAllCas(cloud189, task) {
        try {
            const folderFiles = await this.taskService.getAllFolderFiles(cloud189, task);
            const allCasFiles = folderFiles.filter(f => CasUtils.isCasFile(f.name));
            if (allCasFiles.length > 0) {
                this.logTaskEvent('[CAS清理] 删除 ' + allCasFiles.length + ' 个 CAS 文件...');
                for (const casFile of allCasFiles) {
                    try {
                        await cloud189.deleteFile(casFile.id);
                    } catch (e) {}
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (e) {
            this.logTaskEvent('[CAS清理] 失败: ' + e.message);
        }
    }
}

module.exports = CasSmartDedupService;