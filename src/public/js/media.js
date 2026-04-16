document.addEventListener('DOMContentLoaded', () => {
    // 监听表单提交
    document.getElementById('mediaForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMediaSettings();
    });
});


async function saveMediaSettings() {
    const enableStrm = document.getElementById('enableStrm').checked
    const enableEmby = document.getElementById('enableEmby').checked
    const settings = {
        strm: {
            enable: enableStrm,
        },
        emby: {
            enable: enableEmby,
            serverUrl: document.getElementById('embyServer').value,
            apiKey: document.getElementById('embyApiKey').value,
        },
        cloudSaver: {
            baseUrl: document.getElementById('cloudSaverUrl').value,
            username: document.getElementById('cloudSaverUsername').value,
            password: document.getElementById('cloudSaverPassword').value,
        },
        tmdb: {
            enableScraper: document.getElementById('enableScraper').checked,
            tmdbApiKey: document.getElementById('tmdbApiKey').value
        },
        openai: {
            enable: document.getElementById('enableOpenAI').checked,
            baseUrl: document.getElementById('openaiBaseUrl').value, //  document.getElementById('openaiBaseUrl').value, // URL_ADDRESS.openai.co
            apiKey: document.getElementById('openaiApiKey').value,
            model: document.getElementById('openaiModel').value,
            rename: {
                template: document.getElementById('openaiTemplate').value,
                movieTemplate: document.getElementById('openaiMovieTemplate').value,
            }
        },
        alist: {
            enable: document.getElementById('enableAlist').checked,
            baseUrl: document.getElementById('alistServer').value,
            apiKey: document.getElementById('alistApiKey').value
        }
    };

    try {
        const response = await fetch('/api/settings/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const result = await response.json();
        if (result.success) {
            message.success('保存成功');
        } else {
            message.warning('保存失败: ' + result.error);
        }
    } catch (error) {
        message.warning('保存失败: ' + error.message);
    }
}

// ==================== OpenAI 相关测试和模型获取逻辑 ====================

// 测试 OpenAI 连接
async function testOpenAIConnection() {
    const baseUrl = document.getElementById('openaiBaseUrl').value || 'https://api.openai.com/v1';
    const apiKey = document.getElementById('openaiApiKey').value;
    const model = document.getElementById('openaiModel').value || 'gpt-3.5-turbo';

    if (!apiKey) {
        message.warning('请先填写 API Key');
        return;
    }

    try {
        message.success('正在测试连接中，请稍候...');
        const response = await fetch('/api/openai/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, apiKey, model })
        });
        const result = await response.json();
        
        if (result.success) {
            message.success('连接成功！模型响应正常。');
        } else {
            message.warning('测试连接失败: ' + result.error);
        }
    } catch (error) {
        message.warning('测试连接失败: ' + error.message);
    }
}

let cachedOpenAIModels = [];

// 获取 OpenAI 模型列表并显示模态框
async function getOpenAIModels() {
    const baseUrl = document.getElementById('openaiBaseUrl').value || 'https://api.openai.com/v1';
    const apiKey = document.getElementById('openaiApiKey').value;

    if (!apiKey) {
        message.warning('请先填写 API Key');
        return;
    }

    try {
        message.success('正在获取模型列表中...');
        const response = await fetch('/api/openai/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, apiKey })
        });
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            cachedOpenAIModels = result.data;
            renderOpenAIModels(cachedOpenAIModels);
            document.getElementById('openaiModelsModal').style.display = 'flex';
        } else {
            message.warning('获取模型失败: ' + (result.error || '模型列表为空'));
        }
    } catch (error) {
        message.warning('获取模型失败: ' + error.message);
    }
}

function renderOpenAIModels(models) {
    const listContainer = document.getElementById('openaiModelsList');
    if (models.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">无匹配的模型</div>';
        return;
    }
    
    listContainer.innerHTML = models.map(model => `
        <div class="tmdb-result-item" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--hover-bg-color)'" onmouseout="this.style.backgroundColor='transparent'" onclick="selectOpenAIModel('${model.id}')">
            <div style="font-weight: bold; font-size: 14px;">${model.id}</div>
        </div>
    `).join('');
}

function filterOpenAIModels() {
    const searchText = document.getElementById('openaiModelSearch').value.toLowerCase();
    const filtered = cachedOpenAIModels.filter(model => model.id.toLowerCase().includes(searchText));
    renderOpenAIModels(filtered);
}

function selectOpenAIModel(modelId) {
    document.getElementById('openaiModel').value = modelId;
    closeOpenAIModelsModal();
    message.success('已自动填充模型名称');
}

function closeOpenAIModelsModal() {
    document.getElementById('openaiModelsModal').style.display = 'none';
    document.getElementById('openaiModelSearch').value = '';
}