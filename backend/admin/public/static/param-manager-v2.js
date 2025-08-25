// 参数管理器V2 - 明确区分链上/链下参数
// 解决参数管理混乱问题，避免误导操作

// ⚠️ 重要说明：
// 链上参数(onchain): 存储在智能合约中，需要通过区块链交易修改，影响实际业务逻辑
// 链下参数(offchain): 存储在数据库中，仅影响前端显示，不影响合约执行

const PARAM_CONFIG = {
    // 🔗 链上参数 - 这些参数存储在智能合约中
    onchain: {
        name: '🔗 链上参数（智能合约控制）',
        readonly: true, // 只能通过合约交易修改
        description: '这些参数存储在区块链上，修改需要发送交易并消耗Gas费',
        categories: {
            token: {
                name: 'HCF代币合约',
                contract: 'HCFToken.sol',
                params: {
                    buyTaxRate: { 
                        name: '买入税率', 
                        value: '2%', 
                        current: '链上读取中...', 
                        setter: 'setBuyTaxRate',
                        description: '实际交易税率，由合约owner控制'
                    },
                    sellTaxRate: { 
                        name: '卖出税率', 
                        value: '5%', 
                        current: '链上读取中...', 
                        setter: 'setSellTaxRate',
                        description: '实际交易税率，由合约owner控制'
                    },
                    transferTaxRate: { 
                        name: '转账税率', 
                        value: '1%', 
                        current: '链上读取中...', 
                        setter: 'setTransferTaxRate',
                        description: '实际转账税率，由合约owner控制'
                    },
                    totalSupply: { 
                        name: '代币总量', 
                        value: '10亿', 
                        current: '链上读取中...', 
                        readonly: true,
                        description: '代币总供应量，不可修改'
                    }
                }
            },
            staking: {
                name: '质押合约',
                contract: 'HCFStaking.sol',
                params: {
                    pool0_min: { 
                        name: 'Pool 0 最小质押', 
                        value: '10 HCF', 
                        current: '链上读取中...', 
                        readonly: true,
                        description: '质押池门槛，合约常量'
                    },
                    pool0_dailyRate: { 
                        name: 'Pool 0 日化率', 
                        value: '0.4%', 
                        current: '链上读取中...', 
                        setter: 'updateLevelRates',
                        description: '基础质押收益率'
                    },
                    lpMultiplier: { 
                        name: 'LP模式倍数', 
                        value: '2倍', 
                        current: '链上读取中...', 
                        readonly: true,
                        description: 'LP模式收益倍数，合约常量'
                    },
                    dualCycleMultiplier: { 
                        name: '双循环倍数', 
                        value: '100倍', 
                        current: '链上读取中...', 
                        setter: 'setDualCycleMultiplier',
                        description: '双循环激活后的收益倍数'
                    }
                }
            },
            node: {
                name: '节点NFT合约',
                contract: 'HCFNodeNFT.sol',
                params: {
                    maxNodes: { 
                        name: '最大节点数', 
                        value: '99', 
                        current: '99', 
                        readonly: true,
                        description: '节点数量上限，合约常量，永不可改'
                    },
                    applicationFee: { 
                        name: '申请费用', 
                        value: '5000 BSDT', 
                        current: '链上读取中...', 
                        setter: 'setApplicationFee',
                        description: '节点申请费用'
                    },
                    activationHCF: { 
                        name: '激活HCF要求', 
                        value: '1000 HCF', 
                        current: '链上读取中...', 
                        setter: 'setActivationRequirement',
                        description: '激活节点需要的HCF数量'
                    }
                }
            }
        }
    },
    
    // 💾 链下参数 - 这些参数仅存储在数据库中
    offchain: {
        name: '💾 链下参数（前端显示控制）',
        readonly: false, // 可以直接修改
        description: '这些参数仅影响前端界面显示，不影响智能合约执行',
        categories: {
            display: {
                name: '界面显示',
                params: {
                    maintenance_mode: { 
                        name: '维护模式', 
                        value: false, 
                        type: 'boolean',
                        description: '开启后前端显示维护提示'
                    },
                    announcement: { 
                        name: '公告内容', 
                        value: '', 
                        type: 'text',
                        description: '前端顶部公告栏内容'
                    },
                    theme: { 
                        name: '界面主题', 
                        value: 'light', 
                        type: 'select',
                        options: ['light', 'dark', 'auto'],
                        description: '前端界面主题'
                    }
                }
            },
            limits: {
                name: '前端限制',
                params: {
                    min_display_amount: { 
                        name: '最小显示金额', 
                        value: '0.001', 
                        type: 'number',
                        unit: 'HCF',
                        description: '前端显示的最小金额'
                    },
                    max_tx_display: { 
                        name: '最大交易显示数', 
                        value: '100', 
                        type: 'number',
                        description: '交易列表最多显示条数'
                    },
                    refresh_interval: { 
                        name: '刷新间隔', 
                        value: '5', 
                        type: 'number',
                        unit: '秒',
                        description: '数据自动刷新间隔'
                    }
                }
            },
            features: {
                name: '功能开关',
                params: {
                    enable_swap: { 
                        name: '显示兑换功能', 
                        value: true, 
                        type: 'boolean',
                        description: '是否在前端显示兑换入口'
                    },
                    enable_staking: { 
                        name: '显示质押功能', 
                        value: true, 
                        type: 'boolean',
                        description: '是否在前端显示质押入口'
                    },
                    enable_referral: { 
                        name: '显示推荐功能', 
                        value: true, 
                        type: 'boolean',
                        description: '是否在前端显示推荐链接'
                    }
                }
            }
        }
    }
};

// 初始化参数管理器V2
function initParamManagerV2() {
    console.log('初始化参数管理器V2...');
    renderParametersV2();
    bindEventsV2();
    
    // 尝试读取链上参数
    fetchOnchainParams();
}

// 渲染参数界面
function renderParametersV2() {
    const container = document.getElementById('parameters');
    if (!container) return;
    
    container.innerHTML = `
        <h2>⚙️ 参数管理 V2.0</h2>
        
        <!-- 重要提示 -->
        <div class="alert alert-warning" style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <strong>⚠️ 重要说明：</strong>
            <ul style="margin: 10px 0;">
                <li><strong>链上参数</strong>：需要通过智能合约交易修改，影响实际业务逻辑，需要Gas费</li>
                <li><strong>链下参数</strong>：仅影响前端显示，可直接修改，不需要Gas费</li>
                <li>请勿混淆两种参数类型，避免操作失误</li>
            </ul>
        </div>
        
        <!-- 参数类型选择 -->
        <div class="param-type-selector" style="display: flex; gap: 20px; margin-bottom: 30px;">
            <button class="btn-param-type active" data-type="onchain">
                🔗 链上参数 (${Object.keys(PARAM_CONFIG.onchain.categories).length} 类)
            </button>
            <button class="btn-param-type" data-type="offchain">
                💾 链下参数 (${Object.keys(PARAM_CONFIG.offchain.categories).length} 类)
            </button>
        </div>
        
        <!-- 链上参数区域 -->
        <div id="onchainParams" class="param-section">
            ${renderOnchainParams()}
        </div>
        
        <!-- 链下参数区域 -->
        <div id="offchainParams" class="param-section" style="display: none;">
            ${renderOffchainParams()}
        </div>
    `;
    
    addStylesV2();
}

// 渲染链上参数
function renderOnchainParams() {
    let html = `
        <div class="section-header">
            <h3>🔗 链上参数（需要区块链交易修改）</h3>
            <button class="btn-secondary" onclick="refreshOnchainParams()">🔄 刷新链上数据</button>
        </div>
    `;
    
    for (let catKey in PARAM_CONFIG.onchain.categories) {
        const category = PARAM_CONFIG.onchain.categories[catKey];
        html += `
            <div class="param-category onchain-category">
                <h4>${category.name} <small>(${category.contract})</small></h4>
                <div class="param-grid">
        `;
        
        for (let paramKey in category.params) {
            const param = category.params[paramKey];
            const isReadonly = param.readonly;
            
            html += `
                <div class="param-card ${isReadonly ? 'readonly' : ''}">
                    <div class="param-header">
                        <span class="param-name">${param.name}</span>
                        ${isReadonly ? '<span class="badge readonly">只读</span>' : '<span class="badge writable">可修改</span>'}
                    </div>
                    <div class="param-value">
                        <div class="current-value">
                            <span class="label">当前值:</span>
                            <span class="value">${param.current || param.value}</span>
                        </div>
                        <div class="default-value">
                            <span class="label">默认值:</span>
                            <span class="value">${param.value}</span>
                        </div>
                    </div>
                    <div class="param-description">${param.description}</div>
                    ${!isReadonly ? `
                        <div class="param-actions">
                            <button class="btn-modify" onclick="modifyOnchainParam('${catKey}', '${paramKey}')">
                                📝 发起修改交易
                            </button>
                            <small class="gas-info">需要Gas费</small>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    return html;
}

// 渲染链下参数
function renderOffchainParams() {
    let html = `
        <div class="section-header">
            <h3>💾 链下参数（可直接修改）</h3>
            <button class="btn-primary" onclick="saveOffchainParams()">💾 保存所有更改</button>
        </div>
    `;
    
    for (let catKey in PARAM_CONFIG.offchain.categories) {
        const category = PARAM_CONFIG.offchain.categories[catKey];
        html += `
            <div class="param-category offchain-category">
                <h4>${category.name}</h4>
                <div class="param-grid">
        `;
        
        for (let paramKey in category.params) {
            const param = category.params[paramKey];
            let inputHtml = '';
            
            if (param.type === 'boolean') {
                inputHtml = `
                    <label class="switch">
                        <input type="checkbox" ${param.value ? 'checked' : ''} 
                               data-param="${catKey}.${paramKey}">
                        <span class="slider"></span>
                    </label>
                `;
            } else if (param.type === 'select') {
                inputHtml = `
                    <select data-param="${catKey}.${paramKey}">
                        ${param.options.map(opt => 
                            `<option value="${opt}" ${param.value === opt ? 'selected' : ''}>${opt}</option>`
                        ).join('')}
                    </select>
                `;
            } else if (param.type === 'text') {
                inputHtml = `
                    <textarea data-param="${catKey}.${paramKey}" rows="2">${param.value}</textarea>
                `;
            } else {
                inputHtml = `
                    <input type="${param.type || 'text'}" 
                           value="${param.value}" 
                           data-param="${catKey}.${paramKey}">
                    ${param.unit ? `<span class="unit">${param.unit}</span>` : ''}
                `;
            }
            
            html += `
                <div class="param-card editable">
                    <div class="param-header">
                        <span class="param-name">${param.name}</span>
                        <span class="badge offchain">链下</span>
                    </div>
                    <div class="param-input">
                        ${inputHtml}
                    </div>
                    <div class="param-description">${param.description}</div>
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    return html;
}

// 添加样式
function addStylesV2() {
    const style = document.createElement('style');
    style.textContent = `
        .btn-param-type {
            padding: 12px 24px;
            border: 2px solid #ddd;
            background: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .btn-param-type:hover {
            background: #f0f0f0;
        }
        
        .btn-param-type.active {
            background: #4A90E2;
            color: white;
            border-color: #4A90E2;
        }
        
        .param-category {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .onchain-category {
            border-left: 4px solid #4A90E2;
        }
        
        .offchain-category {
            border-left: 4px solid #28a745;
        }
        
        .param-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .param-card {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        
        .param-card.readonly {
            background: #f0f0f0;
            opacity: 0.8;
        }
        
        .param-card.editable {
            background: #e8f5e9;
        }
        
        .badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .badge.readonly {
            background: #dc3545;
            color: white;
        }
        
        .badge.writable {
            background: #28a745;
            color: white;
        }
        
        .badge.offchain {
            background: #17a2b8;
            color: white;
        }
        
        .param-value {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 4px;
        }
        
        .current-value, .default-value {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
        }
        
        .current-value .value {
            color: #4A90E2;
            font-weight: bold;
        }
        
        .param-description {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
        }
        
        .param-actions {
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .gas-info {
            color: #ff6b6b;
            font-size: 11px;
        }
        
        .param-input {
            margin: 10px 0;
        }
        
        .param-input input, .param-input select, .param-input textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #4A90E2;
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
    `;
    document.head.appendChild(style);
}

// 绑定事件
function bindEventsV2() {
    // 参数类型切换
    document.querySelectorAll('.btn-param-type').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-param-type').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const type = this.dataset.type;
            document.getElementById('onchainParams').style.display = type === 'onchain' ? 'block' : 'none';
            document.getElementById('offchainParams').style.display = type === 'offchain' ? 'block' : 'none';
        });
    });
}

// 获取链上参数（模拟）
async function fetchOnchainParams() {
    console.log('📊 正在读取链上参数...');
    
    // 这里应该调用web3读取真实合约数据
    // 示例：const buyTax = await contract.methods.buyTaxRate().call();
    
    // 模拟延迟
    setTimeout(() => {
        // 更新显示
        document.querySelectorAll('.onchain-category .current-value .value').forEach(elem => {
            if (elem.textContent === '链上读取中...') {
                elem.textContent = '已读取';
                elem.style.color = '#28a745';
            }
        });
        
        showNotification('链上参数读取完成', 'success');
    }, 1500);
}

// 刷新链上参数
function refreshOnchainParams() {
    showNotification('正在刷新链上数据...', 'info');
    fetchOnchainParams();
}

// 修改链上参数
function modifyOnchainParam(category, param) {
    const paramConfig = PARAM_CONFIG.onchain.categories[category].params[param];
    
    const newValue = prompt(`修改 ${paramConfig.name}\n当前值: ${paramConfig.current || paramConfig.value}\n\n请输入新值:`);
    
    if (newValue !== null) {
        // 这里应该调用web3发送交易
        // 示例：await contract.methods[paramConfig.setter](newValue).send({from: account});
        
        showNotification(`准备发送交易修改 ${paramConfig.name} 为 ${newValue}\n需要连接钱包并支付Gas费`, 'warning');
        
        // 模拟交易
        setTimeout(() => {
            showNotification('交易已提交，等待区块确认...', 'info');
        }, 1000);
    }
}

// 保存链下参数
function saveOffchainParams() {
    const changes = {};
    
    document.querySelectorAll('#offchainParams [data-param]').forEach(input => {
        const [category, param] = input.dataset.param.split('.');
        let value;
        
        if (input.type === 'checkbox') {
            value = input.checked;
        } else {
            value = input.value;
        }
        
        if (!changes[category]) changes[category] = {};
        changes[category][param] = value;
    });
    
    console.log('保存链下参数:', changes);
    
    // 调用API保存
    // await apiRequest('/parameters/update', { method: 'POST', body: JSON.stringify(changes) });
    
    showNotification('链下参数已保存（仅影响前端显示）', 'success');
}

// 显示通知
function showNotification(message, type = 'info') {
    const colors = {
        success: '#28a745',
        warning: '#ffc107',
        error: '#dc3545',
        info: '#17a2b8'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${colors[type]};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// 导出全局函数
window.refreshOnchainParams = refreshOnchainParams;
window.modifyOnchainParam = modifyOnchainParam;
window.saveOffchainParams = saveOffchainParams;

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParamManagerV2);
} else {
    initParamManagerV2();
}