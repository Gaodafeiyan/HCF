// HCF DeFi 前端应用
// 负责处理用户与智能合约的所有交互

// 合约地址配置
const CONTRACTS = {
    HCFToken: '0x...', // HCF代币合约地址
    HCFStaking: '0x...', // 质押合约地址
    HCFReferral: '0x...', // 推荐合约地址
    HCFNodeNFT: '0x...', // 节点NFT合约地址
    HCFBSDTExchange: '0x...', // HCF-BSDT兑换合约地址
    BSDTToken: '0x...', // BSDT代币合约地址
    PancakeRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E' // PancakeSwap路由
};

// 合约ABI（简化版，实际使用时需要完整ABI）
const ABI = {
    HCFToken: [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
    ],
    HCFStaking: [
        "function stake(uint256 poolId, uint256 amount) returns (bool)",
        "function withdraw(uint256 poolId, uint256 amount) returns (bool)",
        "function claimRewards() returns (bool)",
        "function getUserStakeInfo(address user, uint256 poolId) view returns (uint256 amount, uint256 rewards)",
        "function getPendingRewards(address user) view returns (uint256)"
    ],
    HCFReferral: [
        "function bindReferrer(address referrer) returns (bool)",
        "function getReferrer(address user) view returns (address)",
        "function getTeamInfo(address user) view returns (uint256 directCount, uint256 teamSize, uint256 level)"
    ],
    HCFNodeNFT: [
        "function applyForNode() payable returns (uint256)",
        "function activateNode(uint256 nodeId) returns (bool)",
        "function claimNodeRewards() returns (bool)",
        "function getNodeInfo(uint256 nodeId) view returns (address owner, bool isActive, uint256 power)",
        "function totalNodes() view returns (uint256)",
        "function maxNodes() view returns (uint256)"
    ]
};

// 全局变量
let web3;
let userAccount;
let contracts = {};
let selectedPool = 0;

// 初始化Web3
async function initWeb3() {
    if (typeof window.ethereum !== 'undefined') {
        web3 = new Web3(window.ethereum);
        
        // 监听账户变化
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        
        // 监听网络变化
        window.ethereum.on('chainChanged', handleChainChanged);
        
        return true;
    } else {
        alert('请安装MetaMask钱包！');
        return false;
    }
}

// 连接钱包
async function connectWallet() {
    if (!await initWeb3()) return;
    
    try {
        // 请求用户授权
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
            userAccount = accounts[0];
            
            // 检查网络
            const chainId = await web3.eth.getChainId();
            if (chainId !== 56) { // BSC主网
                await switchToBSC();
            }
            
            // 初始化合约实例
            initContracts();
            
            // 更新UI
            updateWalletUI();
            
            // 加载用户数据
            loadUserData();
        }
    } catch (error) {
        console.error('连接钱包失败:', error);
        alert('连接钱包失败: ' + error.message);
    }
}

// 切换到BSC网络
async function switchToBSC() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }] // BSC主网 chainId
        });
    } catch (switchError) {
        // 如果网络不存在，添加网络
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x38',
                        chainName: 'Binance Smart Chain',
                        nativeCurrency: {
                            name: 'BNB',
                            symbol: 'BNB',
                            decimals: 18
                        },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com/']
                    }]
                });
            } catch (addError) {
                console.error('添加BSC网络失败:', addError);
            }
        }
    }
}

// 初始化合约实例
function initContracts() {
    // 这里需要实际的合约ABI
    // contracts.HCFToken = new web3.eth.Contract(ABI.HCFToken, CONTRACTS.HCFToken);
    // contracts.HCFStaking = new web3.eth.Contract(ABI.HCFStaking, CONTRACTS.HCFStaking);
    // contracts.HCFReferral = new web3.eth.Contract(ABI.HCFReferral, CONTRACTS.HCFReferral);
    // contracts.HCFNodeNFT = new web3.eth.Contract(ABI.HCFNodeNFT, CONTRACTS.HCFNodeNFT);
    
    console.log('合约初始化完成');
}

// 更新钱包UI
function updateWalletUI() {
    const connectBtn = document.getElementById('connectWallet');
    const networkBadge = document.getElementById('networkBadge');
    const networkName = document.getElementById('networkName');
    
    if (userAccount) {
        connectBtn.textContent = userAccount.substring(0, 6) + '...' + userAccount.substring(38);
        networkBadge.classList.add('connected');
        networkName.textContent = 'BSC主网';
        
        // 生成推荐链接
        const referralLink = `${window.location.origin}?ref=${userAccount}`;
        document.getElementById('myReferralLink').value = referralLink;
    }
}

// 加载用户数据
async function loadUserData() {
    if (!userAccount) return;
    
    try {
        // 获取余额
        const bnbBalance = await web3.eth.getBalance(userAccount);
        console.log('BNB余额:', web3.utils.fromWei(bnbBalance, 'ether'));
        
        // 获取HCF余额（需要合约实例）
        // const hcfBalance = await contracts.HCFToken.methods.balanceOf(userAccount).call();
        // document.getElementById('hcfBalance').textContent = formatNumber(hcfBalance);
        
        // 获取质押信息
        // const stakingInfo = await contracts.HCFStaking.methods.getUserStakeInfo(userAccount, selectedPool).call();
        // document.getElementById('totalStaked').textContent = formatNumber(stakingInfo.amount);
        
        // 获取待领收益
        // const pendingRewards = await contracts.HCFStaking.methods.getPendingRewards(userAccount).call();
        // document.getElementById('pendingRewards').textContent = formatNumber(pendingRewards);
        
        // 获取推荐信息
        // const teamInfo = await contracts.HCFReferral.methods.getTeamInfo(userAccount).call();
        // document.getElementById('directReferrals').textContent = teamInfo.directCount;
        // document.getElementById('teamSize').textContent = teamInfo.teamSize;
        // document.getElementById('teamLevel').textContent = 'V' + teamInfo.level;
        
        // 模拟数据（实际需要从合约读取）
        document.getElementById('hcfBalance').textContent = '1,234.56';
        document.getElementById('bsdtBalance').textContent = '567.89';
        document.getElementById('totalStaked').textContent = '10,000.00';
        document.getElementById('pendingRewards').textContent = '45.67';
        
    } catch (error) {
        console.error('加载用户数据失败:', error);
    }
}

// 质押功能
async function stake() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    const amount = document.getElementById('stakeAmount').value;
    if (!amount || amount <= 0) {
        alert('请输入有效的质押数量');
        return;
    }
    
    try {
        // 检查授权
        // const allowance = await contracts.HCFToken.methods.allowance(userAccount, CONTRACTS.HCFStaking).call();
        // if (allowance < amount) {
        //     await contracts.HCFToken.methods.approve(CONTRACTS.HCFStaking, amount).send({ from: userAccount });
        // }
        
        // 执行质押
        // await contracts.HCFStaking.methods.stake(selectedPool, amount).send({ from: userAccount });
        
        alert(`质押 ${amount} HCF 到 Level ${selectedPool} 池成功！`);
        loadUserData();
    } catch (error) {
        console.error('质押失败:', error);
        alert('质押失败: ' + error.message);
    }
}

// 领取收益
async function claimRewards() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    try {
        // await contracts.HCFStaking.methods.claimRewards().send({ from: userAccount });
        alert('领取收益成功！');
        loadUserData();
    } catch (error) {
        console.error('领取收益失败:', error);
        alert('领取收益失败: ' + error.message);
    }
}

// 绑定推荐人
async function bindReferrer() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    const referrerAddress = document.getElementById('referrerAddress').value;
    if (!web3.utils.isAddress(referrerAddress)) {
        alert('请输入有效的推荐人地址');
        return;
    }
    
    try {
        // await contracts.HCFReferral.methods.bindReferrer(referrerAddress).send({ from: userAccount });
        alert('绑定推荐人成功！');
        loadUserData();
    } catch (error) {
        console.error('绑定推荐人失败:', error);
        alert('绑定推荐人失败: ' + error.message);
    }
}

// 申请节点
async function applyForNode() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    try {
        // 检查BSDT余额和授权
        // const bsdtBalance = await contracts.BSDTToken.methods.balanceOf(userAccount).call();
        // if (bsdtBalance < 5000) {
        //     alert('BSDT余额不足，需要5000 BSDT');
        //     return;
        // }
        
        // await contracts.HCFNodeNFT.methods.applyForNode().send({ from: userAccount });
        alert('申请节点成功！');
        loadUserData();
    } catch (error) {
        console.error('申请节点失败:', error);
        alert('申请节点失败: ' + error.message);
    }
}

// 激活节点
async function activateNode() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    try {
        // 需要检查HCF和LP余额
        alert('激活节点需要1000 HCF + 1000 LP，请确保余额充足');
        // await contracts.HCFNodeNFT.methods.activateNode(nodeId).send({ from: userAccount });
        loadUserData();
    } catch (error) {
        console.error('激活节点失败:', error);
        alert('激活节点失败: ' + error.message);
    }
}

// 选择质押池
function selectPool(poolId) {
    selectedPool = poolId;
    document.querySelectorAll('.pool-item').forEach((item, index) => {
        if (index === poolId) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// 切换兑换标签
function switchSwapTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const swapContent = document.getElementById('swapContent');
    
    if (tab === 'buy') {
        swapContent.innerHTML = `
            <div class="info-box">
                买入税率: 2% | 卖出税率: 5% | 转账税率: 1%
            </div>
            <div class="input-group">
                <label>支付数量 (BNB)</label>
                <input type="number" id="swapAmount" placeholder="0.0" step="0.01">
            </div>
            <div class="input-group">
                <label>预计获得 (HCF)</label>
                <input type="number" id="receiveAmount" placeholder="0.0" readonly>
            </div>
            <button class="btn-primary" onclick="executeSwap()">确认买入</button>
        `;
    } else if (tab === 'sell') {
        swapContent.innerHTML = `
            <div class="info-box">
                买入税率: 2% | 卖出税率: 5% | 转账税率: 1%
            </div>
            <div class="input-group">
                <label>卖出数量 (HCF)</label>
                <input type="number" id="swapAmount" placeholder="0.0">
            </div>
            <div class="input-group">
                <label>预计获得 (BNB)</label>
                <input type="number" id="receiveAmount" placeholder="0.0" readonly>
            </div>
            <button class="btn-primary" onclick="executeSwap()">确认卖出</button>
        `;
    } else if (tab === 'bridge') {
        swapContent.innerHTML = `
            <div class="info-box">
                HCF与BSDT 1:1兑换，无手续费
            </div>
            <div class="input-group">
                <label>兑换方向</label>
                <select id="bridgeDirection">
                    <option value="hcf-to-bsdt">HCF → BSDT</option>
                    <option value="bsdt-to-hcf">BSDT → HCF</option>
                </select>
            </div>
            <div class="input-group">
                <label>兑换数量</label>
                <input type="number" id="bridgeAmount" placeholder="0.0">
            </div>
            <button class="btn-primary" onclick="executeBridge()">确认兑换</button>
        `;
    }
}

// 执行兑换
async function executeSwap() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    const amount = document.getElementById('swapAmount').value;
    if (!amount || amount <= 0) {
        alert('请输入有效数量');
        return;
    }
    
    // 这里需要调用PancakeSwap路由合约
    alert('兑换功能需要连接PancakeSwap路由');
}

// 执行桥接
async function executeBridge() {
    if (!userAccount) {
        alert('请先连接钱包');
        return;
    }
    
    const amount = document.getElementById('bridgeAmount').value;
    const direction = document.getElementById('bridgeDirection').value;
    
    if (!amount || amount <= 0) {
        alert('请输入有效数量');
        return;
    }
    
    // 调用HCFBSDTExchange合约
    alert(`${direction} 兑换 ${amount} 代币`);
}

// 复制推荐链接
function copyReferralLink() {
    const linkInput = document.getElementById('myReferralLink');
    linkInput.select();
    document.execCommand('copy');
    alert('推荐链接已复制');
}

// 工具函数
function formatNumber(num) {
    return new Intl.NumberFormat('zh-CN').format(num);
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // 用户断开连接
        userAccount = null;
        location.reload();
    } else if (accounts[0] !== userAccount) {
        userAccount = accounts[0];
        loadUserData();
    }
}

function handleChainChanged(chainId) {
    location.reload();
}

// 外部链接
function openDocs() {
    window.open('https://docs.hcf-defi.com', '_blank');
}

function openContract() {
    window.open(`https://bscscan.com/address/${CONTRACTS.HCFToken}`, '_blank');
}

function openTelegram() {
    window.open('https://t.me/hcf_defi', '_blank');
}

function openTwitter() {
    window.open('https://twitter.com/hcf_defi', '_blank');
}

// 页面加载时检查是否有推荐人参数
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    
    if (ref && web3.utils.isAddress(ref)) {
        document.getElementById('referrerAddress').value = ref;
        // 可以显示提示
        alert('检测到推荐人地址，请连接钱包后绑定');
    }
    
    // 自动尝试连接钱包
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }
});