const { CloudClient, FileTokenStore } = require('../../vender/cloud189-sdk/dist');
const { logTaskEvent } = require('../utils/logUtils');
const crypto = require('crypto');
const got = require('got');
const ProxyUtil = require('../utils/ProxyUtil');
const UploadCryptoUtils = require('../utils/UploadCryptoUtils');
const CasUtils = require('../utils/CasUtils');
class Cloud189Service {
    static instances = new Map();

    static getInstance(account) {
        const key = account.username;
        if (!this.instances.has(key)) {
            this.instances.set(key, new Cloud189Service(account));
        }
        return this.instances.get(key);
    }

    constructor(account) {
        const _options = {
            username: account.username,
            password: account.password,
            token: new FileTokenStore(`data/${account.username}.json`)
        }
        if (!account.password && account.cookies) {
            _options.ssonCookie = account.cookies
            _options.password = null   
        }
        _options.proxy = ProxyUtil.getProxy('cloud189')
        this.client = new CloudClient(_options);
    }

    // 重新给所有实例设置代理
    static setProxy() {
        const proxyUrl = ProxyUtil.getProxy('cloud189')
        this.instances.forEach(instance => {
            instance.client.setProxy(proxyUrl);
        });
    }

    // 封装统一请求
    async request(action, body) {
        body.headers = {'Accept': 'application/json;charset=UTF-8'}
        try {
            const noCache = Math.random().toString()
            const targetUrl = action.startsWith('http') ? action : 'https://cloud.189.cn' + action;
            const separator = targetUrl.includes('?') ? '&' : '?';
            return await this.client.request(targetUrl + separator + 'noCach=' + noCache, body).json();
        }catch (error) {
            if (error instanceof got.HTTPError) {
                const responseBody = JSON.parse(error.response.body);
                if (responseBody.res_code === "ShareAuditWaiting") {
                    return responseBody;
                }
                if (responseBody.res_code === "FileAlreadyExists") {
                    return {
                        res_code: "FileAlreadyExists",
                        res_msg: "文件已存在"
                    }
                }
                // 如果是FileNotFound
                if (responseBody.res_code === "FileNotFound") {
                    return {
                        res_code: "FileNotFound",
                        res_msg: "文件不存在"
                    }
                }
                logTaskEvent('请求天翼云盘接口失败:' + error.response.body);
            }else if (error instanceof got.TimeoutError) {
                logTaskEvent('请求天翼云盘接口失败: 请求超时, 请检查是否能访问天翼云盘');
            }else if(error instanceof got.RequestError) {
                logTaskEvent('请求天翼云盘接口异常: ' + error.message);
            }else{
                logTaskEvent('其他异常:' + error.message)
            }
            console.log(error)
            return null
        }
    }
    
    async getUserSizeInfo() {
        try {
            return await this.client.getUserSizeInfo()    
        }catch(error) {
            if (error instanceof got.HTTPError) {
                const responseBody = error.response.body;
                logTaskEvent('请求天翼云盘接口失败:'+ responseBody);
            }else if (error instanceof got.TimeoutError) {
                logTaskEvent('请求天翼云盘接口失败: 请求超时, 请检查是否能访问天翼云盘');
            }else if(error instanceof got.RequestError) {
                logTaskEvent('请求天翼云盘接口异常: ' + error.message);
            } else {
                // 捕获其他类型的错误
                logTaskEvent('获取用户空间信息失败:' +  error.message);
            }
            console.log(error)
            return null
        }
    
    }
    // 解析分享链接获取文件信息
    async getShareInfo(shareCode) {
        return await this.request('/api/open/share/getShareInfoByCodeV2.action' , {
            method: 'GET',
            searchParams: { shareCode }
        })
    }

    // 获取分享目录下的文件列表
    async listShareDir(shareId, fileId, shareMode, accessCode, isFolder = true) {
        return await this.request('/api/open/share/listShareDir.action', {
            method: 'GET',
            searchParams: {
                shareId,
                isFolder: isFolder,
                fileId: fileId,
                orderBy: 'lastOpTime',
                descending: true,
                shareMode: shareMode,
                pageNum: 1,
                pageSize: 1000,
                accessCode
            }
        })
    }

    // 递归获取所有文件列表
    async getShareFiles(shareId, fileId, shareMode, accessCode, isFolder = true) {
        const result = await this.listShareDir(shareId, fileId, shareMode, accessCode, isFolder);
        if (!result || !result.fileListAO.fileList) {
            return [];
        }
        return result.fileListAO.fileList;
    }

    // 搜索个人网盘文件
    async searchFiles(filename) {
        return await this.request('/api/open/share/getShareInfoByCodeV2.action' , {
            method: 'GET',
            searchParams: { 
                folderId: '-11',
                pageSize: '1000',
                pageNum: '1',
                recursive: 1,
                mediaType: 0,
                filename
             }
        })
    }

    // 获取个人网盘文件列表
    async listFiles(folderId) {
        return await this.request('/api/open/file/listFiles.action' , {
            method: 'GET',
            searchParams: { 
                folderId,
                mediaType: 0,
                orderBy: 'lastOpTime',
                descending: true,
                pageNum: 1,
                pageSize: 1000
             }
        })
    }

    // 创建批量执行任务
    async createBatchTask(batchTaskDto) {
        logTaskEvent("创建批量任务")
        logTaskEvent(`batchTaskDto: ${batchTaskDto.toString()}`)
        return await this.request('/api/open/batch/createBatchTask.action', {
            method: 'POST',
            form: batchTaskDto
        })
    }
    // 查询转存任务状态
    async checkTaskStatus(taskId, type = "SHARE_SAVE") {
        const params = {taskId, type}
        return await this.request('/api/open/batch/checkBatchTask.action', {
            method: 'POST',
            form: params,
        })
    }

    // 获取目录树节点
    async getFolderNodes(folderId = '-11') {
        return await this.request('/api/portal/getObjectFolderNodes.action' , {
            method: 'POST',
            form: {
                id: folderId,
                orderBy: 1,
                order: 'ASC'
            },
        })
    }

    // 新建目录
    async createFolder(folderName, parentFolderId) {
        return await this.request('/api/open/file/createFolder.action' , {
            method: 'POST',
            form: {
                parentFolderId: parentFolderId,
                folderName: folderName
            },
        })
    }

     // 验证分享链接访问码
     async checkAccessCode(shareCode, accessCode) {
        return await this.request('/api/open/share/checkAccessCode.action' , {
            method: 'GET',
            searchParams: {
                shareCode,
                accessCode,
                uuid: crypto.randomUUID()
            },
        })
    }
    // 获取冲突的文件 
    async getConflictTaskInfo(taskId) {
        return await this.request('/api/open/batch/getConflictTaskInfo.action' , {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE'
            },
        })
    }

    // 处理冲突 taskInfos: [{"fileId":"","fileName":"","isConflict":1,"isFolder":0,"dealWay":1}]
    async manageBatchTask(taskId,targetFolderId, taskInfos) {
        return await this.request('/api/open/batch/manageBatchTask.action' , {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE',
                targetFolderId,
                taskInfos
            },
        })
    }

    // 重命名文件
    async renameFile(fileId, destFileName) { 
        const response = await this.request('/api/open/file/renameFile.action', {
            method: 'POST',
            form: {
                fileId,
                destFileName
            },
        })
        return response
    }
    // 获取家庭信息
    async getFamilyInfo() {
        const familyList = await this.client.getFamilyList()
        if (!familyList || !familyList.familyInfoResp) {
            return null
        }
        const resp = familyList.familyInfoResp
        for (const family of resp) {
            if (family.userRole == 1) {
                return family
            }
        }
        return null
    }

    // 获取家庭空间根目录ID
    async getFamilyRootFolderId(familyId) {
        try {
            const result = await this.request('/api/open/family/file/listFiles.action', {
                method: 'GET',
                searchParams: { familyId, folderId: '', needPath: true, pageNum: 1, pageSize: 1 }
            });
            const pathItems = Array.isArray(result?.path) ? result.path : [];
            // 找到家庭云根目录节点（非个人根目录 -11）
            const familyRoot = [...pathItems].reverse().find(item =>
                item && item.fileId && item.fileId !== '-11' && item.fileId !== '-16'
            );
            if (familyRoot?.fileId) {
                logTaskEvent(`[家庭中转] 家庭根目录ID: ${familyRoot.fileId}`);
                return String(familyRoot.fileId);
            }
            // 降级方案：直接从文件列表中取路径
            if (result?.fileListAO?.path?.length > 0) {
                return String(result.fileListAO.path[0].fileId);
            }
            logTaskEvent('[家庭中转] 无法获取家庭根目录ID，将传入空字符串');
            return '';
        } catch (error) {
            logTaskEvent(`[家庭中转] 获取家庭根目录ID失败: ${error.message}`);
            return '';
        }
    }

    // 获取家庭目录子节点（用于前端目录选择）
    async listFamilyFolderNodes(familyId, folderId = '') {
        try {
            const result = await this.request('/api/open/family/file/listFiles.action', {
                method: 'GET',
                searchParams: {
                    familyId,
                    folderId: folderId || '',
                    pageNum: 1,
                    pageSize: 200,
                    mediaType: 0,
                    orderBy: 3,
                    descending: true
                }
            });
            if (!result || !result.fileListAO) return [];
            return (result.fileListAO.folderList || []).map(f => ({
                id: String(f.id),
                name: f.name,
                isFolder: true
            }));
        } catch (error) {
            logTaskEvent(`[家庭中转] 获取家庭目录列表失败: ${error.message}`);
            return [];
        }
    }

    // 家庭接口秒传（三步：init + check + commit）
    // 关键改动：改用个人RSA签名方式处理家庭接口（参考油猴脚本）
    // 每次请求生成新的随机密钥，不会有密钥使用次数限制问题
    // 2026-04-23: 增加延迟以应对家庭API频率限制（约每分钟4-5次）
    async familyRapidUpload(fileName, fileSize, fileMd5, sliceMd5, familyId, familyFolderId) {
        const maxRetries = 2;  // 最大重试次数
        const stepDelay = 2000;  // 步骤间延迟 2秒（应对频率限制）
        const retryDelay = 2000;  // 403重试延迟 2秒

        try {
            const sliceSize = this._partSize(fileSize);
            logTaskEvent(`[家庭中转] 开始秒传至家庭空间: ${fileName}, 目录ID: ${familyFolderId || '根目录'}`);

            // 使用个人RSA签名方式处理家庭接口（每次生成新随机密钥，无使用次数限制）
            const rsaKey = await this._getRsaKey();
            const sessionKey = await this._getSessionKey();
            logTaskEvent(`[家庭中转] 使用个人RSA签名方式（每次新密钥）`);

            // 第1步: 初始化（家庭接口）- 含多次重试
            const initParams = {
                parentFolderId: String(familyFolderId || ''),
                familyId: String(familyId),
                fileName: encodeURIComponent(fileName),
                fileSize: String(fileSize),
                sliceSize: String(sliceSize),
                lazyCheck: '1'
            };
            const initUri = '/family/initMultiUpload';

            const got = require('got');
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const opts = { headers: {} };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                opts.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }

            let initResult;
            let lastError = null;
            for (let retry = 0; retry < maxRetries; retry++) {
                // 每次重试刷新 RSA 密钥
                if (retry > 0) {
                    this._rsaKey = null;
                    logTaskEvent(`[家庭中转] initMultiUpload 重试 ${retry}/${maxRetries}，刷新密钥并等待 ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                const currentRsaKey = await this._getRsaKey();
                const initReq = UploadCryptoUtils.buildUploadRequest(initParams, initUri, currentRsaKey, sessionKey);
                opts.headers = initReq.headers;

                try {
                    initResult = await got(initReq.url, opts).json();
                    if (initResult.errorCode || (initResult.code && initResult.code !== 'SUCCESS')) {
                        lastError = new Error(initResult.errorMsg || initResult.msg || initResult.errorCode || '初始化失败');
                    } else {
                        lastError = null;
                        break;  // 成功，跳出重试循环
                    }
                } catch (e) {
                    if (e?.response?.statusCode === 403) {
                        lastError = new Error(`Response code 403 (Forbidden)`);
                        // 403 继续重试
                    } else {
                        throw new Error(`家庭initMultiUpload失败: ${e.message}`);
                    }
                }
            }
            if (lastError) throw lastError;

            const uploadFileId = initResult.data?.uploadFileId;
            if (!uploadFileId) throw new Error('家庭初始化上传失败: 缺少uploadFileId');

            await new Promise(resolve => setTimeout(resolve, stepDelay));  // 步骤间延迟 2秒

            // 第2步: 检查秒传（家庭接口）- 每步重新获取密钥（参考油猴脚本）
            const checkUri = '/family/checkTransSecond';
            const checkParams = { fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), uploadFileId: String(uploadFileId) };
            const checkRsaKey = await this._getRsaKey();  // 重新获取RSA密钥
            const checkSessionKey = await this._getSessionKey();
            const checkReq = UploadCryptoUtils.buildUploadRequest(checkParams, checkUri, checkRsaKey, checkSessionKey);
            opts.headers = checkReq.headers;

            let checkResult;
            try {
                checkResult = await got(checkReq.url, opts).json();
            } catch (e) {
                throw new Error(`家庭checkTransSecond失败: ${e.message}`);
            }

            if (checkResult.errorCode) throw new Error(checkResult.errorMsg || checkResult.errorCode);
            if (checkResult.code && checkResult.code !== 'SUCCESS') throw new Error(checkResult.msg || '秒传检查失败');
            const fileDataExists = checkResult.data?.fileDataExists;
            if (fileDataExists != 1) throw new Error('文件不存在于云端，无法秒传（家庭接口）');

            await new Promise(resolve => setTimeout(resolve, stepDelay));  // 步骤间延迟 2秒

            // 第3步: 提交（家庭接口）- 每步重新获取密钥（参考油猴脚本）
            const commitUri = '/family/commitMultiUploadFile';
            const commitParams = { uploadFileId: String(uploadFileId), fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), lazyCheck: '1', opertype: '3' };
            const commitRsaKey = await this._getRsaKey();  // 重新获取RSA密钥
            const commitSessionKey = await this._getSessionKey();
            const commitReq = UploadCryptoUtils.buildUploadRequest(commitParams, commitUri, commitRsaKey, commitSessionKey);
            opts.headers = commitReq.headers;

            let commitResult;
            try {
                commitResult = await got(commitReq.url, opts).json();
            } catch (e) {
                throw new Error(`家庭commitMultiUpload失败: ${e.message}`);
            }

            if (commitResult.errorCode) throw new Error(commitResult.errorMsg || commitResult.errorCode);
            if (commitResult.code && commitResult.code !== 'SUCCESS') throw new Error(commitResult.msg || '提交失败');

            const familyFileId = commitResult.file?.userFileId || commitResult.file?.id || commitResult.data?.fileId || null;
            logTaskEvent(`[家庭中转] 家庭空间秒传成功: ${fileName}, 文件ID: ${familyFileId}`);
            return { success: true, familyFileId, message: '家庭秒传成功' };
        } catch (error) {
            logTaskEvent(`[家庭中转] 家庭空间秒传失败: ${fileName} - ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 家庭签名辅助方法
    _buildFamilySignature(urlStr, accessToken, extraParams = null) {
        if (!urlStr || !accessToken) return null;
        try {
            const parsedUrl = new URL(urlStr, 'https://cloud.189.cn');
            const signEntries = Array.from(parsedUrl.searchParams.entries());
            if (extraParams && typeof extraParams === 'object') {
                for (const [key, value] of Object.entries(extraParams)) {
                    signEntries.push([key, value == null ? '' : String(value)]);
                }
            }
            signEntries.sort((a, b) => a[0].localeCompare(b[0]));
            const timestamp = String(Date.now());
            const signItems = [`AccessToken=${accessToken}`, `Timestamp=${timestamp}`];
            for (const [key, value] of signEntries) signItems.push(`${key}=${value}`);
            const signature = crypto.createHash('md5').update(signItems.join('&')).digest('hex').toLowerCase();
            return { timestamp, signature, signText: signItems.join('&') };
        } catch (e) {
            return null;
        }
    }

    // 将家庭文件转存到个人空间指定目录
    // 参考 upload189-cas-web-14.js 油猴脚本实现：手动构建签名
    // 关键：签名需要包含 POST form 参数（SDK默认只签URL query参数）
    async saveFamilyFileToPersonal(familyId, familyFileId, personalFolderId, familyFolderId, fileName = '') {
        try {
            logTaskEvent(`[家庭中转] 将家庭文件(${familyFileId})转存到个人目录(${personalFolderId})`);

            const taskInfos = JSON.stringify([
                { fileId: String(familyFileId), fileName: fileName || '', isFolder: 0 }
            ]);

            const formParams = {
                type: 'COPY',
                taskInfos: taskInfos,
                targetFolderId: String(personalFolderId),
                familyId: String(familyId),
                groupId: 'null',
                copyType: '2',
                shareId: 'null'
            };

            logTaskEvent(`[家庭中转] 批量COPY任务参数: ${JSON.stringify(formParams)}`);

            // 获取 accessToken
            const accessToken = await this.client.getAccessToken();
            if (!accessToken) {
                throw new Error('无法获取 AccessToken');
            }

            // 手动构建签名（油猴脚本方式：包含 POST 参数）
            const requestUrl = 'https://api.cloud.189.cn/open/batch/createBatchTask.action';
            const timestamp = String(Date.now());

            // 签名参数：AccessToken + Timestamp + formParams（按key排序）
            const signEntries = Object.entries(formParams).sort((a, b) => a[0].localeCompare(b[0]));
            const signItems = [`AccessToken=${accessToken}`, `Timestamp=${timestamp}`];
            for (const [key, value] of signEntries) signItems.push(`${key}=${value}`);
            const signature = crypto.createHash('md5').update(signItems.join('&')).digest('hex').toLowerCase();

            logTaskEvent(`[家庭中转] 签名原文: ${signItems.join('&')}`);
            logTaskEvent(`[家庭中转] 签名结果: ${signature}`);

            // 构建请求头（参考油猴脚本 buildFamilyHeaders）
            const headers = {
                'Accept': 'application/json;charset=UTF-8',
                'Sign-Type': '1',
                'Signature': signature,
                'Timestamp': timestamp,
                'AccessToken': accessToken,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            // 构建 POST body
            const postBody = Object.entries(formParams)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');

            logTaskEvent(`[家庭中转] POST body: ${postBody}`);

            // 发送请求
            const response = await got(requestUrl, {
                method: 'POST',
                headers,
                body: postBody,
                responseType: 'json',
                throwHttpErrors: false
            });

            const result = response.body;
            logTaskEvent(`[家庭中转] HTTP状态: ${response.statusCode}`);
            logTaskEvent(`[家庭中转] 批量COPY任务响应: ${JSON.stringify(result)}`);

            if (response.statusCode >= 400 || !result) {
                throw new Error(result?.res_message || result?.errorMsg || `HTTP ${response.statusCode}`);
            }
            if (result.res_code !== undefined && result.res_code !== 0) {
                throw new Error(result.res_message || '批量任务创建失败');
            }

            const taskId = result.taskId;
            if (!taskId) {
                throw new Error('批量任务创建失败：缺少 taskId');
            }

            logTaskEvent(`[家庭中转] 批量任务已创建，taskId: ${taskId}，等待完成...`);

            // 等待任务完成
            await this._waitForBatchTask('COPY', taskId, familyFileId, fileName, personalFolderId);

            return { success: true };
        } catch (error) {
            logTaskEvent(`[家庭中转] 转存到个人空间失败: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 等待批量任务完成
    async _waitForBatchTask(type, taskId, familyFileId, fileName, personalFolderId) {
        const maxWaitTime = 30000;
        const startTime = Date.now();
        let taskStatus = 0;

        while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 检查任务状态（同样手动构建签名）
            const accessToken = await this.client.getAccessToken();
            const checkUrl = 'https://api.cloud.189.cn/open/batch/checkBatchTask.action';
            const timestamp = String(Date.now());
            const checkParams = { type, taskId: String(taskId) };

            // 签名：AccessToken 和 Timestamp 固定前缀，其他参数按 key 排序
            const sortedParams = Object.entries(checkParams).sort((a, b) => a[0].localeCompare(b[0]));
            const signText = [`AccessToken=${accessToken}`, `Timestamp=${timestamp}`]
                .concat(sortedParams.map(([k, v]) => `${k}=${v}`))
                .join('&');
            const signature = crypto.createHash('md5').update(signText).digest('hex').toLowerCase();

            logTaskEvent(`[家庭中转] checkBatchTask签名原文: ${signText}`);

            const headers = {
                'Accept': 'application/json;charset=UTF-8',
                'Sign-Type': '1',
                'Signature': signature,
                'Timestamp': timestamp,
                'AccessToken': accessToken,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const postBody = Object.entries(checkParams)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');

            const response = await got(checkUrl, {
                method: 'POST',
                headers,
                body: postBody,
                responseType: 'json',
                throwHttpErrors: false
            });

            const statusResult = response.body;
            taskStatus = statusResult?.taskStatus || 0;
            logTaskEvent(`[家庭中转] 任务状态: ${taskStatus}, 响应: ${JSON.stringify(statusResult)}`);

            if (taskStatus === 4) {
                logTaskEvent(`[家庭中转] ✅ 批量COPY任务完成`);
                return;
            }

            if (taskStatus === 2) {
                logTaskEvent(`[家庭中转] 检测到文件冲突，尝试覆盖...`);
                // TODO: 处理冲突
            }
        }

        throw new Error(`批量任务超时，当前状态: ${taskStatus}`);
    }

    // 删除家庭空间中的临时文件（清理中转残留）
    async deleteFamilyFile(familyId, fileId, fileName = '') {
        try {
            logTaskEvent(`[家庭中转] 删除家庭临时文件: ${fileName || fileId}`);
            const result = await this.request('/api/open/batch/createBatchTask.action', {
                method: 'POST',
                form: {
                    type: 'DELETE',
                    taskInfos: JSON.stringify([{ fileId: String(fileId), fileName: fileName || '', isFolder: 0 }]),
                    targetFolderId: '',
                    familyId: String(familyId)
                }
            });
            if (result?.res_code !== undefined && result.res_code !== 0) {
                logTaskEvent(`[家庭中转] 删除家庭文件失败: ${result.res_message}`);
            }
            return result;
        } catch (error) {
            logTaskEvent(`[家庭中转] 删除家庭临时文件异常(${fileId}): ${error.message}`);
        }
    }

    // 创建家庭空间目录
    async createFamilyFolder(familyId, folderName, parentFolderId = '') {
        try {
            logTaskEvent(`[家庭中转] 创建家庭目录: ${folderName}, 父目录ID: ${parentFolderId || '根目录'}`);
            const result = await this.request('/api/open/family/file/createFolder.action', {
                method: 'POST',
                form: {
                    familyId: String(familyId),
                    parentFolderId: String(parentFolderId || ''),
                    folderName: folderName
                }
            });
            if (result?.res_code !== undefined && result.res_code !== 0) {
                throw new Error(result.res_message || '创建目录失败');
            }
            const folderId = result?.id || result?.folderId || result?.data?.folderId;
            logTaskEvent(`[家庭中转] 家庭目录创建成功: ${folderName}, ID: ${folderId}`);
            return { success: true, folderId: String(folderId) };
        } catch (error) {
            logTaskEvent(`[家庭中转] 创建家庭目录失败: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 清空家庭空间指定目录下的所有文件（用于清理中转目录）
    async clearFamilyFolder(familyId, folderId) {
        try {
            logTaskEvent(`[家庭中转] 开始清空家庭中转目录(ID: ${folderId})...`);
            // 获取目录下所有文件
            const result = await this.request('/api/open/family/file/listFiles.action', {
                method: 'GET',
                searchParams: {
                    familyId,
                    folderId: String(folderId),
                    pageNum: 1,
                    pageSize: 500,
                    mediaType: 0,
                    orderBy: 3,
                    descending: true
                }
            });

            if (!result || !result.fileListAO) {
                logTaskEvent(`[家庭中转] 中转目录为空，无需清理`);
                return { success: true, deletedCount: 0 };
            }

            const fileList = result.fileListAO.fileList || [];
            const folderList = result.fileListAO.folderList || [];
            const allItems = [...fileList, ...folderList];

            if (allItems.length === 0) {
                logTaskEvent(`[家庭中转] 中转目录为空，无需清理`);
                return { success: true, deletedCount: 0 };
            }

            // 构建删除任务
            const taskInfos = allItems.map(item => ({
                fileId: String(item.id),
                fileName: item.name,
                isFolder: item.isFolder ? 1 : 0
            }));

            logTaskEvent(`[家庭中转] 清空目录: 共 ${allItems.length} 个文件/文件夹`);

            // 创建批量删除任务
            const deleteResult = await this.request('/api/open/batch/createBatchTask.action', {
                method: 'POST',
                form: {
                    type: 'DELETE',
                    taskInfos: JSON.stringify(taskInfos),
                    targetFolderId: '',
                    familyId: String(familyId)
                }
            });

            if (deleteResult?.res_code !== undefined && deleteResult.res_code !== 0) {
                throw new Error(deleteResult.res_message || '批量删除失败');
            }

            logTaskEvent(`[家庭中转] ✅ 已清空家庭中转目录，删除 ${allItems.length} 个文件`);
            return { success: true, deletedCount: allItems.length };
        } catch (error) {
            logTaskEvent(`[家庭中转] 清空家庭中转目录失败: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 删除家庭空间目录（用于删除自动创建的临时目录）
    async deleteFamilyFolder(familyId, folderId, folderName = '') {
        try {
            logTaskEvent(`[家庭中转] 删除家庭目录: ${folderName || folderId}`);
            const result = await this.request('/api/open/batch/createBatchTask.action', {
                method: 'POST',
                form: {
                    type: 'DELETE',
                    taskInfos: JSON.stringify([{ fileId: String(folderId), fileName: folderName || '', isFolder: 1 }]),
                    targetFolderId: '',
                    familyId: String(familyId)
                }
            });
            if (result?.res_code !== undefined && result.res_code !== 0) {
                throw new Error(result.res_message || '删除目录失败');
            }
            logTaskEvent(`[家庭中转] ✅ 已删除家庭目录: ${folderName || folderId}`);
            return { success: true };
        } catch (error) {
            logTaskEvent(`[家庭中转] 删除家庭目录失败: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 获取网盘直链
    async getDownloadLink(fileId, shareId = null) {
        const type = shareId? 4: 2
        const response = await this.request('/api/portal/getNewVlcVideoPlayUrl.action', {
            method: 'GET',
            searchParams: {
                fileId,
                shareId,
                type,
                dt: 1
            },
        })
        if (!response || response.res_code != 0) {
            throw new Error(response.res_msg)
        }
        const code = response.normal.code
        if (code != 1) {
            throw new Error(response.normal.message)
        }
        const url = response.normal.url
        const res = await got(url, {
            followRedirect: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
            }
        })
        return res.headers.location
    }
    // 记录转存量
    async increaseShareFileAccessCount(shareId) {
        const response = await this.request('https://cloud.189.cn/api/portal//share/increaseShareFileAccessCount.action', {
            method: 'GET',
            searchParams: {
                shareId,
                view: false,
                download: false,
                dump: true
            },
        })
        return response
    }
    async login(username, password, validateCode) {
        try {
            const loginToken = await this.client.authClient.loginByPassword(username, password, validateCode)
            await this.client.tokenStore.update({
                accessToken: loginToken.accessToken,
                refreshToken: loginToken.refreshToken,
                expiresIn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).getTime()
            })
            return {
                success: true
            }
        } catch (error) {
            // 处理需要验证码的情况
            if (error.code === 'NEED_CAPTCHA') {
                return {
                    success: false,
                    code: 'NEED_CAPTCHA',
                    data: error.data.image // 包含验证码图片和相关token信息
                }
            }
            console.log(error)
            // 处理其他错误
            return {
                success: false,
                code: 'LOGIN_ERROR',
                message: error.message || '登录失败'
            }
        }
    }

    // ============== CAS 秒传相关方法 ==============

    // 获取 SessionKey（用于上传签名）
    // 参照 OpenList-CAS: 调用 /v2/getUserBriefInfo.action 从 JSON 响应体获取 sessionKey
    async _getSessionKey() {
        // 优先使用缓存的 sessionKey
        if (this._sessionKey) return this._sessionKey;

        // 方案1: 通过 SDK 的 request 方法调用 API（会自动携带认证信息）
        try {
            const result = await this.request('/v2/getUserBriefInfo.action', {
                method: 'GET',
                searchParams: {}
            });
            if (result && result.sessionKey) {
                this._sessionKey = result.sessionKey;
                return this._sessionKey;
            }
        } catch (e) {
            logTaskEvent('通过 /v2/getUserBriefInfo.action 获取SessionKey失败: ' + e.message);
        }

        // 方案2: 尝试从 getUserSizeInfo 响应头获取（油猴脚本的方式）
        try {
            const noCache = Math.random().toString();
            const resp = await this.client.request(
                `https://cloud.189.cn/api/portal/getUserSizeInfo.action?noCache=${noCache}`,
                { method: 'GET', headers: { 'Accept': 'application/json;charset=UTF-8' } }
            );
            const sk = resp?.headers?.['sessionkey'] || resp?.headers?.['SessionKey'] || '';
            if (sk) {
                this._sessionKey = sk;
                return sk;
            }
        } catch (e) {
            logTaskEvent('通过响应头获取SessionKey失败: ' + e.message);
        }

        // 方案3: 回退 - 直接用 got 请求
        try {
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const headers = await this._buildAuthHeaders();
            const options = { headers, followRedirect: true };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                options.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }
            // 先尝试 getUserBriefInfo
            const resp1 = await got('https://cloud.189.cn/v2/getUserBriefInfo.action', options);
            const body1 = JSON.parse(resp1.body);
            if (body1?.sessionKey) {
                this._sessionKey = body1.sessionKey;
                return this._sessionKey;
            }
            // 再尝试从响应头获取
            const sk = resp1.headers['sessionkey'] || resp1.headers['SessionKey'] || '';
            if (sk) {
                this._sessionKey = sk;
                return sk;
            }
        } catch (e) {
            logTaskEvent('回退获取SessionKey失败: ' + e.message);
        }

        // 方案4: 最终回退 - 尝试从 tokenStore 读取
        try {
            const token = this.client.tokenStore?.load?.();
            if (token?.sessionKey) return token.sessionKey;
            if (token?.accessToken) return token.accessToken;
        } catch (e) {}
        return '';
    }

    // 构建认证请求头（备用，不依赖SDK）
    async _buildAuthHeaders() {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json;charset=UTF-8'
        };
        try {
            const token = this.client.tokenStore?.load?.();
            if (token?.accessToken) {
                headers['Cookie'] = `SESSION_KEY=${token.accessToken}`;
            }
        } catch (e) {}
        return headers;
    }

    /**
     * 获取家庭会话密钥（familySessionKey + familySessionSecret）
     * 这是家庭接口秒传的关键！SDK 的 getSession() 会返回这些密钥。
     * 参考OpenList-CAS: 家庭接口使用不同的密钥体系，而非个人RSA
     */
    async _getFamilySessionKeys() {
        // 优先使用缓存
        if (this._familySessionKey && this._familySessionSecret) {
            return {
                familySessionKey: this._familySessionKey,
                familySessionSecret: this._familySessionSecret
            };
        }

        try {
            // SDK的getSession()返回 TokenSession，包含 familySessionKey 和 familySessionSecret
            const session = await this.client.getSession();
            if (session && session.familySessionKey && session.familySessionSecret) {
                this._familySessionKey = session.familySessionKey;
                this._familySessionSecret = session.familySessionSecret;
                logTaskEvent(`[家庭中转] 获取家庭会话密钥成功`);
                return {
                    familySessionKey: this._familySessionKey,
                    familySessionSecret: this._familySessionSecret
                };
            }
        } catch (e) {
            logTaskEvent('获取家庭会话密钥失败: ' + e.message);
        }

        // 回退方案：尝试从 tokenStore 读取
        try {
            const token = this.client.tokenStore?.load?.();
            if (token?.familySessionKey && token?.familySessionSecret) {
                this._familySessionKey = token.familySessionKey;
                this._familySessionSecret = token.familySessionSecret;
                return {
                    familySessionKey: this._familySessionKey,
                    familySessionSecret: this._familySessionSecret
                };
            }
        } catch (e) {}

        throw new Error('无法获取家庭会话密钥（familySessionKey/familySessionSecret），请检查账号是否有家庭空间');
    }

    /**
     * 强制刷新家庭会话密钥（每N个请求后调用，避免403限流）
     * 天翼云盘家庭接口有请求次数限制，每4个请求后密钥可能失效
     */
    async refreshFamilySessionKeys() {
        // 清空缓存，强制重新获取
        this._familySessionKey = null;
        this._familySessionSecret = null;

        // 强制刷新 SDK session（可能需要重新登录获取新密钥）
        try {
            this.client.session.accessToken = '';
            this.client.session.sessionKey = '';
            this.client.forceRefresh = true;
        } catch (e) {
            logTaskEvent(`[家庭中转] 刷新SDK session: ${e.message}`);
        }

        logTaskEvent(`[家庭中转] 强制刷新家庭会话密钥`);
        return await this._getFamilySessionKeys();
    }

    // 获取 RSA 公钥（缓存5分钟）
    async _getRsaKey() {
        const now = Date.now();
        if (this._rsaKey && this._rsaKey.expire > now) {
            return this._rsaKey;
        }
        try {
            const sessionKey = await this._getSessionKey();
            this._rsaKey = await UploadCryptoUtils.generateRsaKey(sessionKey);
            return this._rsaKey;
        } catch (error) {
            logTaskEvent('获取RSA公钥失败: ' + error.message);
            throw error;
        }
    }

    // 初始化多文件上传（秒传第一步）
    async initMultiUpload(parentFolderId, fileName, fileSize, sliceSize, fileMd5, sliceMd5) {
        const rsaKey = await this._getRsaKey();
        const sessionKey = await this._getSessionKey();
        const params = {
            parentFolderId: String(parentFolderId),
            fileName: encodeURIComponent(fileName),
            fileSize: String(fileSize),
            sliceSize: String(sliceSize),
            lazyCheck: '1'
        };
        // 故意不传 fileMd5 和 sliceMd5，强制使用 lazyCheck=1
        // 从而规避天翼云盘在 init 阶段如果上报命中黑名单的 md5，会导致后续 commitMultiUpload 稳定返回 InfoSecurityErrorCode 403 错误。
        // （这正是油猴脚本能成功秒传违规文件的原因）
        const uri = '/person/initMultiUpload';
        const { url, headers } = UploadCryptoUtils.buildUploadRequest(params, uri, rsaKey, sessionKey);

        try {
            const got = require('got');
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const options = { headers };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                options.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }
            return await got(url, options).json();
        } catch (error) {
            const respBody = error?.response?.body || '';
            logTaskEvent('initMultiUpload 失败: ' + error.message + (respBody ? ` | 响应: ${respBody.substring(0, 500)}` : ''));
            throw error;
        }
    }

    // 检查秒传（秒传第二步 - 核心步骤）
    async checkTransSecond(fileMd5, sliceMd5, uploadFileId) {
        const rsaKey = await this._getRsaKey();
        const sessionKey = await this._getSessionKey();
        const params = { fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), uploadFileId: String(uploadFileId) };
        const uri = '/person/checkTransSecond';
        const { url, headers } = UploadCryptoUtils.buildUploadRequest(params, uri, rsaKey, sessionKey);

        try {
            const got = require('got');
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const options = { headers };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                options.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }
            return await got(url, options).json();
        } catch (error) {
            const respBody = error?.response?.body || '';
            logTaskEvent('checkTransSecond 失败: ' + error.message + (respBody ? ` | 响应: ${respBody.substring(0, 500)}` : ''));
            throw error;
        }
    }

    // 提交秒传（秒传第三步）
    async commitMultiUpload(uploadFileId, fileMd5, sliceMd5) {
        const rsaKey = await this._getRsaKey();
        const sessionKey = await this._getSessionKey();
        const params = { uploadFileId: String(uploadFileId), fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), lazyCheck: '1', opertype: '3' };
        const uri = '/person/commitMultiUploadFile';
        const { url, headers } = UploadCryptoUtils.buildUploadRequest(params, uri, rsaKey, sessionKey);

        try {
            const got = require('got');
            const proxyUrl = ProxyUtil.getProxy('cloud189');
            const options = { headers };
            if (proxyUrl) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                options.agent = { https: new HttpsProxyAgent(proxyUrl) };
            }
            return await got(url, options).json();
        } catch (error) {
            const respBody = error?.response?.body || '';
            const statusCode = error?.response?.statusCode || '';

            if (statusCode === 403 && typeof respBody === 'string' && (respBody.includes('black list') || respBody.includes('InfoSecurityErrorCode'))) {
                const err = new Error('由于版权或违规文件已被云盘黑名单拦截');
                err.isBlacklisted = true;
                throw err;
            }

            const respHeaders = error?.response?.headers || {};
            // 403 时输出更多调试信息
            const debugInfo = statusCode === 403
                ? ` | 状态码: ${statusCode}, 响应头: ${JSON.stringify(respHeaders).substring(0, 300)}, 响应体: ${respBody.substring(0, 500)}`
                : (respBody ? ` | 响应: ${respBody.substring(0, 500)}` : '');
            logTaskEvent('commitMultiUpload 失败: ' + error.message + debugInfo);
            throw error;
        }
    }

    // 秒传主方法：通过 CAS 信息进行秒传（含全步骤 403 重试）
    // 流程参考 OpenList-CAS: initMultiUpload → (可选 checkTransSecond) → commitMultiUploadFile
    async rapidUpload(fileName, fileSize, fileMd5, sliceMd5, parentFolderId) {
        const maxRetries = 2;  // 最大重试次数（测试环境）
        const baseDelay = 3000;  // 固定延迟 3秒

        // 通用重试函数（403 固定间隔重试）
        const retryWithBackoff = async (fn, stepName) => {
            let retryCount = 0;
            while (retryCount < maxRetries) {
                try {
                    return await fn();
                } catch (error) {
                    if (error.isBlacklisted) throw error;  // 黑名单文件不重试
                    retryCount++;
                    const statusCode = error?.response?.statusCode || '';
                    if ((statusCode === 403 || error.message?.includes('403')) && retryCount < maxRetries) {
                        // 固定延迟 3秒
                        logTaskEvent(`[CAS秒传] ${stepName} 403，第 ${retryCount} 次重试，等待 ${baseDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, baseDelay));
                        this._rsaKey = null;  // 刷新密钥
                        this._sessionKey = null;
                        continue;
                    }
                    throw error;
                }
            }
            throw new Error(`${stepName} 重试次数耗尽`);
        };

        try {
            const sliceSize = this._partSize(fileSize);
            logTaskEvent(`[CAS秒传] 开始: ${fileName}, 大小: ${fileSize}, MD5: ${fileMd5}`);

            // 第1步: 初始化分片上传（含重试）
            const initResult = await retryWithBackoff(
                () => this.initMultiUpload(parentFolderId, fileName, fileSize, sliceSize, fileMd5, sliceMd5),
                'initMultiUpload'
            );
            if (initResult.errorCode) {
                throw new Error(initResult.errorMsg || initResult.errorCode);
            }
            if (initResult.code && initResult.code !== 'SUCCESS') {
                throw new Error(initResult.msg || initResult.code);
            }

            const uploadFileId = initResult.data?.uploadFileId;
            if (!uploadFileId) {
                throw new Error('初始化上传失败: 缺少 uploadFileId (响应: ' + JSON.stringify(initResult).substring(0, 300) + ')');
            }

            // 步骤间延迟，避免请求过快被限流
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 检查 initMultiUpload 返回的 fileDataExists
            // 如果 fileDataExists == 1，说明云端已有该文件数据，可以直接 commit
            const fileDataExistsFromInit = initResult.data?.fileDataExists;
            if (fileDataExistsFromInit == null || fileDataExistsFromInit == 0) {
                // 第2步: 需要单独检查秒传（含重试）
                const checkResult = await retryWithBackoff(
                    () => this.checkTransSecond(fileMd5, sliceMd5, uploadFileId),
                    'checkTransSecond'
                );
                if (checkResult.errorCode) {
                    throw new Error(checkResult.errorMsg || checkResult.errorCode);
                }
                if (checkResult.code && checkResult.code !== 'SUCCESS') {
                    throw new Error(checkResult.msg || checkResult.code);
                }
                const fileDataExists = checkResult.data?.fileDataExists;
                if (fileDataExists != 1) {
                    throw new Error('文件不存在于云端，无法秒传');
                }
            }

            // 步骤间延迟，避免请求过快被限流
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 第3步: 提交上传（含重试）
            const commitResult = await retryWithBackoff(
                () => this.commitMultiUpload(uploadFileId, fileMd5, sliceMd5),
                'commitMultiUpload'
            );
            if (commitResult.errorCode) {
                throw new Error(commitResult.errorMsg || commitResult.errorCode);
            }
            if (commitResult.code && commitResult.code !== 'SUCCESS') {
                throw new Error(commitResult.msg || commitResult.code);
            }

            const uploadedFileId = commitResult.file?.userFileId || commitResult.file?.id || commitResult.data?.fileId || null;
            logTaskEvent(`[CAS秒传] 成功: ${fileName}`);
            return { success: true, userFileId: uploadedFileId, message: '秒传成功' };
        } catch (error) {
            logTaskEvent(`[CAS秒传] 失败: ${fileName} - ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 计算分片大小
    _partSize(fileSize) {
        const D = 10485760; // 10MB
        if (fileSize > D * 2 * 999) return Math.max(Math.ceil(fileSize / 1999 / D), 5) * D;
        if (fileSize > D * 999) return D * 2;
        return D;
    }

    // 删除文件（移到回收站）
    async deleteFile(fileId, fileName = '') {
        try {
            const result = await this.request('/api/open/batch/createBatchTask.action', {
                method: 'POST',
                form: {
                    type: 'DELETE',
                    taskInfos: JSON.stringify([{ fileId: String(fileId), fileName, isFolder: 0 }]),
                    targetFolderId: ''
                }
            });
            return result;
        } catch (error) {
            logTaskEvent(`删除文件失败(fileId=${fileId}): ${error.message}`);
            throw error;
        }
    }

    // 下载文件内容（用于下载 CAS 文件文本）
    async downloadFileContent(fileId) {
        try {
            // 获取文件下载链接
            const response = await this.request('/api/open/file/getFileDownloadUrl.action', {
                method: 'GET',
                searchParams: {
                    fileId,
                    type: 1
                }
            });
            if (!response || !response.fileDownloadUrl) {
                throw new Error(response?.res_msg || '获取下载链接失败');
            }
            const downloadUrl = response.fileDownloadUrl.replace(/&amp;/g, '&');
            // 下载文件内容
            const content = await got(downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }).text();
            return content;
        } catch (error) {
            logTaskEvent(`下载文件内容失败(fileId=${fileId}): ${error.message}`);
            throw error;
        }
    }

    // 获取目录下的所有文件（支持翻页）
    async listAllFiles(folderId) {
        let allFiles = [];
        let pageNum = 1;
        const pageSize = 200;

        while (true) {
            const result = await this.request('/api/open/file/listFiles.action', {
                method: 'GET',
                searchParams: {
                    folderId,
                    mediaType: 0,
                    orderBy: 'lastOpTime',
                    descending: true,
                    pageNum,
                    pageSize
                }
            });

            if (!result || !result.fileListAO) break;
            const fileList = result.fileListAO.fileList || [];
            allFiles = allFiles.concat(fileList);

            const totalCount = result.fileListAO.count || 0;
            if (allFiles.length >= totalCount || fileList.length < pageSize) break;
            pageNum++;
        }

        return allFiles;
    }

    // 扫描目录中的 CAS 文件并解析
    async scanCasFiles(folderId) {
        const allFiles = await this.listAllFiles(folderId);
        const casFiles = allFiles.filter(f => CasUtils.isCasFile(f.name));

        if (casFiles.length === 0) {
            return [];
        }

        const results = [];
        for (const casFile of casFiles) {
            try {
                const content = await this.downloadFileContent(casFile.id);
                const parsed = CasUtils.parseCasContent(content);

                if (parsed && parsed.md5 && parsed.slice_md5) {
                    const realFileName = CasUtils.mergeCasFileName(casFile.name, parsed.name);
                    results.push({
                        md5: parsed.md5.toUpperCase(),
                        slice_md5: parsed.slice_md5.toUpperCase(),
                        size: parseInt(parsed.size),
                        name: realFileName,
                        casFileName: casFile.name,
                        casFileId: casFile.id
                    });
                } else {
                    logTaskEvent(`[CAS] ${casFile.name} 解析失败: 缺少 md5 或 slice_md5`);
                }
            } catch (error) {
                logTaskEvent(`[CAS] ${casFile.name} 下载失败: ${error.message}`);
            }
            // 延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        return results;
    }
}

module.exports = { Cloud189Service };