let customPushConfigs = []
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success) {
            const settings = data.data;
            // 系统apiKey
            document.getElementById('systemApiKey').value = settings.system?.apiKey || '';
            // 任务设置
            document.getElementById('taskExpireDays').value = settings.task?.taskExpireDays || 3;
            document.getElementById('taskCheckCron').value = settings.task?.taskCheckCron || '0 19-23 * * *';
            document.getElementById('cleanRecycleCron').value = settings.task?.cleanRecycleCron || '0 */8 * * * ';
            document.getElementById('taskMaxRetries').value = settings.task?.maxRetries || 3;
            document.getElementById('taskRetryInterval').value = settings.task?.retryInterval || 300;
            document.getElementById('enableAutoClearRecycle').checked = settings.task?.enableAutoClearRecycle || false;
            document.getElementById('enableAutoClearFamilyRecycle').checked = settings.task?.enableAutoClearFamilyRecycle || false;
            document.getElementById('mediaSuffix').value = settings.task?.mediaSuffix || '.mkv;.iso;.ts;.mp4;.avi;.rmvb;.wmv;.m2ts;.mpg;.flv;.rm;.mov';
            document.getElementById('enableOnlySaveMedia').checked = settings.task?.enableOnlySaveMedia || false;
            document.getElementById('enableAutoCreateFolder').checked = settings.task?.enableAutoCreateFolder || false;
            document.getElementById('enableCasRapidUpload').checked = settings.task?.enableCasRapidUpload ?? true;
            document.getElementById('enableDeleteCasFile').checked = settings.task?.enableDeleteCasFile ?? true;
            document.getElementById('enableCasFamilyTransfer').checked = settings.task?.enableCasFamilyTransfer ?? true;
            // casFamilyFolderId 已移除，改为账号级配置（Account.familyFolderId）
            document.getElementById('enableDeleteFamilyTempFile').checked = settings.task?.enableDeleteFamilyTempFile ?? true;

            // 企业微信设置
            document.getElementById('enableWecom').checked = settings.wecom?.enable || false;
            document.getElementById('wecomWebhook').value = settings.wecom?.webhook || '';
            // 企业微信自建应用设置
            document.getElementById('wecomCorpId').value = settings.wecom?.corpId || '';
            document.getElementById('wecomAppId').value = settings.wecom?.appId || '';
            document.getElementById('wecomAppSecret').value = settings.wecom?.appSecret || '';
            document.getElementById('wecomCallbackToken').value = settings.wecom?.callbackToken || '';
            document.getElementById('wecomCallbackAesKey').value = settings.wecom?.callbackEncodingAESKey || '';
            document.getElementById('wecomCallbackEnabled').checked = settings.wecom?.callbackEnabled || false;
            
            // Telegram 设置
            document.getElementById('enableTelegram').checked = settings.telegram?.enable || false;
            document.getElementById('proxyDomain').value = settings.telegram?.proxyDomain || '';
            document.getElementById('telegramBotToken').value = settings.telegram?.botToken || '';
            document.getElementById('telegramChatId').value = settings.telegram?.chatId || '';
            
            // WXPusher 设置
            document.getElementById('enableWXPusher').checked = settings.wxpusher?.enable || false;
            document.getElementById('wXPusherSPT').value = settings.wxpusher?.spt || '';
            
            // 代理设置
            document.getElementById('proxyHost').value = settings.proxy?.host || '';
            document.getElementById('proxyPort').value = settings.proxy?.port || '';
            document.getElementById('proxyUsername').value = settings.proxy?.username || '';
            document.getElementById('proxyPassword').value = settings.proxy?.password || '';
            document.getElementById('proxyTelegram').checked = settings.proxy?.services?.telegram || false;
            document.getElementById('proxyTmdb').checked = settings.proxy?.services?.tmdb || false;
            document.getElementById('proxyOpenAI').checked = settings.proxy?.services?.openai || false;
            document.getElementById('proxyCloud189').checked = settings.proxy?.services?.cloud189 || false;
            document.getElementById('proxyCustomPush').checked = settings.proxy?.services?.customPush || false;
            // Bark 设置
            document.getElementById('enableBark').checked = settings.bark?.enable || false;
            document.getElementById('barkServerUrl').value = settings.bark?.serverUrl || '';
            document.getElementById('barkKey').value = settings.bark?.key || '';

            // 账号密码设置
            document.getElementById('systemUserName').value = settings.system?.username || '';
            document.getElementById('systemPassword').value = settings.system?.password || '';
            
            const enableStrm = settings.strm?.enable || false
            const enableEmby = settings.emby?.enable || false
            // 媒体信息设置
            document.getElementById('enableStrm').checked = enableStrm;
            document.getElementById('enableEmby').checked = enableEmby;
            document.getElementById('enableEmbyQuery').checked = settings.emby?.enableQuery || false;
            document.getElementById('embyServer').value = settings.emby?.serverUrl || '';
            document.getElementById('embyApiKey').value = settings.emby?.apiKey || '';

            // 监听 Bot 设置
            document.getElementById('tgMonitorBotToken').value = settings.tgMonitorBot?.botToken || '';
            document.getElementById('tgMonitorChatId').value = settings.tgMonitorBot?.chatId || '';

            // 目录分类配置
            const fc = settings.folderClassification || {};
            const fcSelects = { fcMovie: fc.movie, fcDoc: fc.doc, fcAnime: fc.anime, fcTvCn: fc.tvCn, fcTvForeign: fc.tvForeign, fcUpdating: fc.updating };
            Object.entries(fcSelects).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el && val) el.setAttribute('data-value', val);
            });

            // tg机器人设置
            document.getElementById('enableTgBot').checked = settings.telegram?.bot?.enable || false;
            document.getElementById('tgBotToken').value = settings.telegram?.bot?.botToken || '';
            document.getElementById('tgBotChatId').value = settings.telegram?.bot?.chatId || '';
            // cloudSaver设置
            document.getElementById('cloudSaverUrl').value = settings.cloudSaver?.baseUrl || '';
            document.getElementById('cloudSaverUsername').value = settings.cloudSaver?.username || '';
            document.getElementById('cloudSaverPassword').value = settings.cloudSaver?.password || '';
            // 刮削
            document.getElementById('enableScraper').checked = settings.tmdb?.enableScraper || false;
            // tmdbkey
            document.getElementById('tmdbApiKey').value = settings.tmdb?.tmdbApiKey || '';

            // openai配置
            document.getElementById('enableOpenAI').checked = settings.openai?.enable || false;
            document.getElementById('openaiBaseUrl').value = settings.openai?.baseUrl || '';
            document.getElementById('openaiApiKey').value = settings.openai?.apiKey || '';
            document.getElementById('openaiModel').value = settings.openai?.model || '';
            document.getElementById('openaiTemplate').value = settings.openai?.rename?.template || '';
            document.getElementById('openaiMovieTemplate').value = settings.openai?.rename?.movieTemplate || '';

            // alist
            document.getElementById('enableAlist').checked = settings.alist?.enable || false;
            document.getElementById('alistServer').value = settings.alist?.baseUrl || '';
            document.getElementById('alistApiKey').value = settings.alist?.apiKey || '';

            // pushplus
            document.getElementById('enablePushPlus').checked = settings.pushplus?.enable || false;
            document.getElementById('pushplusToken').value = settings.pushplus?.token || '';
            document.getElementById('pushplusTopic').value = settings.pushplus?.topic || '';
            document.getElementById('pushplusChannel').value = settings.pushplus?.channel || '';
            document.getElementById('pushplusWebhook').value = settings.pushplus?.webhook || '';
            document.getElementById('pushplusTo').value = settings.pushplus?.to || '';

            customPushConfigs = settings.customPush || [];
            // 加载分类目录下拉选项
            setTimeout(loadFolderClassificationOptions, 300);
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSettings()
});

async function saveSettings() {
    const settings = {
        task: {
            taskExpireDays: parseInt(document.getElementById('taskExpireDays').value) || 3,
            taskCheckCron: document.getElementById('taskCheckCron').value || '0 19-23 * * *',
            cleanRecycleCron: document.getElementById('cleanRecycleCron').value || '0 */8 * * *',
            maxRetries: parseInt(document.getElementById('taskMaxRetries').value) || 3,
            retryInterval: parseInt(document.getElementById('taskRetryInterval').value) || 300,
            enableAutoClearRecycle: document.getElementById('enableAutoClearRecycle').checked,
            enableAutoClearFamilyRecycle: document.getElementById('enableAutoClearFamilyRecycle').checked,
            mediaSuffix: document.getElementById('mediaSuffix').value,
            enableOnlySaveMedia: document.getElementById('enableOnlySaveMedia').checked,
            enableAutoCreateFolder: document.getElementById('enableAutoCreateFolder').checked,
            enableCasRapidUpload: document.getElementById('enableCasRapidUpload').checked,
            enableDeleteCasFile: document.getElementById('enableDeleteCasFile').checked,
            enableCasFamilyTransfer: document.getElementById('enableCasFamilyTransfer').checked,
            // casFamilyFolderId 已移除，改为账号级配置
            enableDeleteFamilyTempFile: document.getElementById('enableDeleteFamilyTempFile').checked
        },
        wecom: {
            enable: document.getElementById('enableWecom').checked,
            webhook: document.getElementById('wecomWebhook').value,
            // 自建应用双向交互
            corpId: document.getElementById('wecomCorpId').value,
            appId: document.getElementById('wecomAppId').value,
            appSecret: document.getElementById('wecomAppSecret').value,
            callbackToken: document.getElementById('wecomCallbackToken').value,
            callbackEncodingAESKey: document.getElementById('wecomCallbackAesKey').value,
            callbackEnabled: document.getElementById('wecomCallbackEnabled').checked
        },
        telegram: {
            enable: document.getElementById('enableTelegram').checked,
            proxyDomain: document.getElementById('proxyDomain').value,
            botToken: document.getElementById('telegramBotToken').value,
            chatId: document.getElementById('telegramChatId').value,
            bot: {
                enable: document.getElementById('enableTgBot').checked,
                botToken: document.getElementById('tgBotToken').value,
                chatId: document.getElementById('tgBotChatId').value
            }
        },
        wxpusher: {
            enable: document.getElementById('enableWXPusher').checked,
            spt: document.getElementById('wXPusherSPT').value
        },
        proxy: {
            host: document.getElementById('proxyHost').value,
            port: parseInt(document.getElementById('proxyPort').value) || 0,
            username: document.getElementById('proxyUsername').value,
            password: document.getElementById('proxyPassword').value,
            services:{
                telegram: document.getElementById('proxyTelegram').checked,
                tmdb: document.getElementById('proxyTmdb').checked,
                openai: document.getElementById('proxyOpenAI').checked,
                cloud189: document.getElementById('proxyCloud189').checked,
                customPush: document.getElementById('proxyCustomPush').checked
            }
        },
        bark: {
            enable: document.getElementById('enableBark').checked,
            serverUrl: document.getElementById('barkServerUrl').value,
            key: document.getElementById('barkKey').value
        },
        system: {
            username: document.getElementById('systemUserName').value,
            password: document.getElementById('systemPassword').value,
            apiKey: document.getElementById('systemApiKey').value
        },
        pushplus: {
            enable: document.getElementById('enablePushPlus').checked,
            token: document.getElementById('pushplusToken').value,
            topic: document.getElementById('pushplusTopic').value,
            channel: document.getElementById('pushplusChannel').value,
            webhook: document.getElementById('pushplusWebhook').value,
            to: document.getElementById('pushplusTo').value
        },
        customPush: customPushConfigs,
        tgMonitorBot: {
            botToken: document.getElementById('tgMonitorBotToken').value,
            chatId: document.getElementById('tgMonitorChatId').value,
            enable: !!(document.getElementById('tgMonitorBotToken').value && document.getElementById('tgMonitorChatId').value)
        },
        folderClassification: {
            movie: document.getElementById('fcMovie').value || '',
            doc: document.getElementById('fcDoc').value || '',
            anime: document.getElementById('fcAnime').value || '',
            tvCn: document.getElementById('fcTvCn').value || '',
            tvForeign: document.getElementById('fcTvForeign').value || '',
            updating: document.getElementById('fcUpdating').value || ''
        }
    };
    // taskRetryInterval不能少于60秒
    if (settings.task.taskRetryInterval < 60) {
        message.warning("任务重试间隔不能小于60秒")
        return 
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await response.json();
        if (data.success) {
            message.success('保存成功');
        } else {
            message.warning('保存失败: ' + data.error);
        }
    } catch (error) {
        message.warning('保存失败: ' + error.message);
    }
}

// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', loadSettings);

// 加载常用目录到分类下拉框
async function loadFolderClassificationOptions() {
    try {
        const response = await fetch('/api/common-folders');
        const data = await response.json();
        if (!data.success) return;
        const folders = data.data || [];
        const selectIds = ['fcMovie', 'fcDoc', 'fcAnime', 'fcTvCn', 'fcTvForeign', 'fcUpdating'];
        selectIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const savedVal = select.getAttribute('data-value') || '';
            select.innerHTML = '<option value="">未选择</option>';
            folders.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.displayName || (f.path + ' (' + f.accountId + ')');
                if (f.id === savedVal) opt.selected = true;
                select.appendChild(opt);
            });
        });
    } catch (e) {
        console.error('加载常用目录失败:', e);
    }
}

function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) {
        apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('systemApiKey').value = apiKey;
}

// 移除旧的 CAS 家庭目录选择器逻辑，改为账号级配置