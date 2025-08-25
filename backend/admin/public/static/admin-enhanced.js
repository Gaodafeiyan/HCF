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
        timeout: 10000, // 10秒超时
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        }
    };
    
    try {
        console.log(`API请求: ${API_BASE}${endpoint}`);
        
        // 创建带超时的fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), defaultOptions.timeout);
        
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...defaultOptions,
            ...options,
            signal: controller.signal,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        clearTimeout(timeoutId);
        
        console.log(`API响应状态: ${response.status}`);
        
        if (response.status === 401) {
            console.log('认证失败，清除token并跳转登录');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            window.location.href = '/admin/login';
            return null;
        }
        
        if (!response.ok) {
            console.error(`API错误: ${response.status} ${response.statusText}`);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`API响应数据:`, data);
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('API请求超时:', endpoint);
            showNotification('请求超时，请检查网络连接', 'error');
        } else {
            console.error('API请求失败:', endpoint, error);
            showNotification(`API请求失败: ${error.message}`, 'error');
        }
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
    console.log('开始加载仪表盘数据...');
    
    // 立即显示加载中状态，清除转圈圈
    document.getElementById('totalUsers').innerHTML = `<span class="loading-text">加载中...</span>`;
    document.getElementById('totalStaking').innerHTML = `<span class="loading-text">加载中...</span>`;
    document.getElementById('activeNodes').innerHTML = `<span class="loading-text">加载中...</span>`;
    document.getElementById('dailyVolume').innerHTML = `<span class="loading-text">加载中...</span>`;
    
    try {
        // 尝试从API获取真实数据
        console.log('请求API: /operational/dashboard');
        const dashboardData = await apiRequest('/operational/dashboard');
        console.log('API响应:', dashboardData);
        
        if (dashboardData && dashboardData.success) {
            // 使用API数据
            const data = dashboardData.data;
            document.getElementById('totalUsers').innerHTML = `${formatNumber(data.totalUsers || 0)}`;
            document.getElementById('totalStaking').innerHTML = `${formatNumber(data.totalStaking || 0)} <span class="unit">HCF</span>`;
            document.getElementById('activeNodes').innerHTML = `${data.activeNodes || 0} <span class="unit">/ ${data.maxNodes || 99}</span>`;
            if (document.getElementById('dailyVolume')) {
                document.getElementById('dailyVolume').innerHTML = `${formatNumber(data.dailyVolume || 0)} <span class="unit">HCF</span>`;
            }
            console.log('使用API数据渲染完成');
        } else {
            console.log('API数据无效，使用后备数据');
            // 后备模拟数据
            document.getElementById('totalUsers').innerHTML = `${formatNumber(1234)}`;
            document.getElementById('totalStaking').innerHTML = `${formatNumber(5678900)} <span class="unit">HCF</span>`;
            document.getElementById('activeNodes').innerHTML = `89 <span class="unit">/ 99</span>`;
            if (document.getElementById('dailyVolume')) {
                document.getElementById('dailyVolume').innerHTML = `${formatNumber(123456)} <span class="unit">HCF</span>`;
            }
        }
        
        // 初始化质押趋势图
        initStakingChart();
    } catch (error) {
        console.error('加载仪表盘失败:', error);
        showNotification('加载仪表盘数据失败，使用演示数据', 'warning');
        
        // 后备数据
        document.getElementById('totalUsers').innerHTML = `${formatNumber(1234)}`;
        document.getElementById('totalStaking').innerHTML = `${formatNumber(5678900)} <span class="unit">HCF</span>`;
        document.getElementById('activeNodes').innerHTML = `89 <span class="unit">/ 99</span>`;
        if (document.getElementById('dailyVolume')) {
            document.getElementById('dailyVolume').innerHTML = `${formatNumber(123456)} <span class="unit">HCF</span>`;
        }
        
        initStakingChart();
    }
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
    try {
        // 加载KYC统计数据
        const statsData = await apiRequest('/kyc/stats/overview');
        if (statsData && statsData.success) {
            const stats = statsData.data.overview;
            document.querySelector('.kyc-stats .stat-card:nth-child(1) p').textContent = stats.kycPending;
            document.querySelector('.kyc-stats .stat-card:nth-child(2) p').textContent = stats.kycVerified;
            document.querySelector('.kyc-stats .stat-card:nth-child(3) p').textContent = stats.kycRejected;
        }
        
        // 加载待审核KYC列表
        const pendingData = await apiRequest('/kyc/pending?limit=20');
        const kycList = document.getElementById('kycList');
        
        if (pendingData && pendingData.success && pendingData.data.users.length > 0) {
            const users = pendingData.data.users;
            kycList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.id.substring(0, 8)}...</td>
                    <td title="${user.walletAddress}">${user.walletAddress.substring(0, 10)}...${user.walletAddress.substring(-4)}</td>
                    <td>${user.idType || '未知'}</td>
                    <td>${new Date(user.submittedAt).toLocaleString('zh-CN')}</td>
                    <td><span class="status-badge pending">待审核</span></td>
                    <td>
                        <button class="btn-success" onclick="viewKYCDetails('${user.id}')">查看</button>
                        <button class="btn-success" onclick="approveKYC('${user.id}')">通过</button>
                        <button class="btn-danger" onclick="rejectKYC('${user.id}')">拒绝</button>
                    </td>
                </tr>
            `).join('');
        } else {
            kycList.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-state-icon">📄</div>
                        <div class="empty-state-title">暂无待审核的KYC申请</div>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('加载KYC数据失败:', error);
        showNotification('加载KYC数据失败', 'error');
    }
}

// 查看KYC详情
async function viewKYCDetails(userId) {
    try {
        const data = await apiRequest(`/kyc/${userId}`);
        if (data && data.success) {
            const user = data.data;
            const modal = createKYCModal(user);
            document.body.appendChild(modal);
        }
    } catch (error) {
        console.error('获取KYC详情失败:', error);
        showNotification('获取KYC详情失败', 'error');
    }
}

// 创建KYC详情模态框
function createKYCModal(user) {
    const modal = document.createElement('div');
    modal.className = 'kyc-modal-overlay';
    modal.innerHTML = `
        <div class="kyc-modal">
            <div class="kyc-modal-header">
                <h3>KYC详情审核</h3>
                <button class="close-btn" onclick="this.closest('.kyc-modal-overlay').remove()">×</button>
            </div>
            <div class="kyc-modal-content">
                <div class="kyc-user-info">
                    <h4>用户信息</h4>
                    <p><strong>用户ID:</strong> ${user.id}</p>
                    <p><strong>钱包地址:</strong> ${user.walletAddress}</p>
                    <p><strong>用户名:</strong> ${user.username || '未设置'}</p>
                    <p><strong>注册时间:</strong> ${new Date(user.registeredAt).toLocaleString('zh-CN')}</p>
                </div>
                
                ${user.kycDocuments ? `
                <div class="kyc-documents">
                    <h4>KYC文档</h4>
                    <p><strong>证件类型:</strong> ${user.kycDocuments.idType || '未知'}</p>
                    <p><strong>证件号码:</strong> ${user.kycDocuments.idNumber || '未提供'}</p>
                    <p><strong>提交时间:</strong> ${new Date(user.kycDocuments.uploadedAt).toLocaleString('zh-CN')}</p>
                    ${user.kycDocuments.documentUrl ? `
                        <div class="document-preview">
                            <p><strong>上传文档:</strong></p>
                            <img src="${user.kycDocuments.documentUrl}" alt="KYC文档" style="max-width: 300px; max-height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                    ` : '<p>暂无文档</p>'}
                </div>
                ` : '<p>用户未提交KYC申请</p>'}
                
                <div class="kyc-actions">
                    <button class="btn-success" onclick="approveKYCFromModal('${user.id}')">
                        ✅ 通过审核
                    </button>
                    <button class="btn-danger" onclick="rejectKYCFromModal('${user.id}')">
                        ❌ 拒绝审核
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    return modal;
}

async function approveKYC(userId) {
    if (!confirm(`确定要通过此用户的KYC审核吗？`)) {
        return;
    }
    
    try {
        const result = await apiRequest(`/kyc/${userId}/approve`, {
            method: 'POST',
            body: JSON.stringify({
                notes: '管理员审核通过'
            })
        });
        
        if (result && result.success) {
            showNotification('KYC审核已通过', 'success');
            loadKYC(); // 刷新列表
        } else {
            showNotification(result?.error || 'KYC审核失败', 'error');
        }
    } catch (error) {
        console.error('KYC审核失败:', error);
        showNotification('KYC审核操作失败', 'error');
    }
}

async function rejectKYC(userId) {
    const reason = prompt('请输入拒绝原因：');
    if (!reason || reason.trim() === '') return;
    
    try {
        const result = await apiRequest(`/kyc/${userId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() })
        });
        
        if (result && result.success) {
            showNotification('KYC审核已拒绝', 'warning');
            loadKYC(); // 刷新列表
        } else {
            showNotification(result?.error || 'KYC拒绝失败', 'error');
        }
    } catch (error) {
        console.error('KYC拒绝失败:', error);
        showNotification('KYC拒绝操作失败', 'error');
    }
}

// 从模态框中审核KYC
async function approveKYCFromModal(userId) {
    const notes = prompt('请输入审核备注（可选）：') || '管理员审核通过';
    
    if (!confirm('确定要通过此用户的KYC审核吗？')) {
        return;
    }
    
    try {
        const result = await apiRequest(`/kyc/${userId}/approve`, {
            method: 'POST',
            body: JSON.stringify({ notes })
        });
        
        if (result && result.success) {
            showNotification('KYC审核已通过', 'success');
            document.querySelector('.kyc-modal-overlay')?.remove();
            loadKYC(); // 刷新列表
        } else {
            showNotification(result?.error || 'KYC审核失败', 'error');
        }
    } catch (error) {
        console.error('KYC审核失败:', error);
        showNotification('KYC审核操作失败', 'error');
    }
}

async function rejectKYCFromModal(userId) {
    const reason = prompt('请输入拒绝原因：');
    if (!reason || reason.trim() === '') return;
    
    if (!confirm('确定要拒绝此用户的KYC审核吗？')) {
        return;
    }
    
    try {
        const result = await apiRequest(`/kyc/${userId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() })
        });
        
        if (result && result.success) {
            showNotification('KYC审核已拒绝', 'warning');
            document.querySelector('.kyc-modal-overlay')?.remove();
            loadKYC(); // 刷新列表
        } else {
            showNotification(result?.error || 'KYC拒绝失败', 'error');
        }
    } catch (error) {
        console.error('KYC拒绝失败:', error);
        showNotification('KYC拒绝操作失败', 'error');
    }
}

// 监控警报
async function loadMonitoring() {
    try {
        // 加载监控统计
        const statsData = await apiRequest('/operational/monitoring/stats');
        if (statsData && statsData.success) {
            const stats = statsData.data;
            
            // 更新过滤器按钮的数量
            const redBtn = document.querySelector('.alert-filters .btn-danger');
            const yellowBtn = document.querySelector('.alert-filters .btn-warning');
            const blueBtn = document.querySelector('.alert-filters .btn-primary');
            
            const redCount = stats.levelStats.find(s => s._id === 'red')?.unresolved || 0;
            const yellowCount = stats.levelStats.find(s => s._id === 'yellow')?.unresolved || 0;
            const blueCount = stats.levelStats.find(s => s._id === 'green')?.unresolved || 0;
            
            if (redBtn) redBtn.innerHTML = `🔴 严重 (${redCount})`;
            if (yellowBtn) yellowBtn.innerHTML = `🟡 警告 (${yellowCount})`;
            if (blueBtn) blueBtn.innerHTML = `🔵 信息 (${blueCount})`;
        }
        
        // 加载警报列表
        const alertsData = await apiRequest('/operational/monitoring/alerts?resolved=false&limit=10');
        const alertList = document.getElementById('alertList');
        
        if (alertsData && alertsData.success && alertsData.data.alerts.length > 0) {
            const alerts = alertsData.data.alerts;
            
            alertList.innerHTML = alerts.map(alert => {
                const levelClass = alert.level === 'red' ? 'critical' : 
                                 alert.level === 'yellow' ? 'warning' : 'info';
                const icon = alert.level === 'red' ? '🚨' : 
                           alert.level === 'yellow' ? '⚠️' : 'ℹ️';
                
                return `
                    <div class="alert-item ${levelClass}">
                        <span class="alert-icon">${icon}</span>
                        <div class="alert-content">
                            <h4>${alert.title}</h4>
                            <p>${alert.message}</p>
                            <small>${new Date(alert.timestamp).toLocaleString('zh-CN')}</small>
                        </div>
                        <button class="btn-primary" onclick="resolveAlert('${alert._id}')">处理</button>
                    </div>
                `;
            }).join('');
            
            // 添加查看更多按钮
            alertList.innerHTML += `
                <div class="alert-actions">
                    <button class="btn-secondary" onclick="loadMoreAlerts()">查看全部警报</button>
                    <button class="btn-warning" onclick="createTestAlert()">创建测试警报</button>
                </div>
            `;
        } else {
            alertList.innerHTML = `
                <div class="alert-empty">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">系统运行正常</div>
                    <div class="empty-state-subtitle">当前没有未处理的警报</div>
                    <button class="btn-warning" onclick="createTestAlert()" style="margin-top: 15px;">创建测试警报</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载监控数据失败:', error);
        showNotification('加载监控数据失败', 'error');
        
        // 显示错误状态
        const alertList = document.getElementById('alertList');
        alertList.innerHTML = `
            <div class="alert-error">
                <div class="empty-state-icon">❌</div>
                <div class="empty-state-title">加载失败</div>
                <div class="empty-state-subtitle">无法加载监控数据，请检查网络连接</div>
                <button class="btn-primary" onclick="loadMonitoring()" style="margin-top: 15px;">重试</button>
            </div>
        `;
    }
}

// 处理警报
async function resolveAlert(alertId) {
    const actionTaken = prompt('请输入处理措施：');
    if (!actionTaken || actionTaken.trim() === '') return;
    
    try {
        const result = await apiRequest(`/operational/monitoring/alerts/${alertId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
                actionTaken: actionTaken.trim()
            })
        });
        
        if (result && result.success) {
            showNotification('警报已处理', 'success');
            loadMonitoring(); // 刷新列表
        } else {
            showNotification(result?.error || '处理警报失败', 'error');
        }
    } catch (error) {
        console.error('处理警报失败:', error);
        showNotification('处理警报失败', 'error');
    }
}

// 创建测试警报
async function createTestAlert() {
    const types = ['system_alert', 'price_alert', 'stake_alert', 'referral_alert', 'node_alert'];
    const levels = ['red', 'yellow', 'green'];
    
    const type = types[Math.floor(Math.random() * types.length)];
    const level = levels[Math.floor(Math.random() * levels.length)];
    
    const testAlerts = {
        system_alert: {
            title: '系统性能警告',
            message: 'CPU使用率超过80%，请检查系统负载'
        },
        price_alert: {
            title: '价格异常波动',
            message: 'HCF代币价格在5分钟内波动超过10%'
        },
        stake_alert: {
            title: '质押池警告',
            message: '质押池资金不足，可能影响分红发放'
        },
        referral_alert: {
            title: '推荐异常',
            message: '检测到疑似推荐作弊行为'
        },
        node_alert: {
            title: '节点离线',
            message: '节点#001已离线超过10分钟'
        }
    };
    
    const alertConfig = testAlerts[type as keyof typeof testAlerts];
    
    try {
        const result = await apiRequest('/operational/monitoring/alerts/test', {
            method: 'POST',
            body: JSON.stringify({
                type,
                level,
                title: alertConfig.title,
                message: alertConfig.message
            })
        });
        
        if (result && result.success) {
            showNotification('测试警报已创建', 'success');
            loadMonitoring(); // 刷新列表
        } else {
            showNotification(result?.error || '创建测试警报失败', 'error');
        }
    } catch (error) {
        console.error('创建测试警报失败:', error);
        showNotification('创建测试警报失败', 'error');
    }
}

// 加载更多警报
async function loadMoreAlerts() {
    try {
        const alertsData = await apiRequest('/operational/monitoring/alerts?limit=50');
        if (alertsData && alertsData.success) {
            const modal = createAlertsModal(alertsData.data.alerts);
            document.body.appendChild(modal);
        }
    } catch (error) {
        console.error('加载警报列表失败:', error);
        showNotification('加载警报列表失败', 'error');
    }
}

// 创建警报列表模态框
function createAlertsModal(alerts) {
    const modal = document.createElement('div');
    modal.className = 'alerts-modal-overlay';
    modal.innerHTML = `
        <div class="alerts-modal">
            <div class="alerts-modal-header">
                <h3>系统警报列表</h3>
                <button class="close-btn" onclick="this.closest('.alerts-modal-overlay').remove()">×</button>
            </div>
            <div class="alerts-modal-content">
                ${alerts.length > 0 ? `
                    <div class="alerts-list">
                        ${alerts.map(alert => `
                            <div class="alert-row ${alert.resolved ? 'resolved' : 'pending'}">
                                <div class="alert-info">
                                    <div class="alert-header">
                                        <span class="alert-level ${alert.level}">${alert.level.toUpperCase()}</span>
                                        <span class="alert-type">${alert.type}</span>
                                        <span class="alert-time">${new Date(alert.timestamp).toLocaleString('zh-CN')}</span>
                                    </div>
                                    <h4>${alert.title}</h4>
                                    <p>${alert.message}</p>
                                    ${alert.resolved ? `
                                        <div class="resolution-info">
                                            <small>✅ 已处理 by ${alert.resolvedBy} - ${alert.actionTaken || '无备注'}</small>
                                        </div>
                                    ` : ''}
                                </div>
                                ${!alert.resolved ? `
                                    <div class="alert-actions">
                                        <button class="btn-success btn-sm" onclick="resolveAlertFromModal('${alert._id}')">处理</button>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-title">暂无警报记录</div>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    return modal;
}

// 从模态框处理警报
async function resolveAlertFromModal(alertId) {
    const actionTaken = prompt('请输入处理措施：');
    if (!actionTaken || actionTaken.trim() === '') return;
    
    try {
        const result = await apiRequest(`/operational/monitoring/alerts/${alertId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
                actionTaken: actionTaken.trim()
            })
        });
        
        if (result && result.success) {
            showNotification('警报已处理', 'success');
            document.querySelector('.alerts-modal-overlay')?.remove();
            loadMonitoring(); // 刷新主页列表
        } else {
            showNotification(result?.error || '处理警报失败', 'error');
        }
    } catch (error) {
        console.error('处理警报失败:', error);
        showNotification('处理警报失败', 'error');
    }
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

// KYC工具函数
function refreshKYCList() {
    showNotification('正在刷新KYC列表...', 'info');
    loadKYC();
}

function exportKYCData() {
    showNotification('KYC数据导出功能开发中...', 'warning');
    // TODO: 实现导出功能
}

// 搜索和过滤功能
function initSearchAndFilter() {
    const kycSearch = document.getElementById('kycSearch');
    const kycStatusFilter = document.getElementById('kycStatusFilter');
    
    if (kycSearch) {
        kycSearch.addEventListener('input', debounce((e) => {
            filterKYCList(e.target.value, kycStatusFilter?.value || '');
        }, 300));
    }
    
    if (kycStatusFilter) {
        kycStatusFilter.addEventListener('change', (e) => {
            filterKYCList(kycSearch?.value || '', e.target.value);
        });
    }
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 过滤KYC列表
function filterKYCList(searchTerm, statusFilter) {
    // TODO: 实现基于搜索词和状态的过滤
    console.log('Filter KYC list:', searchTerm, statusFilter);
    showNotification(`搜索: "${searchTerm}" | 状态: "${statusFilter || '全部'}"`, 'info');
}

// 数字动画效果
function animateNumber(element, start, end, duration) {
    if (!element) return;
    
    const startTimestamp = performance.now();
    const step = (timestamp) => {
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        element.textContent = formatNumber(current);
        
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(step);
}

// 增强的数字格式化
function formatNumberWithUnit(num, unit = '') {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B' + unit;
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M' + unit;
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K' + unit;
    }
    return num.toLocaleString() + unit;
}

// 复制到剪贴板
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('已复制到剪贴板', 'success');
    } catch (err) {
        // 回退方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('已复制到剪贴板', 'success');
        } catch (fallbackErr) {
            showNotification('复制失败', 'error');
        }
        document.body.removeChild(textArea);
    }
}

// 主题切换功能
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    showNotification(`已切换到${newTheme === 'dark' ? '暗色' : '亮色'}模式`, 'info');
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 
                      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// 键盘快捷键
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: 全局搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Ctrl/Cmd + R: 刷新当前页面数据
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            const activeSection = document.querySelector('.admin-section.active');
            if (activeSection) {
                loadSectionData(activeSection.id);
                showNotification('数据已刷新', 'success');
            }
        }
        
        // ESC: 关闭模态框
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.kyc-modal-overlay, .alerts-modal-overlay');
            modals.forEach(modal => modal.remove());
        }
    });
}

// 实时时间显示
function initClock() {
    const updateClock = () => {
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // 如果有时钟元素就更新它
        const clockElement = document.getElementById('realTimeClock');
        if (clockElement) {
            clockElement.textContent = timeString;
        }
    };
    
    updateClock();
    setInterval(updateClock, 1000);
}

// 性能监控
function initPerformanceMonitoring() {
    // 监控页面加载时间
    window.addEventListener('load', () => {
        const loadTime = performance.now();
        console.log(`页面加载耗时: ${loadTime.toFixed(2)}ms`);
        
        if (loadTime > 3000) {
            showNotification('页面加载较慢，请检查网络连接', 'warning');
        }
    });
    
    // 监控API响应时间
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const start = performance.now();
        const response = await originalFetch(...args);
        const duration = performance.now() - start;
        
        if (duration > 2000) {
            showNotification(`API响应较慢: ${duration.toFixed(0)}ms`, 'warning');
        }
        
        return response;
    };
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查认证
    if (!checkAuth()) {
        return;
    }
    
    // 初始化各种功能
    initTheme();
    initNavigation();
    initSearchAndFilter();
    initKeyboardShortcuts();
    initClock();
    initPerformanceMonitoring();
    
    // 加载初始数据
    loadDashboard();
    
    // 添加退出按钮和主题切换
    const header = document.querySelector('.admin-header');
    
    // 主题切换按钮
    const themeBtn = document.createElement('button');
    themeBtn.className = 'btn-secondary';
    themeBtn.style.position = 'absolute';
    themeBtn.style.right = '120px';
    themeBtn.style.top = '20px';
    themeBtn.innerHTML = '🌙';
    themeBtn.onclick = toggleTheme;
    header.appendChild(themeBtn);
    
    // 退出按钮
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-danger';
    logoutBtn.style.position = 'absolute';
    logoutBtn.style.right = '30px';
    logoutBtn.style.top = '20px';
    logoutBtn.innerHTML = '🚪 退出';
    logoutBtn.onclick = logout;
    header.appendChild(logoutBtn);
    
    // 添加实时时钟
    const clockDiv = document.createElement('div');
    clockDiv.id = 'realTimeClock';
    clockDiv.style.position = 'absolute';
    clockDiv.style.right = '30px';
    clockDiv.style.bottom = '20px';
    clockDiv.style.color = 'var(--text-secondary)';
    clockDiv.style.fontSize = '12px';
    header.appendChild(clockDiv);
    
    // 定时刷新数据（每30秒）
    setInterval(() => {
        const activeSection = document.querySelector('.admin-section.active');
        if (activeSection) {
            loadSectionData(activeSection.id);
        }
    }, 30000);
    
    // 显示欢迎消息
    const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
    if (user.username) {
        setTimeout(() => {
            showNotification(`欢迎回来，${user.username}！`, 'success');
        }, 1000);
    }
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

/* KYC模态框样式 */
.kyc-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
}

.kyc-modal {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: slideUp 0.3s ease;
}

.kyc-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 25px;
    border-bottom: 1px solid #eee;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px 12px 0 0;
}

.kyc-modal-header h3 {
    margin: 0;
    font-size: 1.5rem;
}

.close-btn {
    background: none;
    border: none;
    font-size: 24px;
    color: white;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.3s;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.kyc-modal-content {
    padding: 25px;
}

.kyc-user-info, .kyc-documents {
    margin-bottom: 25px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #4A90E2;
}

.kyc-user-info h4, .kyc-documents h4 {
    margin: 0 0 15px 0;
    color: #2c3e50;
    font-size: 1.2rem;
}

.kyc-user-info p, .kyc-documents p {
    margin: 8px 0;
    color: #5a6c7d;
    line-height: 1.5;
}

.kyc-user-info strong, .kyc-documents strong {
    color: #2c3e50;
    font-weight: 600;
}

.document-preview {
    margin-top: 15px;
    text-align: center;
}

.document-preview img {
    display: block;
    margin: 10px auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.kyc-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
    padding-top: 20px;
    border-top: 1px solid #eee;
}

.kyc-actions button {
    padding: 12px 25px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
}

.kyc-actions .btn-success {
    background: linear-gradient(135deg, #52C41A, #73D13D);
    color: white;
}

.kyc-actions .btn-danger {
    background: linear-gradient(135deg, #F5222D, #FF4D4F);
    color: white;
}

.kyc-actions button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { 
        opacity: 0;
        transform: translateY(30px);
    }
    to { 
        opacity: 1;
        transform: translateY(0);
    }
}

/* 警报模态框样式 */
.alerts-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
}

.alerts-modal {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: slideUp 0.3s ease;
}

.alerts-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 25px;
    border-bottom: 1px solid #eee;
    background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%);
    color: white;
    border-radius: 12px 12px 0 0;
}

.alerts-modal-content {
    padding: 25px;
    max-height: 60vh;
    overflow-y: auto;
}

.alerts-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.alert-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #eee;
    transition: all 0.3s ease;
}

.alert-row.pending {
    background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%);
    border-left: 4px solid #FF6B6B;
}

.alert-row.resolved {
    background: linear-gradient(135deg, #f8f9fa 0%, #e8f5e8 100%);
    border-left: 4px solid #52C41A;
    opacity: 0.7;
}

.alert-info {
    flex: 1;
    margin-right: 15px;
}

.alert-header {
    display: flex;
    gap: 15px;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
}

.alert-level {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
}

.alert-level.red {
    background: #F5222D;
    color: white;
}

.alert-level.yellow {
    background: #FAAD14;
    color: white;
}

.alert-level.green {
    background: #52C41A;
    color: white;
}

.alert-type {
    background: #e6f7ff;
    color: #1890ff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
}

.alert-time {
    color: #8C8C8C;
    font-size: 12px;
}

.alert-row h4 {
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 16px;
}

.alert-row p {
    margin: 0 0 8px 0;
    color: #5a6c7d;
    line-height: 1.4;
}

.resolution-info {
    margin-top: 10px;
    padding: 8px;
    background: #e8f5e8;
    border-radius: 4px;
}

.resolution-info small {
    color: #52C41A;
    font-weight: 500;
}

.alert-actions .btn-sm {
    padding: 8px 16px;
    font-size: 14px;
}

.alert-empty, .alert-error {
    text-align: center;
    padding: 40px 20px;
    color: #8C8C8C;
}

.alert-empty .empty-state-icon,
.alert-error .empty-state-icon {
    font-size: 48px;
    margin-bottom: 15px;
}

.alert-empty .empty-state-title,
.alert-error .empty-state-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #2c3e50;
}

.alert-empty .empty-state-subtitle,
.alert-error .empty-state-subtitle {
    font-size: 14px;
    color: #8C8C8C;
}

.alert-actions {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #eee;
}

.btn-secondary {
    background: linear-gradient(135deg, #6c757d, #5a6268);
    color: white;
    padding: 12px 25px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn-secondary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
`;
document.head.appendChild(style);
