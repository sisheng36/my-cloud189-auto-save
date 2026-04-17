<div align="center">
    <img src="img/cloud189.png" alt="Logo" width="200">
    <h1>cloud189-auto-save (🚀 二开定制版)</h1>
    <p>天翼云盘自动转存系统，基于原版深度优化，新增 CAS 家庭中转秒传、AI 智能重命名、手动 TMDB 绑定等特性。</p>
    <a href="https://github.com/ymting/my-cloud189-auto-save/packages">
        <img src="https://img.shields.io/badge/Docker-Images-blue?style=flat-square&logo=docker" alt="Docker">
    </a>
    <a href="https://github.com/ymting/my-cloud189-auto-save/releases">
        <img src="https://img.shields.io/badge/Version-2.2.57-green?style=flat-square" alt="Version">
    </a>
</div>

## 🌟 二开定制功能亮点

本项目在[原版系统](https://github.com/1307super/cloud189-auto-save)基础上进行深度二次开发，核心特性如下：

---

### 🚀 新功能：CAS 家庭中转秒传（v2.2.57）

**突破天翼云盘 403 版权管控限制！**

天翼云盘近期对个人秒传接口增加了严格的版权审核，大量影视资源无法通过常规秒传恢复。本版本创新性地实现了**家庭空间中转秒传方案**：

#### 工作原理
1. **生成 .cas 元数据文件**：提取视频文件的 MD5、sliceMD5、文件名、大小等特征信息，生成极小的 `.cas` 文件（仅几百字节）
2. **家庭空间秒传**：利用家庭云空间极其宽松的限制，通过秒传将文件恢复到家庭目录
3. **批量任务转存**：调用 `COPY` 批量任务（`copyType=2`）将文件从家庭空间转存到个人目标目录
4. **自动清理**：转存完成后自动删除家庭空间临时文件并清空回收站释放配额

#### 核心优势
- ✅ **绕过 403 拦截**：家庭空间不受版权审核限制
- ✅ **极速恢复**：秒传速度，无需重新上传
- ✅ **自动化流程**：转存后自动触发 AI 重命名、TMDB 刮削、STRM 生成
- ✅ **配额管理**：自动清理家庭空间，不会占用额外存储

#### 技术细节
- 手动构建 AccessToken 签名（SDK 不支持家庭接口签名）
- 签名格式：`MD5(AccessToken={token}&Timestamp={ts}&{sorted_form_params})`
- 参考实现：[OpenList](https://github.com/OpenListTeam/OpenList) 及油猴脚本 `upload189-cas-web-14.js`

---

### 1. 手动强制绑定 TMDB (AI 纠错杀手锏)

在原版中，如果 `AI / TMDB` API 匹配不出正确的刮削名（如英文名、生僻译名），任务会反复报错或被错误重命名。

本版本加入了"最高优先级"的**手动干预机制**：
- **直观的搜索入口**：在文件列表界面点击【指定TMDB】，弹出附带海报的 TMDB 搜索界面
- **记录永久固化**：手动选择的电影/剧集信息写入 SQLite 数据库（重启不丢失）
- **立即生效**：AI 立刻停止猜测，100% 遵照手动绑定结果重命名

---

### 2. 失败预警与推送（TG / 微信）

当后台自动转存匹配 TMDB 失败且未经过人工绑定时，**任务自动挂起并推送通知到手机**，而不是默默出错。

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

### 3. 可视化体验优化
- **海报墙界面** (Media Wall UI)：现代海洋蓝色调，卡片式交互
- **资源链接修改**：支持随时更新分享链接和访问码
- **视频去重**：自动检测并清理同名冗余视频
- **详细日志**：每一步重命名逻辑清晰可见

---

### 4. 自动化 Docker 构建 (GHCR)

内置 GitHub Actions 工作流：
- **Push 自动构建**：`main`/`dev` 分支自动触发
- **自动版本标签**：`:latest` + `:版本号`（如 `:2.2.57`）
- **开发版标签**：`dev` 分支产出 `:dev-latest` + `:dev-版本号`

---

### 5. 任务文件过滤缓存 (性能优化)

- **极速增量扫描**：本地维护已评估文件列表，跳过已处理文件
- **节省 API 开销**：上百集连续剧只需处理最新 1-2 集
- **一键清空缓存**：如需重新全局校验，点击"清缓存"即可

---

### 6. AI 配置验证与调试
- **测试连接**：一键验证 AI API BaseURL 和 Key
- **获取模型列表**：自动抓取可用模型，模糊匹配搜索
- **CAS 秒传整合**：秒传成功后自动触发后续流程

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
1. 在设置页面开启「CAS 家庭中转」选项
2. 配置家庭云 ID（系统可自动获取）
3. 设置家庭秒传目录 ID（可自动获取根目录）
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

## 🙏 鸣谢

- [原版项目](https://github.com/1307super/cloud189-auto-save)
- [OpenList](https://github.com/OpenListTeam/OpenList) - 家庭转存参考实现
- [OpenList-CAS](https://github.com/GitYuA/OpenList-CAS) - CAS 功能参考