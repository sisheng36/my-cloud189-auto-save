const TelegramBot = require('node-telegram-bot-api');
const got = require('got');
const ConfigService = require('./ConfigService');
const ProxyUtil = require('../utils/ProxyUtil');
const { AppDataSource } = require('../database');
const { CommonFolder } = require('../entities');
const { EmbyService } = require('./emby');

class TgMonitorBot {
    constructor() {
        this.bot = null;
        this.recentMsg = new Map();    // 去重: link → expiresAt
        this.dedupMs = 5 * 60 * 1000;  // 5分钟去重
        this.queues = new Map();        // chatId → processing flag，防止并发
    }

    async start(token, chatId, enable = false) {
        if (!token || !chatId || !enable) {
            if (this.bot) {
                await this.stop();
            }
            return false;
        }
        if (this.bot) {
            await this.stop();
        }
        const proxy = ProxyUtil.getProxy('telegram');
        this.token = token;
        this.chatId = chatId;
        this.bot = new TelegramBot(token, {
            polling: true,
            request: {
                proxy: proxy,
                agentOptions: { keepAlive: true, family: 4, timeout: 30000 },
                timeout: 30000,
                forever: true,
                retries: 3
            }
        });
        this.bot.on('polling_error', (error) => {
            console.error('Monitor Bot polling error:', error.message);
        });
        this.bot.on('error', (error) => {
            console.error('Monitor Bot error:', error.message);
        });
        this._initHandlers();
        console.log('Monitor Bot 已启动');
        return true;
    }

    async stop() {
        if (!this.bot) return;
        try {
            await this.bot.stopPolling();
            this.bot = null;
        } catch (e) {
            console.error('Monitor Bot 停止失败:', e.message);
        }
    }

    _initHandlers() {
        this.bot.on('message', async (msg) => {
            const chatId = String(msg.chat.id);
            if (chatId !== this.chatId) return;
            if (msg.from?.is_bot) return;
            const text = msg.text || msg.caption || '';
            if (text.startsWith('/')) return;

            // 只处理带 inline keyboard 的转发消息
            if (!msg.reply_markup?.inline_keyboard) return;

            // 每个 chat 串行处理
            if (this.queues.get(chatId)) return;
            this.queues.set(chatId, true);
            try {
                await this._handleForwarded(msg);
            } catch (e) {
                console.error('Monitor Bot 处理消息失败:', e.message);
                this._send(chatId, '处理失败: ' + e.message);
            } finally {
                this.queues.set(chatId, false);
            }
        });
    }

    // 解析转发消息
    _parseMsg(msg) {
        let shareLink = '';
        let mediaType = '';
        let title = '';
        let year = '';

        for (const row of msg.reply_markup.inline_keyboard) {
            for (const btn of row) {
                if ((btn.text.includes('直达') || btn.text.includes('链接')) &&
                    (btn.url?.startsWith('https://cloud.189.cn/t/') ||
                     btn.url?.startsWith('https://cloud.189.cn/web/share'))) {
                    shareLink = btn.url;
                    break;
                }
            }
            if (shareLink) break;
        }

        const rawText = (msg.text || msg.caption || '').trim();

        // 根据 emoji 判断类型
        if (rawText.startsWith('📺') || rawText.startsWith('🐾')) {
            mediaType = 'tv';
        } else if (rawText.startsWith('🎬')) {
            mediaType = 'movie';
        } else if (rawText.startsWith('💽') || rawText.startsWith('📽')) {
            mediaType = /[._ ]S\d{1,3}([._ ]E\d{1,3})?/i.test(rawText) ? 'tv' : 'movie';
        }

        // 提取标题和年份
        const clean = rawText.replace(/^[📺🎬🐾💽📽]\s*/, '').replace(/\n/g, ' ');
        const yearMatch = clean.match(/\((\d{4})\)/);
        if (yearMatch) {
            year = yearMatch[1];
            title = clean.substring(0, clean.indexOf(yearMatch[0])).trim();
        } else {
            const parts = clean.split(/\s+/);
            title = parts[0] || '';
        }

        return { shareLink, mediaType, title, year, rawText: clean };
    }

    async _handleForwarded(msg) {
        const chatId = String(msg.chat.id);
        const parsed = this._parseMsg(msg);

        if (!parsed.shareLink) {
            this._send(chatId, '未从消息中提取到分享链接');
            return;
        }
        if (!parsed.mediaType) {
            this._send(chatId, '未能识别媒体类型，请手动处理');
            return;
        }

        // 去重
        if (this._isDuplicate(parsed.shareLink)) {
            return;
        }

        // TMDB 搜索
        const tmdbInfo = await this._searchTmdb(parsed.title, parsed.year, parsed.mediaType);
        if (!tmdbInfo) {
            this._send(chatId, `⚠ TMDB 未能识别该资源：${parsed.title}\n请手动处理`);
            return;
        }

        // Emby 库存检查
        const embyConfig = ConfigService.getConfigValue('emby');
        const enableQuery = typeof embyConfig === 'object' ? embyConfig.enableQuery : false;
        let embyStatus = '';
        let shouldSave = true;

        if (enableQuery && tmdbInfo.tmdbId && (tmdbInfo.type === '电视剧' || tmdbInfo.type === '动画' || tmdbInfo.type === '纪录片')) {
            const embyService = new EmbyService();
            const seasonSet = await embyService.getSeasonSet(tmdbInfo.tmdbId);
            if (seasonSet === null) {
                this._send(chatId, '⚠ Emby 服务不可达，无法检查库存');
                return;
            }
            if (seasonSet && tmdbInfo.totalSeasons > 0) {
                let hasAll = true;
                for (let i = 1; i <= tmdbInfo.totalSeasons; i++) {
                    if (!seasonSet.has(i)) { hasAll = false; break; }
                }
                if (hasAll) {
                    this._send(chatId, `⏭ ${tmdbInfo.name} · 全季已入库，跳过`);
                    return;
                }
                const have = [...seasonSet].filter(s => s > 0).sort((a, b) => a - b);
                const missing = [];
                for (let i = 1; i <= tmdbInfo.totalSeasons; i++) {
                    if (!seasonSet.has(i)) missing.push(i);
                }
                embyStatus = `已入库: S${have.join(',') || '无'} · 缺: S${missing.join(',')}`;
            } else {
                embyStatus = '未入库';
            }
        }

        // 分类目录
        const classification = ConfigService.getConfigValue('folderClassification') || {};
        const classKey = this._getClassKey(tmdbInfo.type, tmdbInfo.region, tmdbInfo.status, tmdbInfo.nextEpisodeToAir);
        const folderId = classification[classKey];
        if (!folderId) {
            this._send(chatId, '📁 请先在设置中配置分类目录');
            return;
        }

        const commonFolderRepo = AppDataSource.getRepository(CommonFolder);
        const folder = await commonFolderRepo.findOneBy({ id: folderId });
        if (!folder) {
            this._send(chatId, '📁 分类目录已失效，请重新设置');
            return;
        }

        // 创建任务
        const apiKey = ConfigService.getConfigValue('system.apiKey', '');
        const port = process.env.PORT || 3000;
        try {
            const taskResp = await got(`http://localhost:${port}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                json: {
                    accountId: folder.accountId,
                    shareLink: parsed.shareLink,
                    targetFolderId: folderId,
                    targetFolder: folder.path,
                    tgbot: true,
                    tmdbId: tmdbInfo.tmdbId,
                    tmdbTitle: tmdbInfo.name,
                    videoType: tmdbInfo.type === '电影' ? 'movie' : 'tv',
                    manualTmdbBound: true,
                    manualSeason: null
                },
                responseType: 'json'
            }).json();

            if (!taskResp.success) {
                if (taskResp.error?.includes('folder already exists')) {
                    // 重试覆盖
                    const retryResp = await got(`http://localhost:${port}/api/tasks`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                        json: {
                            accountId: folder.accountId,
                            shareLink: parsed.shareLink,
                            targetFolderId: folderId,
                            targetFolder: folder.path,
                            tgbot: true,
                            overwriteFolder: 1,
                            tmdbId: tmdbInfo.tmdbId,
                            tmdbTitle: tmdbInfo.name,
                            videoType: tmdbInfo.type === '电影' ? 'movie' : 'tv',
                            manualTmdbBound: true,
                            manualSeason: null
                        },
                        responseType: 'json'
                    }).json();
                    if (!retryResp.success) {
                        this._send(chatId, '❌ 创建任务失败: ' + (retryResp.error || '未知错误'));
                        return;
                    }
                    await this._executeTasks(apiKey, port, retryResp.data);
                } else {
                    this._send(chatId, '❌ 创建任务失败: ' + (taskResp.error || '未知错误'));
                    return;
                }
            } else {
                await this._executeTasks(apiKey, port, taskResp.data);
            }

            // 成功通知
            let reply = `✅ ${tmdbInfo.name || parsed.title}`;
            if (tmdbInfo.type) reply += ` · ${tmdbInfo.type}`;
            if (tmdbInfo.year) reply += ` (${tmdbInfo.year})`;
            reply += `\n📁 ${folder.path}`;
            if (embyStatus) reply += `\n📂 ${embyStatus}`;
            reply += `\n🔗 ${parsed.shareLink}`;
            this._send(chatId, reply);

        } catch (e) {
            console.error('Monitor Bot API 调用失败:', e.message);
            this._send(chatId, '❌ 任务处理失败: ' + e.message);
        }

        this._markProcessed(parsed.shareLink);
    }

    async _executeTasks(apiKey, port, data) {
        if (!Array.isArray(data) || !data.length) return;
        for (const task of data) {
            const id = typeof task.id === 'string' ? task.id : String(task.id);
            try {
                await got(`http://localhost:${port}/api/tasks/${id}/execute`, {
                    method: 'POST',
                    headers: { 'x-api-key': apiKey }
                });
            } catch (e) {
                console.error(`Monitor Bot 执行任务 ${id} 失败:`, e.message);
            }
        }
    }

    async _searchTmdb(title, year, mediaType) {
        const tmdbApiKey = ConfigService.getConfigValue('tmdb.apiKey');
        if (!tmdbApiKey || !title) return null;
        try {
            const searchType = mediaType === 'movie' ? 'movie' : 'tv';
            const port = process.env.PORT || 3000;
            const apiKey = ConfigService.getConfigValue('system.apiKey', '');

            // Search
            const searchResp = await got(`http://localhost:${port}/api/tmdb/search`, {
                searchParams: { query: title, type: searchType },
                headers: { 'x-api-key': apiKey },
                responseType: 'json'
            }).json();
            if (!searchResp.success || !searchResp.data?.length) return null;

            const best = searchResp.data[0];
            const tmdbId = String(best.id);
            const name = best.title || best.name || '';

            // 获取详情
            const detailResp = await got(`http://localhost:${port}/api/tmdb/detail`, {
                searchParams: { id: tmdbId, type: searchType },
                headers: { 'x-api-key': apiKey },
                responseType: 'json'
            }).json();

            let typeStr = searchType === 'movie' ? '电影' : '电视剧';
            let totalSeasons = 0;
            let region = '';
            let status = '';
            let nextEpisodeToAir = '';
            let detailYear = year;

            if (detailResp.success && detailResp.data) {
                const d = detailResp.data;
                if (d.releaseDate) detailYear = d.releaseDate.substring(0, 4);
                totalSeasons = d.totalSeasons || 0;
                status = d.status || '';
                if (d.nextEpisodeToAir?.air_date) nextEpisodeToAir = d.nextEpisodeToAir.air_date;
                if (searchType !== 'movie') {
                    if (d.genres?.some(g => g.id === 16)) typeStr = '动画';
                    else if (d.genres?.some(g => g.id === 99)) typeStr = '纪录片';
                }
                if (d.originCountry?.length) {
                    const countryMap = { CN: '中国', US: '美国', JP: '日本', KR: '韩国', GB: '英国', FR: '法国',
                        DE: '德国', IT: '意大利', ES: '西班牙', IN: '印度', TH: '泰国', TW: '台湾', HK: '香港',
                        AU: '澳大利亚', CA: '加拿大', RU: '俄罗斯', BR: '巴西' };
                    region = countryMap[d.originCountry[0]] || d.originCountry[0] || '';
                }
            }

            return { tmdbId, name, type: typeStr, year: detailYear, region, totalSeasons, status, nextEpisodeToAir };
        } catch (e) {
            console.error('Monitor Bot TMDB 搜索失败:', e.message);
            return null;
        }
    }

    _getClassKey(type, region, status, nextEpisodeToAir) {
        if ((type === '电视剧' || type === '动画' || type === '纪录片') &&
            status === 'Returning Series' && nextEpisodeToAir) {
            return 'updating';
        }
        switch (type) {
            case '电影': return 'movie';
            case '纪录片': return 'doc';
            case '动画': return 'anime';
            case '电视剧':
                if (region === '中国' || region === '台湾' || region === '香港') return 'tvCn';
                return 'tvForeign';
            default: return 'movie';
        }
    }

    _isDuplicate(link) {
        const now = Date.now();
        for (const [key, expires] of this.recentMsg) {
            if (now > expires) { this.recentMsg.delete(key); continue; }
            if (this._linkKey(key) === this._linkKey(link)) return true;
        }
        return false;
    }

    _markProcessed(link) {
        this.recentMsg.set(link, Date.now() + this.dedupMs);
    }

    _linkKey(link) {
        return link.replace(/^https?:\/\/cloud\.189\.cn\/(t\/|web\/share\?code=)/, '').replace(/[?&].*$/, '');
    }

    _send(chatId, text) {
        if (!this.bot) return;
        this.bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }).catch(e => console.error('Monitor Bot 发送失败:', e.message));
    }
}

module.exports = { TgMonitorBot };
