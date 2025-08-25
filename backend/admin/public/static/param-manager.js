// 参数管理器 - 优化版
// 简化界面，实时显示当前值，去除不必要的字段

// 系统参数配置（实际应从API获取）
const SYSTEM_PARAMS = {
    staking: {
        name: '质押参数',
        params: {
            pool0_rate: { name: 'Pool 0 日化率', value: '0.4%', unit: '%', min: 0.1, max: 2 },
            pool1_rate: { name: 'Pool 1 日化率', value: '0.8%', unit: '%', min: 0.2, max: 3 },
            pool2_rate: { name: 'Pool 2 日化率', value: '1.2%', unit: '%', min: 0.3, max: 4 },
            pool3_rate: { name: 'Pool 3 日化率', value: '1.4%', unit: '%', min: 0.4, max: 5 },
            pool4_rate: { name: 'Pool 4 日化率', value: '1.6%', unit: '%', min: 0.5, max: 6 },
            lp_multiplier: { name: 'LP加成倍数', value: '5', unit: '倍', min: 1, max: 10 },
            dual_cycle_multiplier: { name: '双循环倍数', value: '100', unit: '倍', min: 10, max: 1000 },
            min_stake: { name: '最小质押量', value: '10', unit: 'HCF', min: 1, max: 100 },
            max_stake: { name: '最大质押量', value: '1000000', unit: 'HCF', min: 10000, max: 10000000 }
        }
    },
    tax: {
        name: '税费参数',
        params: {
            buy_tax: { name: '买入税', value: '2', unit: '%', min: 0, max: 10 },
            sell_tax: { name: '卖出税', value: '5', unit: '%', min: 0, max: 20 },
            transfer_tax: { name: '转账税', value: '1', unit: '%', min: 0, max: 5 },
            burn_rate: { name: '销毁比例', value: '40', unit: '%', min: 0, max: 100 },
            marketing_rate: { name: '营销比例', value: '30', unit: '%', min: 0, max: 100 },
            lp_rate: { name: 'LP比例', value: '20', unit: '%', min: 0, max: 100 },
            node_rate: { name: '节点比例', value: '10', unit: '%', min: 0, max: 100 }
        }
    },
    referral: {
        name: '推荐参数',
        params: {
            level1_rate: { name: '1级推荐', value: '20', unit: '%', min: 0, max: 50 },
            level2_rate: { name: '2级推荐', value: '18', unit: '%', min: 0, max: 50 },
            level3_rate: { name: '3级推荐', value: '16', unit: '%', min: 0, max: 50 },
            level20_rate: { name: '20级推荐', value: '2.9', unit: '%', min: 0, max: 10 },
            team_v1: { name: 'V1团队奖励', value: '6', unit: '%', min: 0, max: 20 },
            team_v6: { name: 'V6团队奖励', value: '36', unit: '%', min: 0, max: 50 },
            burn_rate: { name: '推荐销毁', value: '10', unit: '%', min: 0, max: 30 }
        }
    },
    node: {
        name: '节点参数',
        params: {
            max_nodes: { name: '最大节点数', value: '99', unit: '个', min: 99, max: 99, readonly: true },
            application_fee: { name: '申请费', value: '5000', unit: 'BSDT', min: 1000, max: 50000 },
            activation_hcf: { name: '激活HCF', value: '1000', unit: 'HCF', min: 100, max: 10000 },
            activation_lp: { name: '激活LP', value: '1000', unit: 'LP', min: 100, max: 10000 },
            slippage_share: { name: '滑点分红', value: '100', unit: '%', min: 50, max: 100 },
            fee_share: { name: '手续费分红', value: '100', unit: '%', min: 50, max: 100 },
            staking_share: { name: '质押分红', value: '2', unit: '%', min: 1, max: 10 }
        }
    },
    control: {
        name: '调控参数',
        params: {
            control_pool: { name: '调控池容量', value: '9000000', unit: 'HCF', min: 1000000, max: 50000000 },
            trigger_drop: { name: '触发跌幅', value: '10', unit: '%', min: 5, max: 30 },
            intervention_amount: { name: '干预量', value: '100000', unit: 'HCF', min: 10000, max: 1000000 },
            cooldown: { name: '冷却时间', value: '3600', unit: '秒', min: 300, max: 86400 },
            purchase_limit: { name: '7日限购', value: '500', unit: 'HCF/天', min: 100, max: 10000 }
        }
    }
};

// 初始化参数管理器
function initParamManager() {
    console.log('初始化参数管理器...');
    
    // 生成参数卡片
    renderParameterCards();
    
    // 绑定搜索功能
    bindSearchFunction();
}

// 渲染参数卡片
function renderParameterCards() {
    const container = document.getElementById('parameters');
    if (!container) return;
    
    // 创建新的参数管理界面
    container.innerHTML = `
        <h2>⚙️ 参数管理</h2>
        
        <!-- 搜索栏 -->
        <div class="param-search-bar" style="margin-bottom: 20px;">
            <input type="text" id="paramSearch" placeholder="搜索参数..." 
                style="width: 300px; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
            <button class="btn-primary" onclick="resetAllParams()" style="float: right;">
                🔄 恢复默认值
            </button>
        </div>
        
        <!-- 参数类别标签 -->
        <div class="param-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
            <button class="param-tab active" data-category="all">全部</button>
            ${Object.keys(SYSTEM_PARAMS).map(cat => 
                `<button class="param-tab" data-category="${cat}">${SYSTEM_PARAMS[cat].name}</button>`
            ).join('')}
        </div>
        
        <!-- 参数卡片容器 -->
        <div id="paramCardsContainer" class="param-cards-grid">
            ${generateParamCards()}
        </div>
        
        <!-- 批量操作 -->
        <div class="param-actions" style="margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px;">
            <h3>批量操作</h3>
            <div style="display: flex; gap: 10px;">
                <button class="btn-warning" onclick="exportParams()">📥 导出配置</button>
                <button class="btn-primary" onclick="importParams()">📤 导入配置</button>
                <button class="btn-success" onclick="saveAllParams()">💾 保存所有更改</button>
            </div>
        </div>
    `;
    
    // 添加样式
    addParamStyles();
    
    // 绑定标签切换
    bindTabSwitching();
    
    // 绑定实时编辑
    bindRealtimeEdit();
}

// 生成参数卡片HTML
function generateParamCards(category = 'all') {
    let html = '';
    
    for (let cat in SYSTEM_PARAMS) {
        if (category !== 'all' && category !== cat) continue;
        
        const categoryData = SYSTEM_PARAMS[cat];
        html += `<div class="param-category" data-category="${cat}">
            <h3 class="param-category-title">${categoryData.name}</h3>
            <div class="param-list">`;
        
        for (let key in categoryData.params) {
            const param = categoryData.params[key];
            const isReadonly = param.readonly ? 'readonly' : '';
            const bgColor = param.readonly ? '#f0f0f0' : '#fff';
            
            html += `
                <div class="param-item" data-param="${cat}.${key}">
                    <div class="param-header">
                        <span class="param-name">${param.name}</span>
                        <span class="param-current-value">${param.value} ${param.unit}</span>
                    </div>
                    <div class="param-control">
                        <input type="range" 
                            class="param-slider" 
                            min="${param.min}" 
                            max="${param.max}" 
                            value="${parseFloat(param.value)}"
                            data-param="${cat}.${key}"
                            ${isReadonly}
                            style="width: 60%;">
                        <input type="number" 
                            class="param-input" 
                            min="${param.min}" 
                            max="${param.max}" 
                            value="${parseFloat(param.value)}"
                            data-param="${cat}.${key}"
                            ${isReadonly}
                            style="width: 80px; background: ${bgColor};">
                        <span class="param-unit">${param.unit}</span>
                    </div>
                    <div class="param-range">
                        <span>最小: ${param.min}</span>
                        <span>最大: ${param.max}</span>
                    </div>
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    return html;
}

// 添加样式
function addParamStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .param-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .param-tab {
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: #fff;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .param-tab:hover {
            background: #f0f0f0;
        }
        
        .param-tab.active {
            background: #4A90E2;
            color: white;
            border-color: #4A90E2;
        }
        
        .param-cards-grid {
            display: grid;
            gap: 20px;
        }
        
        .param-category {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .param-category-title {
            color: #333;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #4A90E2;
        }
        
        .param-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        
        .param-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            transition: all 0.3s;
        }
        
        .param-item:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transform: translateY(-2px);
        }
        
        .param-item.modified {
            border-color: #FFA500;
            background: #FFF9E6;
        }
        
        .param-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-weight: 500;
        }
        
        .param-current-value {
            color: #4A90E2;
            font-weight: bold;
        }
        
        .param-control {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
        }
        
        .param-slider {
            flex: 1;
        }
        
        .param-input {
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 4px;
            text-align: center;
        }
        
        .param-range {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
    `;
    document.head.appendChild(style);
}

// 绑定标签切换
function bindTabSwitching() {
    const tabs = document.querySelectorAll('.param-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // 更新标签状态
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // 过滤显示
            const category = this.dataset.category;
            filterParamsByCategory(category);
        });
    });
}

// 过滤参数类别
function filterParamsByCategory(category) {
    const categories = document.querySelectorAll('.param-category');
    categories.forEach(cat => {
        if (category === 'all' || cat.dataset.category === category) {
            cat.style.display = 'block';
        } else {
            cat.style.display = 'none';
        }
    });
}

// 绑定实时编辑
function bindRealtimeEdit() {
    // 滑块和输入框联动
    document.querySelectorAll('.param-slider').forEach(slider => {
        slider.addEventListener('input', function() {
            const param = this.dataset.param;
            const value = this.value;
            const input = document.querySelector(`.param-input[data-param="${param}"]`);
            if (input) {
                input.value = value;
                updateParamDisplay(param, value);
            }
        });
    });
    
    document.querySelectorAll('.param-input').forEach(input => {
        input.addEventListener('input', function() {
            const param = this.dataset.param;
            const value = this.value;
            const slider = document.querySelector(`.param-slider[data-param="${param}"]`);
            if (slider) {
                slider.value = value;
                updateParamDisplay(param, value);
            }
        });
    });
}

// 更新参数显示
function updateParamDisplay(paramPath, value) {
    const [category, key] = paramPath.split('.');
    const param = SYSTEM_PARAMS[category].params[key];
    
    // 更新显示值
    const item = document.querySelector(`.param-item[data-param="${paramPath}"]`);
    if (item) {
        const display = item.querySelector('.param-current-value');
        display.textContent = `${value} ${param.unit}`;
        
        // 标记为已修改
        if (value != parseFloat(param.value)) {
            item.classList.add('modified');
        } else {
            item.classList.remove('modified');
        }
    }
}

// 搜索功能
function bindSearchFunction() {
    const searchInput = document.getElementById('paramSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const keyword = this.value.toLowerCase();
        const items = document.querySelectorAll('.param-item');
        
        items.forEach(item => {
            const name = item.querySelector('.param-name').textContent.toLowerCase();
            if (name.includes(keyword)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

// 保存所有参数
async function saveAllParams() {
    const modifiedParams = {};
    
    document.querySelectorAll('.param-item.modified').forEach(item => {
        const paramPath = item.dataset.param;
        const [category, key] = paramPath.split('.');
        const value = item.querySelector('.param-input').value;
        
        if (!modifiedParams[category]) {
            modifiedParams[category] = {};
        }
        modifiedParams[category][key] = value;
    });
    
    if (Object.keys(modifiedParams).length === 0) {
        showNotification('没有参数被修改', 'info');
        return;
    }
    
    // 模拟保存
    console.log('保存参数:', modifiedParams);
    
    // 清除修改标记
    document.querySelectorAll('.param-item.modified').forEach(item => {
        item.classList.remove('modified');
    });
    
    showNotification(`成功保存 ${Object.keys(modifiedParams).length} 个类别的参数`, 'success');
}

// 导出参数
function exportParams() {
    const params = {};
    
    for (let cat in SYSTEM_PARAMS) {
        params[cat] = {};
        for (let key in SYSTEM_PARAMS[cat].params) {
            const input = document.querySelector(`.param-input[data-param="${cat}.${key}"]`);
            params[cat][key] = input ? input.value : SYSTEM_PARAMS[cat].params[key].value;
        }
    }
    
    const dataStr = JSON.stringify(params, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `hcf_params_${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('参数配置已导出', 'success');
}

// 导入参数
function importParams() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = event => {
            try {
                const params = JSON.parse(event.target.result);
                
                // 应用导入的参数
                for (let cat in params) {
                    for (let key in params[cat]) {
                        const value = params[cat][key];
                        const input = document.querySelector(`.param-input[data-param="${cat}.${key}"]`);
                        const slider = document.querySelector(`.param-slider[data-param="${cat}.${key}"]`);
                        
                        if (input && slider) {
                            input.value = value;
                            slider.value = value;
                            updateParamDisplay(`${cat}.${key}`, value);
                        }
                    }
                }
                
                showNotification('参数配置已导入', 'success');
            } catch (error) {
                showNotification('导入失败：文件格式错误', 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// 恢复默认值
function resetAllParams() {
    if (!confirm('确定要恢复所有参数到默认值吗？')) return;
    
    for (let cat in SYSTEM_PARAMS) {
        for (let key in SYSTEM_PARAMS[cat].params) {
            const param = SYSTEM_PARAMS[cat].params[key];
            const value = parseFloat(param.value);
            
            const input = document.querySelector(`.param-input[data-param="${cat}.${key}"]`);
            const slider = document.querySelector(`.param-slider[data-param="${cat}.${key}"]`);
            
            if (input && slider) {
                input.value = value;
                slider.value = value;
                updateParamDisplay(`${cat}.${key}`, value);
            }
        }
    }
    
    showNotification('所有参数已恢复默认值', 'success');
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 添加动画
const animationStyle = document.createElement('style');
animationStyle.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(animationStyle);

// 页面加载时初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParamManager);
} else {
    initParamManager();
}

// 导出全局函数
window.saveAllParams = saveAllParams;
window.exportParams = exportParams;
window.importParams = importParams;
window.resetAllParams = resetAllParams;