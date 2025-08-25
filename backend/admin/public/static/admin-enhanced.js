// HCF DeFi 后台管理系统 - 增强JavaScript

// API基础URL
const API_BASE = window.location.origin + '/api';

// 检查认证
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/admin/login';
        return false;
    }
    return true;
}

// API请求封装
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/admin/login';
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('API请求失败:', error);
        showNotification('API请求失败', 'error');
        return null;
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// 格式化数字
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toLocaleString();
}

// 初始化导航
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.admin-section');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSection = btn.getAttribute('data-section');
            
            // 更新按钮状态
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 更新显示区域
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetSection) {
                    section.classList.add('active');
                    // 加载对应数据
                    loadSectionData(targetSection);
                }
            });
        });
    });
}

// 加载区块数据
async function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'parameters':
            await loadParameters();
            break;
        case 'kyc':
            await loadKYC();
            break;
        case 'monitoring':
            await loadMonitoring();
            break;
        case 'analysis':
            await loadAnalysis();
            break;
        case 'nodes':
            await loadNodes();
            break;
        case 'staking':
            await loadStaking();
            break;
        case 'ranking':
            await loadRanking();
            break;
    }
}

// 加载仪表盘数据
async function loadDashboard() {
    // 模拟数据（实际应从API获取）
    const dashboardData = {
        totalUsers: 1234,
        totalStaking: 5678900,
        activeNodes: 89,
        dailyVolume: 123456
    };
    
    // 更新统计卡片
    document.getElementById('totalUsers').innerHTML = `${formatNumber(dashboardData.totalUsers)}`;
    document.getElementById('totalStaking').innerHTML = `${formatNumber(dashboardData.totalStaking)} <span class="unit">HCF</span>`;
    document.getElementById('activeNodes').innerHTML = `${dashboardData.activeNodes} <span class="unit">/ 99</span>`;
    document.getElementById('dailyVolume').innerHTML = `${formatNumber(dashboardData.dailyVolume)} <span class="unit">HCF</span>`;
    
    // 初始化质押趋势图
    initStakingChart();
}

// 初始化质押趋势图
function initStakingChart() {
    const ctx = document.getElementById('stakingChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
            datasets: [{
                label: '质押量',
                data: [1200000, 1900000, 3000000, 5000000, 4000000, 5678900],
                borderColor: '#4A90E2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: '用户数',
                data: [300, 500, 700, 900, 1100, 1234],
                borderColor: '#7B68EE',
                backgroundColor: 'rgba(123, 104, 238, 0.1)',
                tension: 0.4,
                fill: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value) + ' HCF';
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value) + ' 用户';
                        }
                    }
                }
            }
        }
    });
}

// 参数管理
async function loadParameters() {
    // 加载参数类别
    const paramCategory = document.getElementById('paramCategory');
    const paramKey = document.getElementById('paramKey');
    
    paramCategory.addEventListener('change', (e) => {
        const category = e.target.value;
        paramKey.innerHTML = '<option value="">选择参数</option>';
        
        const params = {
            'staking': [
                { value: 'dailyYieldBase', text: '基础日化率' },
                { value: 'lpMultiplier', text: 'LP加成倍数' },
                { value: 'decayThreshold', text: '衰减阈值' }
            ],
            'tax': [
                { value: 'buyTaxRate', text: '买入税率' },
                { value: 'sellTaxRate', text: '卖出税率' },
                { value: 'transferTaxRate', text: '转账税率' }
            ],
            'referral': [
                { value: 'level1Rate', text: '一代奖励率' },
                { value: 'level2Rate', text: '二代奖励率' },
                { value: 'teamBonusRate', text: '团队奖励率' }
            ],
            'node': [
                { value: 'nodeActivationFee', text: '节点激活费用' },
                { value: 'nodeDividendRate', text: '节点分红比例' },
                { value: 'minOnlineRate', text: '最低在线率' }
            ]
        };
        
        if (params[category]) {
            params[category].forEach(param => {
                const option = document.createElement('option');
                option.value = param.value;
                option.textContent = param.text;
                paramKey.appendChild(option);
            });
        }
    });
}

// 更新参数
async function updateParameter() {
    const category = document.getElementById('paramCategory').value;
    const key = document.getElementById('paramKey').value;
    const value = document.getElementById('paramValue').value;
    const reason = document.getElementById('paramReason').value;
    
    if (!category || !key || !value || !reason) {
        showNotification('请填写所有字段', 'error');
        return;
    }
    
    // 确认对话框
    if (!confirm(`确定要更新参数 ${key} 为 ${value} 吗？`)) {
        return;
    }
    
    // 发送更新请求
    const result = await apiRequest('/parameters/update', {
        method: 'POST',
        body: JSON.stringify({
            category,
            key,
            value,
            reason
        })
    });
    
    if (result && result.success) {
        showNotification('参数更新成功', 'success');
        // 清空表单
        document.getElementById('paramValue').value = '';
        document.getElementById('paramReason').value = '';
        // 刷新历史记录
        loadParameterHistory();
    } else {
        showNotification('参数更新失败', 'error');
    }
}

// 加载参数修改历史
async function loadParameterHistory() {
    // 模拟数据
    const history = [
        {
            time: '2024-01-15 16:30',
            param: '基础日化率',
            oldValue: '0.4%',
            newValue: '0.5%',
            operator: 'admin',
            reason: '市场调整'
        }
    ];
    
    const tbody = document.getElementById('paramHistory');
    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-title">暂无修改记录</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = history.map(item => `
            <tr>
                <td>${item.time}</td>
                <td>${item.param}</td>
                <td>${item.oldValue}</td>
                <td>${item.newValue}</td>
                <td>${item.operator}</td>
                <td>${item.reason}</td>
            </tr>
        `).join('');
    }
}

// KYC审核
async function loadKYC() {
    // 加载KYC列表
    const kycData = await apiRequest('/kyc/pending');
    // 更新UI...
}

async function approveKYC(userId) {
    if (!confirm(`确定要通过用户 ${userId} 的KYC审核吗？`)) {
        return;
    }
    
    const result = await apiRequest(`/kyc/approve/${userId}`, {
        method: 'POST'
    });
    
    if (result && result.success) {
        showNotification('KYC审核已通过', 'success');
        loadKYC(); // 刷新列表
    }
}

async function rejectKYC(userId) {
    const reason = prompt('请输入拒绝原因：');
    if (!reason) return;
    
    const result = await apiRequest(`/kyc/reject/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
    
    if (result && result.success) {
        showNotification('KYC审核已拒绝', 'warning');
        loadKYC(); // 刷新列表
    }
}

// 监控警报
async function loadMonitoring() {
    // 加载警报列表
    const alerts = await apiRequest('/monitoring/alerts');
    // 更新UI...
}

// 数据分析
async function loadAnalysis() {
    // 初始化交易量图表
    const volumeCtx = document.getElementById('volumeChart');
    if (volumeCtx) {
        new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                datasets: [{
                    label: '交易量',
                    data: [120000, 190000, 300000, 500000, 200000, 300000, 400000],
                    backgroundColor: 'rgba(74, 144, 226, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return formatNumber(value) + ' HCF';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // 初始化用户增长图表
    const userCtx = document.getElementById('userChart');
    if (userCtx) {
        new Chart(userCtx, {
            type: 'doughnut',
            data: {
                labels: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
                datasets: [{
                    data: [300, 250, 200, 150, 80, 20],
                    backgroundColor: [
                        '#4A90E2',
                        '#7B68EE',
                        '#52C41A',
                        '#FAAD14',
                        '#F5222D',
                        '#722ED1'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }
}

// 节点管理
async function loadNodes() {
    const nodeData = await apiRequest('/nodes/list');
    // 更新节点列表...
}

// 质押管理
async function loadStaking() {
    // 初始化质押等级分布图
    const levelCtx = document.getElementById('stakingLevelChart');
    if (levelCtx) {
        new Chart(levelCtx, {
            type: 'pie',
            data: {
                labels: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'],
                datasets: [{
                    data: [523, 234, 156, 78, 12],
                    backgroundColor: [
                        '#4facfe',
                        '#43e97b',
                        '#fa709a',
                        '#fee140',
                        '#30cfd0'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} 用户 (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// 排名系统
async function loadRanking() {
    const rankingData = await apiRequest('/ranking/top100');
    // 更新排名列表...
}

// 退出登录
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查认证
    if (!checkAuth()) {
        return;
    }
    
    // 初始化导航
    initNavigation();
    
    // 加载初始数据
    loadDashboard();
    
    // 添加退出按钮
    const header = document.querySelector('.admin-header');
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-danger';
    logoutBtn.style.position = 'absolute';
    logoutBtn.style.right = '30px';
    logoutBtn.style.top = '20px';
    logoutBtn.innerHTML = '🚪 退出';
    logoutBtn.onclick = logout;
    header.appendChild(logoutBtn);
    
    // 定时刷新数据（每30秒）
    setInterval(() => {
        const activeSection = document.querySelector('.admin-section.active');
        if (activeSection) {
            loadSectionData(activeSection.id);
        }
    }, 30000);
});

// 添加通知样式
const style = document.createElement('style');
style.textContent = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    display: flex;
    align-items: center;
    gap: 10px;
}

.notification.success {
    background: linear-gradient(135deg, #52C41A, #73D13D);
}

.notification.error {
    background: linear-gradient(135deg, #F5222D, #FF4D4F);
}

.notification.warning {
    background: linear-gradient(135deg, #FAAD14, #FFC53D);
}

.notification.info {
    background: linear-gradient(135deg, #1890FF, #40A9FF);
}

.notification button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    margin-left: 10px;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.alert-filters {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.alert-item {
    background: white;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    border-left: 4px solid;
}

.alert-item.critical {
    border-left-color: #F5222D;
}

.alert-item.warning {
    border-left-color: #FAAD14;
}

.alert-item.info {
    border-left-color: #1890FF;
}

.alert-icon {
    font-size: 24px;
}

.alert-content {
    flex: 1;
}

.alert-content h4 {
    margin: 0 0 5px 0;
    color: #262626;
}

.alert-content p {
    margin: 0 0 5px 0;
    color: #8C8C8C;
}

.alert-content small {
    color: #BFBFBF;
    font-size: 12px;
}

.ranking-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}
`;
document.head.appendChild(style);
