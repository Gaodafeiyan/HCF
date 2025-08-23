// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IHCFBSDTExchange {
    function lpBalances(address user) external view returns (uint256);
    function totalLPSupply() external view returns (uint256);
    function getUserLPInfo(address _user) external view returns (uint256 lpBalance, uint256 weight, uint256 usdtShare, uint256 bsdtShare);
    function getPoolInfo() external view returns (uint256 usdtBalance, uint256 bsdtBalance, uint256 ratio, uint256 totalLP);
}

interface IPriceOracle {
    function getPrice() external view returns (uint256);
    function getLatestPriceData() external view returns (uint256 price, uint256 timestamp);
}

/**
 * @title HCFImpermanentLossProtection
 * @dev LP动态补充系统 - 无常损失保护 (房损500HCF)
 * 
 * 功能包括:
 * - 监控LP提供者的无常损失
 * - 当损失超过500 HCF时自动补偿
 * - 动态计算LP价值变化
 * - 智能补偿算法
 * - 24小时冷却期
 */
contract HCFImpermanentLossProtection is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IHCFBSDTExchange public bsdtExchange;
    IPriceOracle public priceOracle;
    
    // 保护参数
    uint256 public constant LOSS_THRESHOLD = 500 * 10**18; // 500 HCF损失阈值
    uint256 public constant MAX_COMPENSATION = 10000 * 10**18; // 单次最大补偿10000 HCF
    uint256 public constant COMPENSATION_RATE = 8000; // 80%补偿比例 (basis points)
    uint256 public constant CLAIM_COOLDOWN = 24 hours; // 24小时冷却期
    
    // 补偿资金池
    uint256 public compensationPool; // 补偿资金池总额
    uint256 public totalCompensationPaid; // 已支付的总补偿
    
    // 用户LP追踪数据
    struct UserLPData {
        uint256 initialLPValue; // 初始LP价值 (USD)
        uint256 initialHCFPrice; // 初始HCF价格
        uint256 initialUSDTPrice; // 初始USDT价格 (应为1)
        uint256 lpTokensDeposited; // 存入的LP代币数量
        uint256 entryTimestamp; // 进入时间
        uint256 lastClaimTime; // 最后申请补偿时间
        uint256 totalCompensationReceived; // 已收到的总补偿
        bool isActive; // 是否激活保护
    }
    
    mapping(address => UserLPData) public userLPData;
    mapping(address => bool) public isLPProvider; // 是否为LP提供者
    
    // 全局统计
    uint256 public totalLPProviders;
    uint256 public totalActiveLPValue;
    
    // 损失记录
    struct LossRecord {
        address user;
        uint256 lossAmount;
        uint256 compensationAmount;
        uint256 timestamp;
        uint256 hcfPriceAtLoss;
    }
    
    LossRecord[] public lossHistory;
    
    // ============ 事件 ============
    
    event LPProtectionActivated(address indexed user, uint256 lpTokens, uint256 initialValue);
    event LPProtectionDeactivated(address indexed user, uint256 lpTokens);
    event ImpermanentLossDetected(address indexed user, uint256 lossAmount, uint256 compensationAmount);
    event CompensationPaid(address indexed user, uint256 amount);
    event CompensationPoolFunded(uint256 amount);
    event LossCalculated(address indexed user, uint256 currentValue, uint256 initialValue, uint256 lossAmount);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _bsdtExchange,
        address _priceOracle
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtExchange = IHCFBSDTExchange(_bsdtExchange);
        priceOracle = IPriceOracle(_priceOracle);
    }
    
    // ============ 核心保护功能 ============
    
    /**
     * @dev 激活LP保护 (当用户添加流动性时调用)
     * @param _user 用户地址
     * @param _lpTokens LP代币数量
     */
    function activateLPProtection(address _user, uint256 _lpTokens) external {
        require(msg.sender == address(bsdtExchange), "Only BSDT exchange can activate");
        require(_lpTokens > 0, "LP tokens must be positive");
        
        // 获取当前价格数据
        uint256 hcfPrice = priceOracle.getPrice();
        
        // 计算初始LP价值
        (uint256 lpBalance, , uint256 usdtShare, uint256 bsdtShare) = bsdtExchange.getUserLPInfo(_user);
        uint256 initialValue = usdtShare + (bsdtShare * hcfPrice) / 10**18; // USD value
        
        // 更新或初始化用户数据
        if (!isLPProvider[_user]) {
            isLPProvider[_user] = true;
            totalLPProviders++;
        }
        
        userLPData[_user] = UserLPData({
            initialLPValue: initialValue,
            initialHCFPrice: hcfPrice,
            initialUSDTPrice: 1 * 10**18, // USDT = 1 USD
            lpTokensDeposited: _lpTokens,
            entryTimestamp: block.timestamp,
            lastClaimTime: 0,
            totalCompensationReceived: 0,
            isActive: true
        });
        
        totalActiveLPValue += initialValue;
        
        emit LPProtectionActivated(_user, _lpTokens, initialValue);
    }
    
    /**
     * @dev 停用LP保护 (当用户移除流动性时调用)
     * @param _user 用户地址
     * @param _lpTokens 移除的LP代币数量
     */
    function deactivateLPProtection(address _user, uint256 _lpTokens) external {
        require(msg.sender == address(bsdtExchange), "Only BSDT exchange can deactivate");
        require(isLPProvider[_user] && userLPData[_user].isActive, "User not active");
        
        UserLPData storage userData = userLPData[_user];
        
        // 计算移除比例
        uint256 removeRatio = (_lpTokens * 10000) / userData.lpTokensDeposited;
        
        // 按比例减少保护
        if (removeRatio >= 10000) {
            // 完全移除
            userData.isActive = false;
            totalActiveLPValue -= userData.initialLPValue;
            totalLPProviders--;
            isLPProvider[_user] = false;
        } else {
            // 部分移除
            uint256 valueReduction = (userData.initialLPValue * removeRatio) / 10000;
            userData.initialLPValue -= valueReduction;
            userData.lpTokensDeposited -= _lpTokens;
            totalActiveLPValue -= valueReduction;
        }
        
        emit LPProtectionDeactivated(_user, _lpTokens);
    }
    
    /**
     * @dev 检查并申请无常损失补偿
     */
    function checkAndClaimCompensation() external nonReentrant {
        require(isLPProvider[msg.sender] && userLPData[msg.sender].isActive, "Not eligible");
        require(
            block.timestamp >= userLPData[msg.sender].lastClaimTime + CLAIM_COOLDOWN,
            "Claim cooldown active"
        );
        
        uint256 lossAmount = calculateImpermanentLoss(msg.sender);
        
        if (lossAmount >= LOSS_THRESHOLD) {
            _processCompensation(msg.sender, lossAmount);
        } else {
            revert("Loss below threshold");
        }
    }
    
    /**
     * @dev 处理补偿支付
     */
    function _processCompensation(address _user, uint256 _lossAmount) internal {
        // 计算补偿金额 (80%补偿)
        uint256 compensationAmount = (_lossAmount * COMPENSATION_RATE) / 10000;
        
        // 限制最大补偿
        if (compensationAmount > MAX_COMPENSATION) {
            compensationAmount = MAX_COMPENSATION;
        }
        
        // 检查补偿池余额
        require(compensationPool >= compensationAmount, "Insufficient compensation pool");
        
        // 更新用户数据
        userLPData[_user].lastClaimTime = block.timestamp;
        userLPData[_user].totalCompensationReceived += compensationAmount;
        
        // 更新全局数据
        compensationPool -= compensationAmount;
        totalCompensationPaid += compensationAmount;
        
        // 记录损失历史
        uint256 currentHCFPrice = priceOracle.getPrice();
        lossHistory.push(LossRecord({
            user: _user,
            lossAmount: _lossAmount,
            compensationAmount: compensationAmount,
            timestamp: block.timestamp,
            hcfPriceAtLoss: currentHCFPrice
        }));
        
        // 发放补偿
        require(hcfToken.transfer(_user, compensationAmount), "Compensation transfer failed");
        
        emit ImpermanentLossDetected(_user, _lossAmount, compensationAmount);
        emit CompensationPaid(_user, compensationAmount);
    }
    
    // ============ 无常损失计算 ============
    
    /**
     * @dev 计算用户的无常损失 (以HCF计价)
     * @param _user 用户地址
     * @return lossAmount 损失金额 (HCF)
     */
    function calculateImpermanentLoss(address _user) public view returns (uint256 lossAmount) {
        if (!isLPProvider[_user] || !userLPData[_user].isActive) {
            return 0;
        }
        
        UserLPData memory userData = userLPData[_user];
        
        // 获取当前价格
        uint256 currentHCFPrice = priceOracle.getPrice();
        
        // 获取当前LP价值
        (, , uint256 currentUSDTShare, uint256 currentBSDTShare) = bsdtExchange.getUserLPInfo(_user);
        uint256 currentLPValue = currentUSDTShare + (currentBSDTShare * currentHCFPrice) / 10**18;
        
        // 计算如果直接持有代币的价值
        uint256 initialHCFAmount = (userData.initialLPValue * 10**18) / (userData.initialHCFPrice + 10**18); // 50% HCF
        uint256 initialUSDTAmount = userData.initialLPValue - (initialHCFAmount * userData.initialHCFPrice) / 10**18; // 50% USDT
        
        uint256 holdValue = (initialHCFAmount * currentHCFPrice) / 10**18 + initialUSDTAmount;
        
        // 无常损失 = 持有价值 - LP价值
        if (holdValue > currentLPValue) {
            uint256 lossInUSD = holdValue - currentLPValue;
            lossAmount = (lossInUSD * 10**18) / currentHCFPrice; // 转换为HCF
        } else {
            lossAmount = 0;
        }
        
        return lossAmount;
    }
    
    /**
     * @dev 批量检查所有LP提供者的损失
     */
    function checkAllLPProviders() external view returns (
        address[] memory users,
        uint256[] memory losses,
        bool[] memory eligible
    ) {
        uint256 count = 0;
        
        // 先计算有多少活跃用户 (需要在实际实现中优化)
        // 这里简化处理，实际应该维护一个活跃用户列表
        
        users = new address[](totalLPProviders);
        losses = new uint256[](totalLPProviders);
        eligible = new bool[](totalLPProviders);
        
        // 实际实现中需要遍历所有用户或维护活跃用户列表
        // 这里返回空数组作为占位符
        
        return (users, losses, eligible);
    }
    
    // ============ 自动化保护 ============
    
    /**
     * @dev 自动检查并处理符合条件的补偿 (外部调用)
     * @param _users 要检查的用户地址数组
     */
    function autoProcessCompensations(address[] calldata _users) external {
        require(msg.sender == owner() || msg.sender == address(bsdtExchange), "Not authorized");
        
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            
            if (!isLPProvider[user] || !userLPData[user].isActive) {
                continue;
            }
            
            if (block.timestamp < userLPData[user].lastClaimTime + CLAIM_COOLDOWN) {
                continue;
            }
            
            uint256 lossAmount = calculateImpermanentLoss(user);
            
            if (lossAmount >= LOSS_THRESHOLD && compensationPool >= (lossAmount * COMPENSATION_RATE) / 10000) {
                _processCompensation(user, lossAmount);
            }
        }
    }
    
    // ============ 资金池管理 ============
    
    /**
     * @dev 向补偿池注入资金
     */
    function fundCompensationPool(uint256 _amount) external {
        require(hcfToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        compensationPool += _amount;
        
        emit CompensationPoolFunded(_amount);
    }
    
    /**
     * @dev 提取多余资金 (仅管理员)
     */
    function withdrawFromPool(uint256 _amount) external onlyOwner {
        require(_amount <= compensationPool, "Amount exceeds pool");
        compensationPool -= _amount;
        
        require(hcfToken.transfer(owner(), _amount), "Transfer failed");
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 获取用户保护状态
     */
    function getUserProtectionStatus(address _user) external view returns (
        bool isActive,
        uint256 initialValue,
        uint256 currentLoss,
        uint256 lastClaimTime,
        uint256 totalCompensationReceived,
        bool canClaim
    ) {
        if (!isLPProvider[_user]) {
            return (false, 0, 0, 0, 0, false);
        }
        
        UserLPData memory userData = userLPData[_user];
        uint256 calculatedLoss = calculateImpermanentLoss(_user);
        bool canClaimNow = block.timestamp >= userData.lastClaimTime + CLAIM_COOLDOWN && 
                          calculatedLoss >= LOSS_THRESHOLD;
        
        return (
            userData.isActive,
            userData.initialLPValue,
            calculatedLoss,
            userData.lastClaimTime,
            userData.totalCompensationReceived,
            canClaimNow
        );
    }
    
    /**
     * @dev 获取补偿池状态
     */
    function getPoolStatus() external view returns (
        uint256 poolBalance,
        uint256 totalPaid,
        uint256 totalProviders,
        uint256 totalActiveValue
    ) {
        return (
            compensationPool,
            totalCompensationPaid,
            totalLPProviders,
            totalActiveLPValue
        );
    }
    
    /**
     * @dev 获取损失历史
     */
    function getLossHistory(uint256 _limit) external view returns (LossRecord[] memory) {
        uint256 length = lossHistory.length;
        uint256 returnLength = _limit > length ? length : _limit;
        
        LossRecord[] memory recentHistory = new LossRecord[](returnLength);
        
        for (uint256 i = 0; i < returnLength; i++) {
            recentHistory[i] = lossHistory[length - returnLength + i];
        }
        
        return recentHistory;
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 设置BSDT交易所地址
     */
    function setBSDTExchange(address _bsdtExchange) external onlyOwner {
        require(_bsdtExchange != address(0), "Invalid exchange address");
        bsdtExchange = IHCFBSDTExchange(_bsdtExchange);
    }
    
    /**
     * @dev 设置价格预言机地址
     */
    function setPriceOracle(address _priceOracle) external onlyOwner {
        require(_priceOracle != address(0), "Invalid oracle address");
        priceOracle = IPriceOracle(_priceOracle);
    }
    
    /**
     * @dev 紧急暂停 (管理员)
     */
    function emergencyPause() external onlyOwner {
        // 实现紧急暂停逻辑
    }
    
    /**
     * @dev 紧急提取
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(owner(), _amount);
    }
}