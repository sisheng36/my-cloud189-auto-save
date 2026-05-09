# 功能增强方案

## 需求概述

### 需求 1：删除任务弹窗优化
**当前状态：** 已有"同步删除网盘"选项（checkbox）  
**改进目标：** 优化弹窗交互，使其更直观

### 需求 2：未识别影视自动重建任务
**功能描述：** 当AI自动转存未识别影视后，如果识别成功（或手动指定TMDB），自动创建规范化任务

**工作流程：**
```
原任务（未识别） → AI转存 → TMDB识别成功 → 创建新任务 → 执行新任务 → 删除原任务
```

---

## 一、删除任务弹窗优化

### 当前实现分析

**现状：**
- ✅ 已有 `deleteCloudOption` checkbox
- ✅ 已支持同步删除网盘功能
- ⚠️ UI位置不够显眼（在页面底部）

**改进方案：**

#### 方案 A：改为弹窗确认框（推荐）

修改 `src/public/js/tasks.js`:

```javascript
// 删除任务（优化版）
async function deleteTask(id) {
    // 创建自定义确认弹窗
    const result = await showDeleteConfirmDialog(id);
    if (!result.confirmed) return;
    
    loading.show();
    try {
        const response = await fetch(`/api/tasks/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteCloud: result.deleteCloud })
        });
        
        const data = await response.json();
        if (data.success) {
            removeTmdbCache(id);
            message.success('任务删除成功');
            fetchTasks();
        } else {
            message.warning('任务删除失败: ' + data.error);
        }
    } catch (error) {
        message.error('删除失败: ' + error.message);
    } finally {
        loading.hide();
    }
}

// 显示删除确认弹窗
function showDeleteConfirmDialog(taskId) {
    return new Promise((resolve) => {
        // 创建弹窗元素
        const dialog = document.createElement('div');
        dialog.className = 'delete-confirm-dialog';
        dialog.innerHTML = `
            <div class="delete-confirm-overlay"></div>
            <div class="delete-confirm-content">
                <div class="delete-confirm-header">
                    <span class="delete-confirm-icon">⚠️</span>
                    <h3>确认删除任务</h3>
                </div>
                <div class="delete-confirm-body">
                    <p>任务 ID: ${taskId}</p>
                    <label class="delete-cloud-checkbox">
                        <input type="checkbox" id="confirmDeleteCloud">
                        <span>同时删除网盘中对应的文件</span>
                    </label>
                    <p class="delete-warning" style="display: none; color: #f59e0b;">
                        ⚠️ 此操作将永久删除网盘文件，无法恢复！
                    </p>
                </div>
                <div class="delete-confirm-footer">
                    <button class="btn-cancel" id="cancelDelete">取消</button>
                    <button class="btn-confirm" id="confirmDelete">确认删除</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 获取元素
        const checkbox = dialog.querySelector('#confirmDeleteCloud');
        const warning = dialog.querySelector('.delete-warning');
        const cancelBtn = dialog.querySelector('#cancelDelete');
        const confirmBtn = dialog.querySelector('#confirmDelete');
        
        // 监听 checkbox 变化
        checkbox.addEventListener('change', (e) => {
            warning.style.display = e.target.checked ? 'block' : 'none';
            confirmBtn.style.background = e.target.checked ? '#ef4444' : '#f59e0b';
        });
        
        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve({ confirmed: false });
        });
        
        // 确认按钮
        confirmBtn.addEventListener('click', () => {
            const deleteCloud = checkbox.checked;
            document.body.removeChild(dialog);
            resolve({ confirmed: true, deleteCloud });
        });
        
        // 点击遮罩关闭
        dialog.querySelector('.delete-confirm-overlay').addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve({ confirmed: false });
        });
    });
}
```

添加 CSS 样式到 `src/public/css/components.css`:

```css
/* 删除确认弹窗 */
.delete-confirm-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
}

.delete-confirm-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
}

.delete-confirm-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-color, #fff);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    min-width: 400px;
    max-width: 500px;
}

.delete-confirm-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.delete-confirm-icon {
    font-size: 24px;
}

.delete-confirm-header h3 {
    margin: 0;
    font-size: 18px;
    color: var(--text-color, #1f2937);
}

.delete-confirm-body {
    padding: 24px;
}

.delete-confirm-body p {
    margin: 0 0 16px 0;
    color: var(--text-color, #6b7280);
}

.delete-cloud-checkbox {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    padding: 12px;
    border-radius: 8px;
    background: var(--bg-secondary, #f9fafb);
    transition: background 0.2s;
}

.delete-cloud-checkbox:hover {
    background: var(--bg-hover, #f3f4f6);
}

.delete-cloud-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.delete-warning {
    margin-top: 12px !important;
    padding: 10px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 6px;
    font-size: 14px;
}

.delete-confirm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border-color, #e5e7eb);
}

.delete-confirm-footer button {
    padding: 8px 20px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--bg-secondary, #e5e7eb);
    color: var(--text-color, #374151);
}

.btn-cancel:hover {
    background: var(--bg-hover, #d1d5db);
}

.btn-confirm {
    background: #f59e0b;
    color: white;
}

.btn-confirm:hover {
    opacity: 0.9;
}
```

---

## 二、未识别影视自动重建任务

### 功能设计

#### 核心逻辑

1. **触发时机：** 任务执行完成后，AI重命名成功识别到TMDB信息
2. **判断条件：**
   - 原任务名称与TMDB识别名称不一致
   - 或原任务未标记TMDB ID，现在识别成功
3. **执行流程：**
   ```
   任务完成 
   → 检测是否从未识别变为识别成功
   → 创建规范化新任务
   → 自动执行新任务
   → 等待新任务完成
   → 删除原任务（含网盘文件）
   ```

### 实现方案

#### 1. 修改 taskEventHandler.js

在 `_handleAutoRename` 方法后添加检测逻辑：

```javascript
// src/services/taskEventHandler.js

async _handleAutoRename(eventDto) {
    const { task, taskRepo, taskService, fileList } = eventDto;
    
    // 原有的AI重命名逻辑...
    // ... 省略 ...
    
    // 【新增】检测是否需要重建任务
    if (task.tmdbId && task.tmdbTitle) {
        const shouldRebuild = await this._shouldRebuildTask(task, tmdbResult);
        
        if (shouldRebuild) {
            logTaskEvent(`[智能重建] 检测到影视识别成功，准备创建规范化任务`);
            
            try {
                await this._rebuildTaskForUnidentifiedMedia({
                    originalTask: task,
                    tmdbInfo: tmdbResult,
                    taskService,
                    taskRepo,
                    fileList
                });
            } catch (error) {
                logTaskEvent(`[智能重建] 创建新任务失败: ${error.message}`);
            }
        }
    }
}

// 判断是否需要重建任务
async _shouldRebuildTask(task, tmdbResult) {
    // 条件1: 任务名称与TMDB标题不一致
    const nameMismatch = !task.resourceName.includes(tmdbResult.title);
    
    // 条件2: 任务未标记为已识别
    const wasUnidentified = !task.tmdbId || task.tmdbId === 0;
    
    // 条件3: TMDB识别成功
    const tmdbIdentified = tmdbResult && tmdbResult.id;
    
    // 满足条件1 且 (条件2 或 条件3)
    return (nameMismatch || wasUnidentified) && tmdbIdentified;
}

// 重建规范化任务
async _rebuildTaskForUnidentifiedMedia(params) {
    const { originalTask, tmdbInfo, taskService, taskRepo, fileList } = params;
    
    logTaskEvent(`[智能重建] 开始创建规范化任务`);
    logTaskEvent(`  原任务: ${originalTask.resourceName}`);
    logTaskEvent(`  TMDB标题: ${tmdbInfo.title} (${tmdbInfo.year || '未知年份'})`);
    
    // 1. 构建新任务名称
    const newTaskName = tmdbInfo.title;
    const year = tmdbInfo.year ? ` (${tmdbInfo.year})` : '';
    const fullTaskName = `${newTaskName}${year}`;
    
    // 2. 构建保存路径
    const mediaType = tmdbInfo.type || 'tv'; // tv/movie
    const baseDir = originalTask.account.localStrmPrefix || '/media';
    const typeDir = mediaType === 'movie' ? '电影' : '电视剧';
    const newSavePath = `${baseDir}/${typeDir}/${fullTaskName}`;
    
    logTaskEvent(`  新任务名: ${fullTaskName}`);
    logTaskEvent(`  新路径: ${newSavePath}`);
    
    // 3. 创建新任务
    const newTask = await taskService.createTask({
        accountId: originalTask.accountId,
        shareLink: originalTask.shareLink,
        accessCode: originalTask.accessCode,
        resourceName: fullTaskName,
        targetFolder: newSavePath,
        videoType: mediaType,
        tmdbId: tmdbInfo.id,
        tmdbTitle: tmdbInfo.title,
        // 继承原任务的其他配置
        enableCron: false, // 新任务不启用定时
        skipDeletion: false
    });
    
    logTaskEvent(`[智能重建] 新任务已创建: ID=${newTask.id}, 名称=${fullTaskName}`);
    
    // 4. 发送通知
    if (this.messageUtil) {
        await this.messageUtil.sendMessage({
            title: '智能任务重建',
            content: `✅ 检测到影视识别成功\n\n` +
                     `📦 原任务: ${originalTask.resourceName}\n` +
                     `🎬 TMDB: ${tmdbInfo.title}\n` +
                     `📁 新路径: ${newSavePath}\n\n` +
                     `🚀 已自动创建并执行新任务`
        });
    }
    
    // 5. 自动执行新任务
    logTaskEvent(`[智能重建] 开始执行新任务...`);
    const executeResult = await taskService.processTask(newTask);
    
    // 6. 等待新任务完成后，删除原任务
    if (executeResult) {
        logTaskEvent(`[智能重建] 新任务执行完成，准备删除原任务`);
        
        // 删除原任务及其网盘文件
        await taskService.deleteTask(originalTask.id, true);
        
        logTaskEvent(`[智能重建] ✅ 原任务已删除（包含网盘文件）`);
    }
}
```

#### 2. 在 task.js 中添加 createTask 方法（如不存在）

```javascript
// src/services/task.js

async createTask(taskDto) {
    const task = this.taskRepo.create({
        accountId: taskDto.accountId,
        shareLink: taskDto.shareLink,
        accessCode: taskDto.accessCode || '',
        resourceName: taskDto.resourceName,
        targetFolder: taskDto.targetFolder,
        videoType: taskDto.videoType || 'tv',
        tmdbId: taskDto.tmdbId || null,
        tmdbTitle: taskDto.tmdbTitle || '',
        enableCron: taskDto.enableCron || false,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    });
    
    const savedTask = await this.taskRepo.save(task);
    
    logTaskEvent(`任务创建成功: ID=${savedTask.id}, 名称=${taskDto.resourceName}`);
    
    return savedTask;
}
```

#### 3. 添加配置项

在 `data/config.json` 中添加开关：

```json
{
  "task": {
    "autoRebuildUnidentifiedTask": true,
    "autoRebuildDeleteOriginal": true
  }
}
```

在代码中检查配置：

```javascript
const autoRebuildEnabled = ConfigService.getConfigValue('task.autoRebuildUnidentifiedTask');
const deleteOriginal = ConfigService.getConfigValue('task.autoRebuildDeleteOriginal');

if (!autoRebuildEnabled) {
    return; // 功能未启用，跳过
}
```

---

## 三、实现步骤

### Phase 1：删除任务弹窗优化（优先级：高）

1. ✅ 修改 `src/public/js/tasks.js` - 添加自定义弹窗函数
2. ✅ 修改 `src/public/css/components.css` - 添加弹窗样式
3. ✅ 测试删除功能，确保兼容性

### Phase 2：智能任务重建（优先级：中）

1. ✅ 修改 `src/services/taskEventHandler.js` - 添加检测和重建逻辑
2. ✅ 修改 `src/services/task.js` - 确认 createTask 方法
3. ✅ 添加配置项和开关
4. ✅ 测试完整流程

### Phase 3：增强功能（优先级：低）

1. ⏳ 添加手动触发重建按钮（任务详情页）
2. ⏳ 记录重建历史（方便回溯）
3. ⏳ 添加Telegram Bot命令支持

---

## 四、注意事项

### 安全性考虑

1. **删除原任务前确认新任务成功**
   - 新任务必须执行成功后才删除原任务
   - 失败时保留原任务，避免数据丢失

2. **网盘删除操作**
   - 使用 `deleteCloud: true` 参数
   - 确保路径正确，避免误删

3. **错误处理**
   - 所有步骤添加 try-catch
   - 记录详细日志
   - 发送错误通知

### 性能优化

1. **异步执行**
   - 重建任务流程异步执行，不阻塞主流程
   - 使用 Promise.all 并行处理

2. **缓存清理**
   - 删除原任务时清理相关缓存
   - 避免缓存污染

---

## 五、测试用例

### 测试场景 1：删除任务弹窗

```
操作步骤：
1. 点击任务卡片删除按钮
2. 查看弹窗显示
3. 勾选"同步删除网盘"
4. 查看警告提示
5. 点击确认删除

预期结果：
- 弹窗正确显示
- checkbox交互正常
- 删除成功
- 网盘文件已删除
```

### 测试场景 2：智能任务重建

```
操作步骤：
1. 创建任务，名称为"未识别资源123"
2. 执行任务，AI识别为"进击的巨人 S4"
3. 等待任务完成

预期结果：
- 自动创建新任务"进击的巨人 S4 (2023)"
- 新任务保存路径为"/media/电视剧/进击的巨人 S4 (2023)"
- 新任务自动执行
- 原任务及网盘文件被删除
- 收到重建通知
```

---

## 六、后续优化方向

1. **批量重建：** 支持多个未识别任务批量重建
2. **重建模板：** 预设常用影视的任务模板
3. **智能路径推荐：** 基于观看历史推荐保存路径
4. **TMDB ID提取：** 从任务名称自动提取 `{tmdb-12345}` 格式
