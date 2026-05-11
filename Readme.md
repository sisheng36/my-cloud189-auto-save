<div align="center">
    <img src="img/cloud189.png" alt="Logo" width="200">
    <h1>cloud189-auto-save (🚀 二开定制版)</h1>
    <p>天翼云盘自动转存系统，基于原版深度优化，新增 CAS 家庭中转秒传、AI 智能重命名、手动 TMDB 绑定等特性。</p>
    <a href="https://github.com/ymting/my-cloud189-auto-save/packages">
        <img src="https://img.shields.io/badge/Docker-Images-blue?style=flat-square&logo=docker" alt="Docker">
    </a>
    <a href="https://github.com/ymting/my-cloud189-auto-save/releases">
        <img src="https://img.shields.io/badge/Version-2.2.64-green?style=flat-square" alt="Version">
    </a>
</div>

## 🌟 二开定制功能亮点

本项目在[原版系统](https://github.com/1307super/cloud189-auto-save)基础上进行深度二次开发，核心特性如下：

---

### 🚀 CAS 家庭中转秒传（核心功能）

**突破天翼云盘 403 版权管控限制！**

天翼云盘近期对个人秒传接口增加了严格的版权审核，大量影视资源无法通过常规秒传恢复。本版本创新性地实现了**家庭空间中转秒传方案**：

#### 工作原理

```
.cas 文件转存 → 解析元数据 → 家庭空间秒传 → COPY转存个人目录 → 清理临时文件
```

1. **生成 .cas 元数据文件**：提取视频文件的 MD5、sliceMD5、文件名、大小等特征信息，生成极小的 `.cas` 文件（仅几百字节）
2. **家庭空间秒传**：利用家庭云空间宽松的限制，通过秒传将文件恢复到家庭目录
3. **批量任务转存**：调用 `COPY` 批量任务（`copyType=2`）将文件从家庭空间转存到个人目标目录
4. **自动清理**：转存完成后自动删除家庭空间临时文件并清空回收站释放配额

#### 核心优势

- ✅ **绕过 403 拦截**：家庭空间不受版权审核限制
- ✅ **极速恢复**：秒传速度，无需重新上传
- ✅ **自动化流程**：转存后自动触发 AI 重命名、TMDB 刮削、STRM 生成
- ✅ **配额管理**：自动清理家庭空间，不占用额外存储
- ✅ **COPY转存不消耗上传额度**：家庭→个人转存不计入每日上传限制

#### 批次处理模式（v2.2.58）

采用智能批次处理，每批次处理3个文件：
- 家庭API有会话级别配额限制（约每会话3个文件）
- 批次间隔自动清空签名缓存，获取新密钥
- 每个文件秒传成功后**立即删除临时文件释放配额**
- 失败文件自动重试，超过次数标记永久失败

#### 家庭中转目录账号级配置（v2.2.59）

- **每个账号独立配置**：支持多账号使用各自家庭空间
- **同家庭组账号共享**：自动检测家庭组（familyId），同组账号可共享中转目录
- **目录选择器**：可视化界面选择家庭空间目录，支持面包屑导航和进入子目录
- **自动创建临时目录**：未配置时自动创建临时目录，完成后自动删除

#### 技术细节

- 手动构建 AccessToken 签名（SDK 不支持家庭接口签名）
- 家庭接口改用**个人RSA签名方式**，每次请求生成新的随机密钥
- 签名格式：`MD5(AccessToken={token}&Timestamp={ts}&{sorted_form_params})`
- 参考实现：[OpenList](https://github.com/OpenListTeam/OpenList) 及油猴脚本

---

### 1. 手动强制绑定 TMDB (AI 纠错杀手锏)

在原版中，如果 `AI / TMDB` API 匹配不出正确的刮削名（如英文名、生僻译名），任务会反复报错或被错误重命名。

本版本加入了"最高优先级"的**手动干预机制**：
- **直观的搜索入口**：在文件列表界面点击【指定TMDB】，弹出附带海报的 TMDB 搜索界面
- **任务名自动提取 TMDB ID**：任务名包含 `{tmdb-71233}` 格式自动提取，优先级仅次于手动绑定
- **记录永久固化**：手动选择的电影/剧集信息写入 SQLite 数据库（重启不丢失）
- **立即生效**：AI 立刻停止猜测，100% 遵照手动绑定结果重命名

#### TMDB 绑定优先级（从高到低）

| 优先级 | 来源 | 说明 |
|--------|------|------|
| **1** | 手动绑定 TMDB | 用户通过界面/TG机器人手动指定 |
| **2** | 任务名提取 TMDB ID | 任务名包含 `{tmdb-71233}` 格式 |
| **3** | TMDB 标题搜索 | 自动搜索 TMDB API 匹配 |
| **4** | 本地正则极速匹配 | 正则解析季数/集数 |
| **5** | AI 大模型回退 | 正则无法完全匹配时调用 AI |

---

### 2. 失败预警与推送（TG / 微信）

当后台自动转存匹配 TMDB 失败且未经过人工绑定时，**任务自动挂起并推送通知到手机**。

推送格式：
```
【天翼云转存】
✅《神印王座 (2022)》新增 5 集
📁 /视频/动漫/神印王座 (2022)
├── 🎞️ Throne.of.Seal.S01E198.2160p.mkv
└── 🎞️ Throne.of.Seal.S01E202.2160p.mkv
🚀 当前进度：185/202 集
```

---

### 3. Telegram Bot 增强（v2.2.60）

- **TMDB 搜索绑定**：TG机器人支持搜索并绑定 TMDB 信息
- **剧名指定**：TG指定剧名后正确应用到自动重命名
- **按键缓存优化**：callback_data 超长时自动缓存标题，避免 BUTTON_DATA_INVALID 错误

---

### 4. 可视化体验优化

- **海报墙界面** (Media Wall UI)：现代海洋蓝色调，卡片式交互
- **任务状态优化**（v2.2.60）：
  - **追剧中**：有剧集且未完结时显示橙色"追剧中"
  - **等待中**：新创建/清缓存后显示蓝色"等待中"
  - **失败**：链接失效时显示失败原因
- **家庭组账号分组展示**：按 familyId 分组，同组账号显示共享提示
- **资源链接修改**：支持随时更新分享链接和访问码
- **视频去重**：自动检测并清理同名冗余视频，支持跨格式匹配（.mkv/.mp4等）
- **详细日志**：每一步重命名逻辑清晰可见

---

### 5. 分享链接有效性检测（v2.2.60）

任务执行时自动校验分享链接状态：
- `ShareNotFound` / `ShareExpired` / `ShareDeleted` - 链接不存在/已过期/已删除
- `ShareAuditFailed` / `ShareAuditNotPass` - 审核不通过
- 失效时任务标记为 `failed`，推送通知提醒用户更新链接

---

### 6. 自动化 Docker 构建 (GHCR)

内置 GitHub Actions 工作流：
- **Push 自动构建**：`main`/`dev` 分支自动触发
- **自动版本标签**：`:latest` + `:版本号`（如 `:2.2.60`）
- **开发版标签**：`dev` 分支产出 `:dev-latest` + `:dev-版本号`

---

### 7. 任务文件过滤缓存 (性能优化)

- **极速增量扫描**：本地维护已评估文件列表，跳过已处理文件
- **TMDB数据持久化缓存**：localStorage 存储 TMDB 信息，刷新页面无需重新调用 API
- **节省 API 开销**：上百集连续剧只需处理最新 1-2 集
- **一键清空缓存**：如需重新全局校验，点击"清缓存"即可

---

### 8. AI 配置验证与调试

- **测试连接**：一键验证 AI API BaseURL 和 Key
- **获取模型列表**：自动抓取可用模型，模糊匹配搜索
- **CAS 秒传整合**：秒传成功后自动触发后续流程

---

### 9. Webhook {savePath} 占位符（v2.2.62+）

支持在自定义推送 webhook 的 URL、headers、body 中使用 `{savePath}` 占位符，用于触发 SmartStrm 任务。

#### 使用示例

配置 SmartStrm webhook 时，body 可用以下格式：

```json
{
  "event": "cs_strm",
  "strmtask": "tv",
  "savepath": "{savePath}"
}
```

这样有新增文件时，会在自动重命名等后处理完成后触发 SmartStrm 生成 STRM 文件，避免下游系统过早处理未重命名文件。

#### 相关链接

- 配合 SmartStrm 使用: https://smartstrm.github.io/settings/webhook

---

## 🛠️ Docker 快速部署

```bash
docker run -d \
  -v /yourpath/data:/home/data \
  -v /yourpath/strm:/home/strm \
  -p 3000:3000 \
  --restart unless-stopped \
  --name cloud189 \
  -e PUID=0 \
  -e PGID=0 \
  ghcr.io/ymting/my-cloud189-auto-save:latest
```

访问 `http://localhost:3000`，默认账号密码：`admin` / `admin`

---

## 📜 原版说明

账号 Cookie 抓取、STRM 生成、Emby 自动入库、TG 机器人配置等详细指南，请查阅 [README_orig.md](./README_orig.md)

---

## 🔧 CAS 使用说明

### 启用 CAS 家庭中转

1. 系统设置开启「CAS 家庭中转」选项
2. 添加账号时或编辑账号时配置家庭中转目录（可选）
3. 未配置目录时自动创建临时目录，完成后自动删除
4. 确保 `.cas` 文件已存在于分享链接中

### .cas 文件格式

```json
{
  "name": "Throne.of.Seal.S01E01.2160p.mkv",
  "size": 1234567890,
  "md5": "A1B2C3D4E5F6...",
  "sliceMd5": "1234567890AB..."
}
```

---

## 📋 版本更新日志

### v2.2.64 (2026-05-11)

- 自定义 webhook 触发时机优化：有新增文件时，在自动重命名后处理完成后触发，避免转存完成阶段过早触发下游系统
- webhook 通知补充 `📁` 保存路径，`{savePath}` 可稳定传递最终目录给 SmartStrm 等外部服务
- 自定义 webhook 与普通通知通道隔离：微信、Telegram、Bark 等常规通知不影响 webhook 触发
- 修复 TMDB 绑定/手动重命名通知缺少保存路径的问题

### v2.2.63 (2026-05-08)

- Webhook 支持 `{savePath}` 占位符：转存完成后可将保存路径传递给 SmartStrm 等外部服务（感谢 [@ThinkLogicLab](https://github.com/ThinkLogicLab) PR #15）
- 所有 got 请求添加超时配置：防止未配置代理时请求挂起导致内存泄漏
- 智能去重 v2 优化：移除 CAS 文件数量限制，支持少量文件的智能去重
- 企业微信 TMDB 绑定修复：改用 `autoRename` 而非 `processAllTasks`，避免误删文件
- TMDB 绑定后不清除缓存：防止触发完整任务流程导致文件被删除
- TMDB 绑定后自动更新任务卡片信息
- TMDBService 解构导入修复

### v2.2.60 (2026-04-27)

- 家庭中转目录账号级配置完善：添加/编辑账号时可选择目录
- 目录选择器交互优化：面包屑导航、进入子目录功能
- 任务状态显示优化：追剧中/等待中/失败智能显示
- 分享链接失效检测：自动检测并推送通知
- TG 指定剧名应用到重命名修复
- 任务 processing 状态超时自动恢复

### v2.2.59 (2026-04-24)

- 家庭中转目录从系统级改为账号级配置
- 账号按家庭组（familyId）分组展示
- 同家庭组账号可共享中转目录
- 手动绑定 TMDB 后封面/简介刷新修复

### v2.2.58 (2026-04-23)

- CAS 批次处理模式：每批次3个文件，自动循环
- 家庭签名体系重构：改用个人RSA签名方式
- 每个文件秒传后立即删除临时文件释放配额
- 任务执行并发锁机制防止重复执行
- TMDB 数据 localStorage 持久化缓存

---

## 🙏 鸣谢

- [原版项目](https://github.com/1307super/cloud189-auto-save)
- [OpenList](https://github.com/OpenListTeam/OpenList) - 家庭转存参考实现
- [OpenList-CAS](https://github.com/GitYuA/OpenList-CAS) - CAS 功能参考
