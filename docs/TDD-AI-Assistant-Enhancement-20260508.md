# 技术设计文档：AI智能助手增强方案

**文档版本**: v1.0  
**创建日期**: 2026-05-08  
**文档类型**: TDD (Technical Design Document)  
**目标受众**: 开发团队  

---

## 1. 概述

### 1.1 项目背景

当前AI助手仅具备对话聊天能力，无法执行实际系统操作。用户期望AI助手能够"全盘接管"系统事务，包括任务管理、系统监控、智能诊断等功能，同时对于危险操作需要二次确认机制。

### 1.2 设计目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| 智能意图识别 | 通过自然语言识别用户操作意图 | P0 |
| 任务全生命周期管理 | 创建、查询、执行、删除任务 | P0 |
| 权限分级与安全确认 | 危险操作需用户二次确认 | P0 |
| 系统监控与诊断 | 实时监控系统状态，智能诊断问题 | P1 |
| 批量操作能力 | 支持批量执行、删除、重试任务 | P1 |
| 上下文记忆 | 记住对话历史，理解用户习惯 | P2 |

### 1.3 关键指标

- 意图识别准确率 ≥ 90%
- 操作执行成功率 ≥ 95%
- 危险操作拦截率 100%
- 用户确认响应时间 < 2秒

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  AI对话窗口  │  │  确认对话框  │  │  结果展示器  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    意图识别层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  NLU解析器   │  │  意图分类器  │  │  参数提取器  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    权限控制层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  权限校验器  │  │  确认管理器  │  │  审计日志器  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    操作执行层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  任务管理器  │  │  系统监控器  │  │  配置管理器  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    数据访问层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  任务数据库  │  │  配置存储    │  │  日志系统    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块说明

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| NLU解析器 | 解析自然语言，提取意图和参数 | AI Function Calling |
| 意图分类器 | 分类用户意图（查询/执行/删除等） | 规则引擎 + AI |
| 权限校验器 | 判断操作是否需要确认 | 配置规则 |
| 确认管理器 | 管理确认对话框，等待用户响应 | WebSocket/SSE |
| 任务管理器 | 执行任务的CRUD操作 | Node.js + SQLite |
| 系统监控器 | 收集系统状态和资源信息 | Node.js系统API |

---

## 3. 意图识别系统

### 3.1 意图分类体系

```javascript
const INTENT_TYPES = {
  // 查询类（安全，自动执行）
  QUERY: {
    LIST_TASKS: 'list_tasks',           // 查询任务列表
    GET_TASK_DETAIL: 'get_task_detail', // 查询任务详情
    GET_SYSTEM_STATUS: 'get_system_status', // 查询系统状态
    GET_LOGS: 'get_logs',               // 查询日志
    SEARCH_TASKS: 'search_tasks'        // 搜索任务
  },
  
  // 执行类（安全，自动执行）
  EXECUTE: {
    RUN_TASK: 'run_task',               // 执行单个任务
    BATCH_RUN: 'batch_run',             // 批量执行
    PAUSE_TASK: 'pause_task',           // 暂停任务
    RESUME_TASK: 'resume_task'          // 恢复任务
  },
  
  // 管理类（危险，需确认）
  MANAGE: {
    CREATE_TASK: 'create_task',         // 创建任务
    DELETE_TASK: 'delete_task',         // 删除任务
    BATCH_DELETE: 'batch_delete',       // 批量删除
    UPDATE_CONFIG: 'update_config'      // 修改配置
  },
  
  // 智能类（P1，需确认）
  INTELLIGENT: {
    FIX_FAILED: 'fix_failed',           // 修复失败任务
    OPTIMIZE_CONFIG: 'optimize_config', // 优化配置
    SUGGEST_ACTIONS: 'suggest_actions'  // 推荐操作
  }
};
```

### 3.2 自然语言模式匹配

| 用户说 | 识别意图 | 参数提取 | 安全等级 |
|--------|----------|----------|----------|
| "查看所有任务" | LIST_TASKS | {} | ✅ 安全 |
| "查看失败的任务" | LIST_TASKS | {status: 'failed'} | ✅ 安全 |
| "https://cloud.189.cn/t/abc123" | SMART_CREATE | {shareLink: '...'} | ✅ 安全 |
| "帮我创建一个任务" | CREATE_TASK | {} | ✅ 安全 |
| "修改任务123" | UPDATE_TASK | {taskId: 123} | ✅ 安全 |
| "执行任务123" | RUN_TASK | {taskId: 123} | ✅ 安全 |
| "删除所有失败的任务" | BATCH_DELETE | {filter: 'failed'} | ⚠️ 危险 |
| "重新执行所有失败任务" | BATCH_RUN | {filter: 'failed'} | ✅ 安全 |
| "系统状态怎么样" | GET_SYSTEM_STATUS | {} | ✅ 安全 |
| "为什么任务123失败了" | GET_TASK_DETAIL | {taskId: 123, focus: 'error'} | ✅ 安全 |

### 3.3 AI Function Calling配置

```javascript
const functions = [
  {
    name: 'list_tasks',
    description: '查询任务列表，支持按状态、名称过滤',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'active', 'completed', 'failed', 'pending'],
          description: '任务状态过滤'
        },
        search: {
          type: 'string',
          description: '任务名称搜索关键词'
        },
        limit: {
          type: 'number',
          description: '返回数量限制，默认20'
        }
      }
    }
  },
  {
    name: 'create_task',
    description: '创建新的转存任务',
    parameters: {
      type: 'object',
      properties: {
        shareLink: {
          type: 'string',
          description: '分享链接'
        },
        sharePassword: {
          type: 'string',
          description: '分享密码（可选）'
        },
        targetFolder: {
          type: 'string',
          description: '目标文件夹路径'
        },
        accountId: {
          type: 'number',
          description: '账号ID'
        }
      },
      required: ['shareLink', 'targetFolder', 'accountId']
    }
  },
  {
    name: 'execute_task',
    description: '执行指定的任务',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'number',
          description: '任务ID'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'delete_task',
    description: '删除任务（需要用户确认）',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'number',
          description: '任务ID'
        },
        deleteCloud: {
          type: 'boolean',
          description: '是否同时删除云盘文件'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'batch_operation',
    description: '批量操作任务（需要用户确认）',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['execute', 'delete', 'pause', 'resume']
        },
        filter: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            ids: { type: 'array', items: { type: 'number' } }
          }
        }
      },
      required: ['operation', 'filter']
    }
  },
  {
    name: 'get_system_status',
    description: '获取系统运行状态和资源占用',
    parameters: { type: 'object', properties: {} }
  }
];
```

---

## 4. 权限控制与确认机制

### 4.1 操作安全分级

```javascript
const SECURITY_LEVELS = {
  SAFE: {
    level: 1,
    autoExecute: true,
    requireConfirm: false,
    examples: ['查询任务', '创建任务', '修改任务', '执行任务', '查看日志', '查看状态']
  },
  
  MODERATE: {
    level: 2,
    autoExecute: false,
    requireConfirm: true,
    confirmMessage: '此操作将修改数据，是否继续？',
    examples: ['批量执行', '批量暂停', '修改非关键配置']
  },
  
  DANGEROUS: {
    level: 3,
    autoExecute: false,
    requireConfirm: true,
    requirePassword: false, // 可选：是否需要输入密码
    confirmMessage: '⚠️ 此操作不可逆，请确认！',
    examples: ['删除任务', '批量删除', '修改关键配置']
  }
};

// 操作安全等级映射
const OPERATION_SECURITY = {
  'list_tasks': SECURITY_LEVELS.SAFE,
  'get_task_detail': SECURITY_LEVELS.SAFE,
  'get_system_status': SECURITY_LEVELS.SAFE,
  'execute_task': SECURITY_LEVELS.SAFE,
  'create_task': SECURITY_LEVELS.SAFE,        // 创建任务无需确认
  'update_task': SECURITY_LEVELS.SAFE,        // 修改任务无需确认
  'batch_run': SECURITY_LEVELS.MODERATE,
  'delete_task': SECURITY_LEVELS.DANGEROUS,   // 删除任务需要确认
  'batch_delete': SECURITY_LEVELS.DANGEROUS,  // 批量删除需要确认
  'update_config': SECURITY_LEVELS.DANGEROUS  // 修改配置需要确认
};
```

### 4.2 确认对话框设计

**前端组件结构：**

```html
<div class="ai-confirm-dialog">
  <div class="confirm-header">
    <span class="confirm-icon">⚠️</span>
    <h3>操作确认</h3>
  </div>
  
  <div class="confirm-body">
    <div class="operation-desc">
      <!-- 操作描述 -->
      <p>即将执行：<strong>删除任务 #123</strong></p>
      <p class="warning-text">此操作不可恢复，关联的云盘文件也将被删除</p>
    </div>
    
    <div class="operation-details">
      <!-- 操作详情 -->
      <div class="detail-item">
        <span class="label">任务名称：</span>
        <span class="value">进击的巨人 S4</span>
      </div>
      <div class="detail-item">
        <span class="label">任务状态：</span>
        <span class="value">已完成</span>
      </div>
      <div class="detail-item">
        <span class="label">已转存文件：</span>
        <span class="value">25 个</span>
      </div>
    </div>
    
    <div class="impact-analysis">
      <!-- 影响分析 -->
      <div class="impact-title">影响范围：</div>
      <ul class="impact-list">
        <li>✓ 删除数据库记录</li>
        <li>✓ 删除云盘文件（如果勾选）</li>
        <li>✗ 无法恢复</li>
      </ul>
    </div>
  </div>
  
  <div class="confirm-options">
    <label class="checkbox-option">
      <input type="checkbox" id="deleteCloudFiles">
      <span>同时删除云盘文件</span>
    </label>
  </div>
  
  <div class="confirm-footer">
    <button class="btn-cancel" onclick="cancelOperation()">取消</button>
    <button class="btn-confirm" onclick="confirmOperation()">确认执行</button>
  </div>
</div>
```

**样式设计：**

```css
.ai-confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  padding: 24px;
  max-width: 500px;
  z-index: 10000;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.confirm-icon {
  font-size: 32px;
}

.warning-text {
  color: #f59e0b;
  font-weight: 600;
  margin-top: 8px;
}

.btn-confirm {
  background: #ef4444;
  color: white;
  padding: 8px 24px;
  border-radius: 6px;
  font-weight: 600;
}
```

---

## 5. 操作执行流程

### 5.1 完整执行流程图

```
用户输入自然语言
        ↓
[意图识别] AI解析意图 + 提取参数
        ↓
[权限判断] 判断操作安全等级
        ↓
    是否安全？
   ╱         ╲
  是          否
  ↓            ↓
[执行操作]  [显示确认对话框]
  ↓            ↓
[返回结果]  用户确认？
               ↓
           ╱      ╲
          是       否
          ↓        ↓
     [执行操作] [取消操作]
          ↓
     [返回结果]
```

### 5.2 代码实现示例

**后端处理流程：**

```javascript
// POST /api/chat/process
async function processUserMessage(req, res) {
  const { message, sessionId } = req.body;
  
  try {
    // 1. 意图识别
    const intent = await recognizeIntent(message);
    
    // 2. 权限判断
    const securityLevel = OPERATION_SECURITY[intent.name];
    
    // 3. 构建响应
    if (securityLevel.requireConfirm) {
      // 需要确认的操作
      const confirmDialog = buildConfirmDialog(intent);
      return res.json({
        type: 'confirmation_required',
        dialog: confirmDialog,
        operation: intent,
        sessionId
      });
    } else {
      // 安全操作，直接执行
      const result = await executeOperation(intent);
      return res.json({
        type: 'success',
        result,
        message: formatSuccessMessage(result)
      });
    }
  } catch (error) {
    return res.json({
      type: 'error',
      message: error.message
    });
  }
}

// 确认操作执行
async function confirmAndExecute(req, res) {
  const { operation, sessionId, confirmed } = req.body;
  
  if (!confirmed) {
    return res.json({
      type: 'cancelled',
      message: '操作已取消'
    });
  }
  
  try {
    const result = await executeOperation(operation);
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      operation: operation.name,
      params: operation.params,
      result: 'success',
      timestamp: new Date()
    });
    
    return res.json({
      type: 'success',
      result,
      message: formatSuccessMessage(result)
    });
  } catch (error) {
    return res.json({
      type: 'error',
      message: error.message
    });
  }
}
```

---

## 6. 核心功能详细设计

### 6.1 任务管理功能

#### 6.1.1 创建任务

**智能识别创建（推荐方式）：**

```
用户直接发送："https://cloud.189.cn/t/xxxxx"
  ↓
AI自动识别：检测到分享链接
  ↓
AI智能解析：
    - 解析链接获取资源名称
    - TMDB刮削匹配影视信息
    - 推荐目标文件夹路径
  ↓
AI："检测到分享链接，已为您准备创建任务：
    
    📦 资源名称：进击的巨人 S4
    🎬 类型：电视剧
    📁 推荐保存到：/media/动漫/进击的巨人/
    🔑 分享密码：需要吗？
    
    确认创建？或告诉我修改哪里"
  ↓
用户："确认" 或 "保存到/media/test/"
  ↓
AI：✅ 任务创建成功！ID: 123
```

**对话式创建（传统方式）：**

```
用户："帮我创建一个任务"
  ↓
AI："好的，请提供以下信息："
    1. 分享链接
    2. 目标文件夹
    3. 选择账号
  ↓
用户输入参数
  ↓
AI：显示确认对话框
    - 任务信息预览
    - TMDB刮削结果预览
    - 影响分析
  ↓
用户确认
  ↓
AI：创建任务并返回结果
```

**实现代码：**

```javascript
// 智能识别分享链接
async function smartCreateTask(userInput) {
  // 1. 检测是否包含分享链接
  const shareLinkPattern = /https?:\/\/cloud\.189\.cn\/t\/[\w]+/gi;
  const match = userInput.match(shareLinkPattern);
  
  if (!match) {
    // 不是链接，走普通对话流程
    return null;
  }
  
  const shareLink = match[0];
  
  // 2. 解析分享链接
  const shareInfo = await parseShareLink(shareLink);
  
  // 3. TMDB刮削
  const tmdbInfo = await scrapeTMDB(shareInfo.name);
  
  // 4. 智能推荐保存路径
  const suggestedPath = suggestSavePath(shareInfo.name, tmdbInfo);
  
  // 5. 返回任务预览（等待用户确认）
  return {
    type: 'task_preview',
    message: '检测到分享链接，已为您准备创建任务',
    preview: {
      resourceName: shareInfo.name,
      videoType: tmdbInfo.type,
      tmdbInfo: tmdbInfo,
      suggestedPath: suggestedPath,
      needPassword: shareInfo.needPassword
    },
    askConfirm: true
  };
}

// 智能推荐保存路径
function suggestSavePath(resourceName, tmdbInfo) {
  const basePath = '/media/';
  
  if (tmdbInfo.type === 'movie') {
    return `${basePath}电影/${resourceName}/`;
  } else {
    return `${basePath}动漫/${resourceName}/`;
  }
}

**实现代码：**

```javascript
async function createTask(params) {
  const { shareLink, sharePassword, targetFolder, accountId } = params;
  
  // 1. 验证参数
  validateShareLink(shareLink);
  
  // 2. 解析分享链接
  const shareInfo = await parseShareLink(shareLink, sharePassword);
  
  // 3. TMDB刮削（如果启用）
  const tmdbInfo = await scrapeTMDB(shareInfo.name);
  
  // 4. 创建任务记录
  const task = await db.tasks.create({
    shareLink,
    sharePassword,
    targetFolder,
    accountId,
    resourceName: shareInfo.name,
    videoType: tmdbInfo.type,
    tmdbId: tmdbInfo.id,
    status: 'pending'
  });
  
  return {
    taskId: task.id,
    message: `任务创建成功！任务ID: ${task.id}`,
    details: {
      name: shareInfo.name,
      type: tmdbInfo.type,
      targetFolder
    }
  };
}
```

#### 6.1.2 批量操作

**批量删除示例：**

```javascript
async function batchDeleteTasks(filter) {
  // 1. 查询符合条件的任务
  const tasks = await db.tasks.findAll({
    where: buildFilter(filter)
  });
  
  // 2. 显示确认对话框（包含影响分析）
  const dialog = {
    title: '批量删除确认',
    message: `即将删除 ${tasks.length} 个任务`,
    impactAnalysis: {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      activeTasks: tasks.filter(t => t.status === 'active').length,
      totalFiles: await calculateTotalFiles(tasks)
    },
    warnings: [
      '此操作不可恢复',
      '关联的云盘文件可能被删除',
      'TMDB缓存将被清除'
    ]
  };
  
  return { type: 'confirmation_required', dialog };
}
```

### 6.2 系统监控功能

**实现：**

```javascript
async function getSystemStatus() {
  const [
    taskStats,
    resourceUsage,
    recentLogs,
    accountStats
  ] = await Promise.all([
    // 任务统计
    db.tasks.findAll({
      attributes: [
        [sequelize.fn('COUNT', '*'), 'total'],
        [sequelize.fn('SUM', sequelize.literal(`status = 'active'`)), 'active'],
        [sequelize.fn('SUM', sequelize.literal(`status = 'failed'`)), 'failed'],
        [sequelize.fn('SUM', sequelize.literal(`status = 'completed'`)), 'completed']
      ]
    }),
    
    // 资源占用
    Promise.resolve({
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }),
    
    // 最近日志
    db.logs.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']]
    }),
    
    // 账号统计
    db.accounts.count()
  ]);
  
  return {
    tasks: taskStats,
    resources: resourceUsage,
    logs: recentLogs,
    accounts: accountStats,
    timestamp: new Date()
  };
}
```

### 6.3 智能诊断功能

**失败任务诊断：**

```javascript
async function diagnoseFailedTask(taskId) {
  const task = await db.tasks.findByPk(taskId);
  const logs = await db.logs.findAll({
    where: { taskId },
    order: [['createdAt', 'DESC']],
    limit: 50
  });
  
  // AI分析失败原因
  const analysis = await aiAnalyze({
    task,
    logs,
    prompt: '分析这个任务失败的原因，并提供解决方案'
  });
  
  return {
    taskId,
    taskName: task.resourceName,
    failureReason: analysis.reason,
    suggestedSolutions: analysis.solutions,
    autoFixAvailable: analysis.canAutoFix,
    relatedLogs: logs.slice(0, 5)
  };
}
```

---

## 7. 前端实现

### 7.1 AI对话窗口增强

**新增消息类型：**

```javascript
const MESSAGE_TYPES = {
  TEXT: 'text',                    // 普通文本
  OPERATION_RESULT: 'operation',   // 操作结果
  CONFIRMATION: 'confirmation',    // 确认对话框
  TASK_CARD: 'task_card',         // 任务卡片
  SYSTEM_STATUS: 'status',        // 系统状态
  ERROR: 'error',                 // 错误信息
  SUGGESTION: 'suggestion'        // AI建议
};
```

**消息渲染组件：**

```javascript
function renderMessage(message) {
  switch (message.type) {
    case 'operation':
      return renderOperationResult(message.data);
    
    case 'confirmation':
      return renderConfirmDialog(message.data);
    
    case 'task_card':
      return renderTaskCard(message.data);
    
    case 'status':
      return renderSystemStatus(message.data);
    
    case 'suggestion':
      return renderSuggestion(message.data);
    
    default:
      return renderTextMessage(message.data);
  }
}
```

### 7.2 操作结果展示

**任务列表展示：**

```html
<div class="ai-operation-result">
  <div class="result-header">
    <span class="result-icon">✅</span>
    <span class="result-title">查询到 15 个任务</span>
  </div>
  
  <div class="result-filters">
    <span class="filter-badge">状态：失败</span>
    <span class="filter-badge">排序：时间倒序</span>
  </div>
  
  <div class="result-content">
    <div class="task-list">
      <!-- 任务卡片列表 -->
      <div class="ai-task-card" onclick="showTaskDetail(123)">
        <div class="task-name">进击的巨人 S4</div>
        <div class="task-status failed">失败</div>
        <div class="task-info">
          <span>失败原因：分享链接失效</span>
          <span>最后更新：2小时前</span>
        </div>
        <div class="task-actions">
          <button onclick="retryTask(123)">重试</button>
          <button onclick="deleteTask(123)">删除</button>
        </div>
      </div>
    </div>
  </div>
  
  <div class="result-footer">
    <button onclick="loadMore()">加载更多</button>
    <button onclick="exportResults()">导出结果</button>
  </div>
</div>
```

---

## 8. API接口设计

### 8.1 核心API列表

| 接口 | 方法 | 说明 | 安全等级 |
|------|------|------|----------|
| `/api/chat/message` | POST | 发送消息给AI | 安全 |
| `/api/chat/confirm` | POST | 确认执行操作 | 安全 |
| `/api/chat/cancel` | POST | 取消待执行操作 | 安全 |
| `/api/ai/tasks` | GET | AI查询任务列表 | 安全 |
| `/api/ai/tasks/:id` | GET | AI查询任务详情 | 安全 |
| `/api/ai/tasks` | POST | AI创建任务 | 危险 |
| `/api/ai/tasks/:id` | DELETE | AI删除任务 | 危险 |
| `/api/ai/tasks/execute` | POST | AI执行任务 | 安全 |
| `/api/ai/tasks/batch` | POST | AI批量操作 | 危险 |
| `/api/ai/system/status` | GET | AI获取系统状态 | 安全 |
| `/api/ai/diagnose/:taskId` | GET | AI诊断任务 | 安全 |

### 8.2 请求响应格式

**发送消息：**

```javascript
// Request
{
  "message": "查看所有失败的任务",
  "sessionId": "sess_123456"
}

// Response (需要确认)
{
  "type": "confirmation_required",
  "dialog": {
    "title": "批量操作确认",
    "message": "即将对 5 个失败任务执行操作",
    "operation": {
      "name": "batch_run",
      "params": { "filter": { "status": "failed" } }
    },
    "impact": {
      "count": 5,
      "warnings": ["将重新下载文件", "可能耗时较长"]
    }
  }
}

// Response (直接执行)
{
  "type": "success",
  "result": {
    "tasks": [
      { "id": 1, "name": "任务A", "status": "failed" },
      { "id": 2, "name": "任务B", "status": "failed" }
    ],
    "total": 2
  },
  "message": "查询到 2 个失败的任务"
}
```

---

## 9. 数据存储设计

### 9.1 审计日志表

```sql
CREATE TABLE ai_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id VARCHAR(50),
  operation VARCHAR(50) NOT NULL,
  params TEXT,
  result VARCHAR(20),
  error_message TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_operation (operation),
  INDEX idx_created_at (created_at)
);
```

### 9.2 对话历史表

```sql
CREATE TABLE ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  message_type VARCHAR(20),   -- 'text', 'operation', 'confirmation'
  metadata TEXT,              -- JSON格式的附加数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_session_id (session_id),
  INDEX idx_user_id (user_id)
);
```

---

## 10. 实施计划

### 10.1 分阶段实施

| 阶段 | 功能 | 工作量 | 优先级 | 依赖 |
|------|------|--------|--------|------|
| Phase 1 | 意图识别系统 | 3天 | P0 | 无 |
| Phase 1 | 权限控制机制 | 2天 | P0 | 意图识别 |
| Phase 1 | 确认对话框组件 | 2天 | P0 | 无 |
| Phase 1 | 任务查询功能 | 2天 | P0 | 意图识别 |
| Phase 2 | 任务创建/删除功能 | 3天 | P1 | Phase 1 |
| Phase 2 | 批量操作功能 | 2天 | P1 | Phase 1 |
| Phase 2 | 系统监控功能 | 2天 | P1 | Phase 1 |
| Phase 3 | 智能诊断功能 | 3天 | P2 | Phase 2 |
| Phase 3 | 上下文记忆 | 2天 | P2 | Phase 2 |
| Phase 3 | 操作推荐 | 2天 | P2 | Phase 2 |

### 10.2 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| AI意图识别错误 | 误执行危险操作 | 强制二次确认 + 操作撤销功能 |
| 用户误操作 | 数据丢失 | 操作前备份 + 操作日志追溯 |
| API性能瓶颈 | 响应缓慢 | 结果缓存 + 异步执行 |
| 并发操作冲突 | 数据不一致 | 乐观锁 + 操作队列 |

---

## 11. 测试计划

### 11.1 测试场景

**意图识别测试：**

```javascript
const testCases = [
  {
    input: "查看所有任务",
    expected: { intent: 'list_tasks', params: {} }
  },
  {
    input: "查看失败的任务",
    expected: { intent: 'list_tasks', params: { status: 'failed' } }
  },
  {
    input: "删除任务123",
    expected: { intent: 'delete_task', params: { taskId: 123 }, dangerous: true }
  },
  {
    input: "批量重新执行失败的任务",
    expected: { intent: 'batch_run', params: { filter: { status: 'failed' } } }
  }
];
```

**权限控制测试：**

```javascript
// 安全操作应自动执行
assert(autoExecute('list_tasks'));
assert(autoExecute('execute_task'));

// 危险操作应要求确认
assert(requireConfirm('create_task'));
assert(requireConfirm('delete_task'));
assert(requireConfirm('batch_delete'));
```

---

## 12. 文档与培训

### 12.1 用户文档

- 《AI助手使用指南》
- 《自然语言指令手册》
- 《常见操作示例》
- 《故障排查指南》

### 12.2 开发文档

- 《API接口文档》
- 《意图扩展开发指南》
- 《权限配置说明》
- 《测试用例编写规范》

---

## 13. 总结

本技术方案通过以下核心机制实现AI助手从"对话"到"操作"的转变：

1. **智能意图识别**：利用AI Function Calling准确识别用户意图
2. **权限分级控制**：安全操作自动执行，危险操作强制确认
3. **友好交互设计**：确认对话框清晰展示操作影响
4. **完整审计日志**：所有操作可追溯、可撤销
5. **渐进式实施**：分阶段交付，快速验证核心价值

通过本方案，用户可以用自然语言控制系统，AI助手真正成为"智能管家"，而非简单的对话机器人。
