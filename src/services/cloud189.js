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
    async familyRapidUpload(fileName, fileSize, fileMd5, sliceMd5, familyId, familyFolderId) {
        try {
            const sliceSize = this._partSize(fileSize);
            logTaskEvent(`[家庭中转] 开始秒传至家庭空间: ${fileName}, 目录ID: ${familyFolderId || '根目录'}`);

            // 第1步: 初始化（家庭接口）
            const rsaKey = await this._getRsaKey();
            const sessionKey = await this._getSessionKey();
            const initParams = {
                parentFolderId: String(familyFolderId || ''),
                familyId: String(familyId),
                fileName: encodeURIComponent(fileName),
                fileSize: String(fileSize),
                sliceSize: String(sliceSize)
            };
            initParams.lazyCheck = '1';
            const initUri = '/family/initMultiUpload';
            const initReq = UploadCryptoUtils.buildUploadRequest(initParams, initUri, rsaKey, sessionKey);
            let initResult;
            try {
                const gotLib = require('got');
                const proxyUrl = ProxyUtil.getProxy('cloud189');
                const opts = { headers: initReq.headers };
                if (proxyUrl) {
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    opts.agent = { https: new HttpsProxyAgent(proxyUrl) };
                }
                initResult = await gotLib(initReq.url, opts).json();
            } catch (e) {
                throw new Error(`家庭initMultiUpload失败: ${e.message}`);
            }
            if (initResult.errorCode) throw new Error(initResult.errorMsg || initResult.errorCode);
            if (initResult.code && initResult.code !== 'SUCCESS') throw new Error(initResult.msg || '初始化失败');

            const uploadFileId = initResult.data?.uploadFileId;
            if (!uploadFileId) throw new Error('家庭初始化上传失败: 缺少uploadFileId');

            await new Promise(resolve => setTimeout(resolve, 500));

            // 第2步: 检查秒传（家庭接口）
            const checkUri = '/family/checkTransSecond';
            const checkParams = { fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), uploadFileId: String(uploadFileId) };
            const checkReq = UploadCryptoUtils.buildUploadRequest(checkParams, checkUri, rsaKey, sessionKey);
            let checkResult;
            try {
                const gotLib = require('got');
                const proxyUrl = ProxyUtil.getProxy('cloud189');
                const opts = { headers: checkReq.headers };
                if (proxyUrl) {
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    opts.agent = { https: new HttpsProxyAgent(proxyUrl) };
                }
                checkResult = await gotLib(checkReq.url, opts).json();
            } catch (e) {
                throw new Error(`家庭checkTransSecond失败: ${e.message}`);
            }
            if (checkResult.errorCode) throw new Error(checkResult.errorMsg || checkResult.errorCode);
            if (checkResult.code && checkResult.code !== 'SUCCESS') throw new Error(checkResult.msg || '秒传检查失败');
            const fileDataExists = checkResult.data?.fileDataExists;
            if (fileDataExists != 1) throw new Error('文件不存在于云端，无法秒传（家庭接口）');

            await new Promise(resolve => setTimeout(resolve, 500));

            // 第3步: 提交（家庭接口），含重试
            const commitUri = '/family/commitMultiUploadFile';
            const commitParams = { uploadFileId: String(uploadFileId), fileMd5: String(fileMd5), sliceMd5: String(sliceMd5), lazyCheck: '1', opertype: '3' };
            const commitReq = UploadCryptoUtils.buildUploadRequest(commitParams, commitUri, rsaKey, sessionKey);
            let commitResult;
            let retryCount = 0;
            const maxRetries = 3;
            while (retryCount < maxRetries) {
                try {
                    const gotLib = require('got');
                    const proxyUrl = ProxyUtil.getProxy('cloud189');
                    const opts = { headers: commitReq.headers };
                    if (proxyUrl) {
                        const { HttpsProxyAgent } = require('https-proxy-agent');
                        opts.agent = { https: new HttpsProxyAgent(proxyUrl) };
                    }
                    commitResult = await gotLib(commitReq.url, opts).json();
                    break;
                } catch (e) {
                    retryCount++;
                    const statusCode = e?.response?.statusCode || '';
                    if (statusCode === 403 && retryCount < maxRetries) {
                        logTaskEvent(`[家庭中转] commitMultiUpload 403，第${retryCount}次重试...`);
                        await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
                        this._rsaKey = null;
                        continue;
                    }
                    throw new Error(`家庭commitMultiUpload失败: ${e.message}`);
                }
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

    // 将家庭文件转存到个人空间指定目录
    async saveFamilyFileToPersonal(familyId, familyFileId, personalFolderId) {
        try {
            logTaskEvent(`[家庭中转] 将家庭文件(${familyFileId})转存到个人目录(${personalFolderId})`);
            const params = {
                familyId: String(familyId),
                fileIdList: String(familyFileId),
            };
            if (personalFolderId && String(personalFolderId) !== '-11') {
                params.targetFolderId = String(personalFolderId);
            }
            const result = await this.request('/api/open/family/manage/saveFileToMember.action', {
                method: 'POST',
                form: params
            });
            // 失败时 request() 底层会返回 null，不能无脑视为成功
            if (!result) {
                throw new Error('API请求未返回结构体，可能接口底层抛出了异常或请求被拦截');
            }
            if (result.res_code !== undefined && result.res_code !== 0) {
                throw new Error(result.res_message || result.errorMsg || '转存到个人空间失败');
            }
            if (result.errorCode) {
                throw new Error(result.errorMsg || '转存到个人空间失败');
            }
            logTaskEvent(`[家庭中转] 成功转存到个人空间`);
            return { success: true };
        } catch (error) {
            logTaskEvent(`[家庭中转] 转存到个人空间失败: ${error.message}`);
            return { success: false, message: error.message };
        }
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

    // 秒传主方法：通过 CAS 信息进行秒传
    // 流程参考 OpenList-CAS: initMultiUpload → (可选 checkTransSecond) → commitMultiUploadFile
    async rapidUpload(fileName, fileSize, fileMd5, sliceMd5, parentFolderId) {
        try {
            const sliceSize = this._partSize(fileSize);
            logTaskEvent(`[CAS秒传] 开始: ${fileName}, 大小: ${fileSize}, MD5: ${fileMd5}`);

            // 第1步: 初始化分片上传
            const initResult = await this.initMultiUpload(parentFolderId, fileName, fileSize, sliceSize, fileMd5, sliceMd5);
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
            await new Promise(resolve => setTimeout(resolve, 500));

            // 检查 initMultiUpload 返回的 fileDataExists
            // 如果 fileDataExists == 1，说明云端已有该文件数据，可以直接 commit
            const fileDataExistsFromInit = initResult.data?.fileDataExists;
            if (fileDataExistsFromInit == null || fileDataExistsFromInit == 0) {
                // 第2步: 需要单独检查秒传
                const checkResult = await this.checkTransSecond(fileMd5, sliceMd5, uploadFileId);
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
            await new Promise(resolve => setTimeout(resolve, 500));

            // 第3步: 提交上传（含 403 重试）
            let commitResult;
            let retryCount = 0;
            const maxRetries = 3;
            while (retryCount < maxRetries) {
                try {
                    commitResult = await this.commitMultiUpload(uploadFileId, fileMd5, sliceMd5);
                    break; // 成功则跳出
                } catch (error) {
                    if (error.isBlacklisted) {
                        throw error;
                    }
                    retryCount++;
                    if (error.message && error.message.includes('403') && retryCount < maxRetries) {
                        const delay = retryCount * 2000; // 2s, 4s, 6s 递增延迟
                        logTaskEvent(`[CAS秒传] commitMultiUpload 403，第 ${retryCount} 次重试，等待 ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        // 重试前刷新 RSA 密钥
                        this._rsaKey = null;
                        continue;
                    }
                    throw error;
                }
            }
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