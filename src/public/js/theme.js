

// 主题切换相关功能
function ensureUiThemeStylesheet(enabled) {
    const existingLink = document.getElementById('uiThemeStylesheet');
    if (enabled) {
        if (existingLink) return;
        const link = document.createElement('link');
        link.id = 'uiThemeStylesheet';
        link.rel = 'stylesheet';
        link.href = '/css/ui-themes.css';
        document.head.appendChild(link);
        return;
    }
    if (existingLink) {
        existingLink.remove();
    }
}

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeDropdown = document.getElementById('themeDropdown');
    const savedTheme = localStorage.getItem('theme') || 'auto';
    const savedUiStyle = localStorage.getItem('uiStyle') || 'classic';
    
    // 设置初始主题
    setTheme(savedTheme);
    setUiStyle(savedUiStyle);
    
    // 切换下拉菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
    });
    
    // 主题选项点击事件
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const optionElement = e.currentTarget;
            const theme = optionElement.dataset.theme;
            const uiStyle = optionElement.dataset.uiStyle;
            if (theme) {
                setTheme(theme);
                localStorage.setItem('theme', theme);
            }
            if (uiStyle) {
                setUiStyle(uiStyle);
                localStorage.setItem('uiStyle', uiStyle);
            }
            themeDropdown.classList.remove('show');
        });
    });
}

function setUiStyle(uiStyle) {
    document.documentElement.setAttribute('data-ui-style', uiStyle);
    ensureUiThemeStylesheet(uiStyle !== 'classic');
    const heroPanel = document.getElementById('heroPanel');
    if (heroPanel) {
        heroPanel.hidden = uiStyle !== 'console';
    }
    if (typeof fetchTasks === 'function') {
        fetchTasks();
    }
    if (typeof loadDashboardStats === 'function') {
        loadDashboardStats();
    }
}

function setTheme(theme) {
    // 更新主题和状态栏颜色的函数
    const updateThemeAndStatusBar = (isDark) => {
        const currentTheme = isDark ? 'dark' : 'light';
        const statusBarColor = isDark ? '#1a1a1a' : '#ffffff';
        document.documentElement.setAttribute('data-theme', currentTheme);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', statusBarColor);
    };
    if (theme === 'auto') {
        // 检查系统主题
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        updateThemeAndStatusBar(darkModeMediaQuery.matches);
        
        // 监听系统主题变化
        darkModeMediaQuery.addEventListener('change', e => {
            updateThemeAndStatusBar(e.matches);
        });
    } else {
        updateThemeAndStatusBar(theme === 'dark');
    }
}
