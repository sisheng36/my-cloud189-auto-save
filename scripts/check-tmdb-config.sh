#!/bin/bash

# TMDB 配置检查脚本
# 用于诊断 TMDB 搜索功能问题

echo "==================================="
echo "TMDB 配置检查工具"
echo "==================================="
echo ""

# 读取配置文件
CONFIG_FILE="data/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

echo "📄 配置文件: $CONFIG_FILE"
echo ""

# 检查 TMDB API Key
echo "---"
echo "1️⃣ 检查 TMDB API Key"
echo "---"

TMDB_API_KEY=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.tmdb?.tmdbApiKey || c.tmdb?.apiKey || '')" 2>/dev/null)

if [ -z "$TMDB_API_KEY" ] || [ "$TMDB_API_KEY" == "" ]; then
    echo "❌ TMDB API Key 未配置"
    echo ""
    echo "解决方案："
    echo "1. 访问 https://www.themoviedb.org/settings/api 申请 API Key"
    echo "2. 在系统设置中配置 API Key"
    echo "   或在配置文件中添加："
    echo '   "tmdb": { "tmdbApiKey": "your_api_key_here" }'
else
    echo "✅ TMDB API Key 已配置"
    echo "   Key 长度: ${#TMDB_API_KEY} 字符"
    
    # 测试 API Key 是否有效
    echo "   测试 API Key 有效性..."
    
    TEST_RESULT=$(curl -s "https://api.themoviedb.org/3/configuration?api_key=$TMDB_API_KEY" 2>/dev/null)
    
    if echo "$TEST_RESULT" | grep -q "images"; then
        echo "   ✅ API Key 有效"
    else
        echo "   ❌ API Key 无效或网络不可达"
        echo "   错误信息: $(echo $TEST_RESULT | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.status_message || d.error || "未知错误")')"
    fi
fi

echo ""

# 检查代理配置
echo "---"
echo "2️⃣ 检查代理配置"
echo "---"

PROXY_ENABLED=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.proxy?.enabled || false)" 2>/dev/null)
TMDB_PROXY=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.proxy?.services?.tmdb || false)" 2>/dev/null)
HTTP_PROXY=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.proxy?.http || '')" 2>/dev/null)
HTTPS_PROXY=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.proxy?.https || '')" 2>/dev/null)

if [ "$PROXY_ENABLED" == "true" ] && [ "$TMDB_PROXY" == "true" ]; then
    echo "✅ 代理已启用（TMDB）"
    echo "   HTTP: $HTTP_PROXY"
    echo "   HTTPS: $HTTPS_PROXY"
    
    # 测试代理连接
    if [ -n "$HTTP_PROXY" ]; then
        echo "   测试代理连接..."
        
        PROXY_TEST=$(curl -x "$HTTP_PROXY" -s -m 5 "https://api.themoviedb.org/3/configuration?api_key=$TMDB_API_KEY" 2>&1)
        
        if echo "$PROXY_TEST" | grep -q "images"; then
            echo "   ✅ 代理连接成功"
        else
            echo "   ❌ 代理连接失败"
            echo "   可能原因："
            echo "   - 代理服务未运行"
            echo "   - 代理地址配置错误"
            echo "   - 代理不支持 HTTPS"
        fi
    fi
else
    echo "❌ 代理未启用或未配置 TMDB"
    echo "   代理启用: $PROXY_ENABLED"
    echo "   TMDB 代理: $TMDB_PROXY"
    echo ""
    echo "⚠️  TMDB API 需要科学上网才能访问！"
    echo ""
    echo "解决方案："
    echo "在配置文件中添加："
    echo '{'
    echo '  "proxy": {'
    echo '    "enabled": true,'
    echo '    "services": { "tmdb": true },'
    echo '    "http": "http://127.0.0.1:7890",'
    echo '    "https": "http://127.0.0.1:7890"'
    echo '  }'
    echo '}'
fi

echo ""

# 检查语言设置
echo "---"
echo "3️⃣ 检查语言设置"
echo "---"

TMDB_LANG=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.tmdb?.language || 'zh-CN')" 2>/dev/null)

echo "语言设置: $TMDB_LANG"

if [ "$TMDB_LANG" == "zh-CN" ]; then
    echo "✅ 使用中文（默认）"
    echo "⚠️  某些资源可能没有中文数据，导致搜索无结果"
else
    echo "✅ 使用 $TMDB_LANG"
fi

echo ""

# 测试搜索
echo "---"
echo "4️⃣ 测试 TMDB 搜索"
echo "---"

if [ -z "$TMDB_API_KEY" ]; then
    echo "⏭️  跳过测试（API Key 未配置）"
else
    echo "测试关键词: 进击的巨人"
    
    if [ "$PROXY_ENABLED" == "true" ] && [ -n "$HTTP_PROXY" ]; then
        SEARCH_RESULT=$(curl -x "$HTTP_PROXY" -s "https://api.themoviedb.org/3/search/tv?api_key=$TMDB_API_KEY&query=进击的巨人&language=$TMDB_LANG" 2>/dev/null)
    else
        SEARCH_RESULT=$(curl -s "https://api.themoviedb.org/3/search/tv?api_key=$TMDB_API_KEY&query=进击的巨人&language=$TMDB_LANG" 2>/dev/null)
    fi
    
    RESULT_COUNT=$(echo "$SEARCH_RESULT" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.results?.length || 0)' 2>/dev/null)
    
    if [ "$RESULT_COUNT" -gt 0 ]; then
        echo "✅ 搜索成功，找到 $RESULT_COUNT 个结果"
        echo ""
        echo "第一个结果："
        echo "$SEARCH_RESULT" | node -e '
            const d = JSON.parse(require("fs").readFileSync(0));
            if (d.results && d.results[0]) {
                const r = d.results[0];
                console.log("  名称: " + (r.name || r.title));
                console.log("  TMDB ID: " + r.id);
                console.log("  年份: " + (r.first_air_date || r.release_date || "").substring(0, 4));
                console.log("  评分: " + r.vote_average);
            }
        '
    else
        echo "❌ 搜索失败或无结果"
        
        ERROR_MSG=$(echo "$SEARCH_RESULT" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.status_message || d.error || "")' 2>/dev/null)
        
        if [ -n "$ERROR_MSG" ]; then
            echo "   错误: $ERROR_MSG"
        fi
    fi
fi

echo ""
echo "==================================="
echo "检查完成"
echo "==================================="
