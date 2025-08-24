// HCF DeFi 后台管理系统JavaScript

// API基础URL
const API_BASE_URL = '/api';
const ADMIN_TOKEN = localStorage.getItem('adminToken') || '';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    loadDashboard();
});

// 初始化导航功能
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.admin-section');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetSection = this.getAttribute('data-section');
            
            // 更新按钮状态
            navBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新内容区域
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetSection).classList.add('active');
            
            // 加载对应内容
            loadSectionContent(targetSection);
        });
    });
}

// 加载对应区域内容
function loadSectionContent(section) {
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'parameters':
            loadParameters();
            break;
        case 'kyc':
            loadKYCList();
            break;
        case 'monitoring':
            loadAlerts();
            break;
        case 'analysis':
            loadAnalysis();
            break;
    }
}

// 加载仪表盘数据
async function loadDashboard() {
    try {
        // 模拟数据（实际应从API获取）
        document.getElementById('totalUsers').innerHTML = '1,234';
        document.getElementById('totalStaking').innerHTML = '5,678,900 HCF';
        document.getElementById('activeNodes').innerHTML = '89 / 99';
        
        // 实际API调用示例（需要后端支持）
        // const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
        //     headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        // });
        // const data = await response.json();
        // updateDashboard(data);
    } catch (error) {
        console.error('加载仪表盘失败:', error);
        showMessage('加载仪表盘数据失败', 'error');
    }
}

// 加载参数管理
function loadParameters() {
    // 参数管理已经有表单，这里可以加载当前值
    console.log('加载参数管理');
}

// 更新参数
async function updateParameter() {
    const key = document.getElementById('paramKey').value;
    const value = document.getElementById('paramValue').value;
    
    if (!key || !value) {
        showMessage('请选择参数并输入新值', 'error');
        return;
    }
    
    try {
        // 模拟API调用
        console.log('更新参数:', key, value);
        showMessage(`参数 ${key} 更新成功`, 'success');
        
        // 实际API调用
        // const response = await fetch(`${API_BASE_URL}/parameters/${key}`, {
        //     method: 'PUT',
        //     headers: {
        //         'Authorization': `Bearer ${ADMIN_TOKEN}`,
        //         'Content-Type': 'application/json'
        //     },
        //     body: JSON.stringify({ value })
        // });
        
        // 清空表单
        document.getElementById('paramKey').value = '';
        document.getElementById('paramValue').value = '';
    } catch (error) {
        console.error('更新参数失败:', error);
        showMessage('更新参数失败', 'error');
    }
}

// 加载KYC列表
async function loadKYCList() {
    const kycList = document.getElementById('kycList');
    kycList.innerHTML = '<div class="loading"></div> 加载中...';
    
    try {
        // 模拟数据
        setTimeout(() => {
            kycList.innerHTML = `
                <div style="width: 100%;">
                    <h3>待审核KYC申请</h3>
                    <table style="width: 100%; margin-top: 20px;">
                        <thead>
                            <tr>
                                <th>用户地址</th>
                                <th>提交时间</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>0x1234...5678</td>
                                <td>2025-08-24 10:00</td>
                                <td>待审核</td>
                                <td><button onclick="approveKYC('0x1234')">批准</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }, 1000);
    } catch (error) {
        console.error('加载KYC列表失败:', error);
        kycList.innerHTML = '加载失败';
    }
}

// 加载监控警报
async function loadAlerts() {
    const alertList = document.getElementById('alertList');
    alertList.innerHTML = '<div class="loading"></div> 加载中...';
    
    try {
        // 模拟数据
        setTimeout(() => {
            alertList.innerHTML = `
                <div style="width: 100%;">
                    <h3>系统警报</h3>
                    <div style="margin-top: 20px;">
                        <div class="message info">
                            <strong>信息:</strong> 系统运行正常，无警报
                        </div>
                    </div>
                </div>
            `;
        }, 1000);
    } catch (error) {
        console.error('加载警报失败:', error);
        alertList.innerHTML = '加载失败';
    }
}

// 加载数据分析
async function loadAnalysis() {
    const analysisCharts = document.getElementById('analysisCharts');
    analysisCharts.innerHTML = '<div class="loading"></div> 加载中...';
    
    try {
        // 模拟数据
        setTimeout(() => {
            analysisCharts.innerHTML = `
                <div style="width: 100%;">
                    <h3>数据分析</h3>
                    <div style="margin-top: 20px;">
                        <p>日活跃用户: 456</p>
                        <p>日交易量: 123,456 HCF</p>
                        <p>平均质押量: 4,567 HCF</p>
                        <p>节点在线率: 89.9%</p>
                    </div>
                </div>
            `;
        }, 1000);
    } catch (error) {
        console.error('加载分析失败:', error);
        analysisCharts.innerHTML = '加载失败';
    }
}

// 批准KYC
function approveKYC(address) {
    console.log('批准KYC:', address);
    showMessage(`KYC ${address} 已批准`, 'success');
}

// 显示消息
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    // 添加到页面顶部
    const container = document.querySelector('.admin-main');
    container.insertBefore(messageDiv, container.firstChild);
    
    // 3秒后自动移除
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// 工具函数：格式化数字
function formatNumber(num) {
    return new Intl.NumberFormat('zh-CN').format(num);
}

// 工具函数：格式化日期
function formatDate(date) {
    return new Date(date).toLocaleString('zh-CN');
}