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
            document.getElementById('casFamilyFolderId').value = settings.task?.casFamilyFolderId || '';
            document.getElementById('enableDeleteFamilyTempFile').checked = settings.task?.enableDeleteFamilyTempFile || false;
            document.getElementById('casConcurrentLimit').value = settings.task?.casConcurrentLimit || 1;

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
            document.getElementById('embyServer').value = settings.emby?.serverUrl || '';
            document.getElementById('embyApiKey').value = settings.emby?.apiKey || '';

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
            casFamilyFolderId: document.getElementById('casFamilyFolderId').value.trim(),
            enableDeleteFamilyTempFile: document.getElementById('enableDeleteFamilyTempFile').checked,
            casConcurrentLimit: parseInt(document.getElementById('casConcurrentLimit').value) || 5
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
        customPush: customPushConfigs
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

function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) {
        apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('systemApiKey').value = apiKey;
}

// -----------------------------------------------------
// CAS 家庭目录选择器逻辑
// -----------------------------------------------------
let casFamilyFolderSelector = null;

async function initFamilyFolderSelector() {
    if (casFamilyFolderSelector) return casFamilyFolderSelector;

    casFamilyFolderSelector = new FolderSelector({
        title: '选择家庭空间中转目录',
        apiUrl: '/api/family/folders',
        enableFavorites: false, // 家庭选择暂不支持常用目录
        onSelect: (node) => {
            if (node) {
                document.getElementById('casFamilyFolderId').value = node.id;
            }
        }
    });

    return casFamilyFolderSelector;
}

document.addEventListener('DOMContentLoaded', () => {
    // 浏览按钮
    const browseBtn = document.getElementById('browseFamilyFolderBtn');
    if (browseBtn) {
        browseBtn.addEventListener('click', async () => {
            try {
                // 获取当前账号列表找一个可用的账号去拉取家庭信息
                const response = await fetch('/api/accounts');
                const data = await response.json();
                if (!data.success || !data.data || data.data.length === 0) {
                    message.warning('请先配置天翼云盘账号');
                    return;
                }
                // 优先使用默认账号，或者第一个非 n_ 打头账号
                let account = data.data.find(a => a.isDefault && !a.username.startsWith('n_')) || 
                              data.data.find(a => !a.username.startsWith('n_')) || 
                              data.data[0];

                const selector = await initFamilyFolderSelector();
                selector.show(account.id);
            } catch (error) {
                console.error(error);
                message.warning('无法打开目录选择器');
            }
        });
    }

    // 清空按钮
    const clearBtn = document.getElementById('clearFamilyFolderBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('casFamilyFolderId').value = '';
            message.success('已重置为家庭根目录');
        });
    }
});