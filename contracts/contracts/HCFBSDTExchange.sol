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

interface IHCFLPMining {
    function updateLPBalance(address _lpToken, uint256 _newBalance) external;
    function updateBSDTLPBalance(address _user, uint256 _balance) external;
}

interface IHCFImpermanentLossProtection {
    function activateLPProtection(address _user, uint256 _lpTokens) external;
    function deactivateLPProtection(address _user, uint256 _lpTokens) external;
    function calculateImpermanentLoss(address _user) external view returns (uint256);
}

interface IBSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}

interface IUSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title HCFBSDTExchange
 * @dev BSDT双向兑换系统 + LP挖矿集成
 * 
 * 核心机制:
 * - USDT → BSDT: 1:1等值兑换
 * - BSDT → USDT: 97%兑换率 (扣3%手续费)
 * - LP挖矿: 9.9亿HCF奖励流动性提供者
 * - 动态LP权重计算
 */
contract HCFBSDTExchange is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IBSDT public bsdtToken;
    IUSDT public usdtToken;
    IHCFLPMining public lpMiningContract;
    IHCFImpermanentLossProtection public lossProtection;
    
    // 兑换参数
    uint256 public constant USDT_TO_BSDT_RATE = 10000; // 100% (1:1)
    uint256 public constant BSDT_TO_USDT_RATE = 9700;  // 97% (扣3%费)
    uint256 public constant FEE_RATE = 300;             // 3%手续费
    
    // 底池数据
    uint256 public bsdtPoolBalance;    // BSDT底池余额
    uint256 public usdtPoolBalance;    // USDT底池余额
    uint256 public poolRatio = 10000;  // 1:1锁定比例
    
    // 手续费收集
    address public feeCollector;
    uint256 public totalFeesCollected;
    
    // LP挖矿流动性
    mapping(address => uint256) public lpBalances; // 用户LP余额
    uint256 public totalLPSupply;                  // 总LP供应量
    
    // 交易限制
    uint256 public minExchangeAmount = 1 * 10**18;      // 最小1 USDT
    uint256 public maxExchangeAmount = 100000 * 10**18;  // 最大10万 USDT
    
    // ============ 事件 ============
    
    event USDTToBSDT(address indexed user, uint256 usdtAmount, uint256 bsdtAmount);
    event BSDTToUSDT(address indexed user, uint256 bsdtAmount, uint256 usdtAmount, uint256 fee);
    event LiquidityAdded(address indexed provider, uint256 usdtAmount, uint256 bsdtAmount, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, uint256 lpTokens, uint256 usdtAmount, uint256 bsdtAmount);
    event LPMiningReward(address indexed provider, uint256 amount);
    event PoolRatioUpdated(uint256 oldRatio, uint256 newRatio);
    event FeesWithdrawn(address indexed collector, uint256 amount);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _bsdtToken,
        address _usdtToken,
        address _feeCollector
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtToken = IBSDT(_bsdtToken);
        usdtToken = IUSDT(_usdtToken);
        feeCollector = _feeCollector;
    }
    
    function setLPMiningContract(address _lpMiningContract) external onlyOwner {
        require(_lpMiningContract != address(0), "Invalid contract address");
        lpMiningContract = IHCFLPMining(_lpMiningContract);
    }
    
    function setLossProtectionContract(address _lossProtection) external onlyOwner {
        require(_lossProtection != address(0), "Invalid contract address");
        lossProtection = IHCFImpermanentLossProtection(_lossProtection);
    }
    
    // ============ 核心兑换功能 ============
    
    /**
     * @dev USDT → BSDT: 1:1兑换
     */
    function swapUSDTToBSDT(uint256 _usdtAmount) external nonReentrant {
        require(_usdtAmount >= minExchangeAmount, "Amount too small");
        require(_usdtAmount <= maxExchangeAmount, "Amount too large");
        require(usdtToken.balanceOf(msg.sender) >= _usdtAmount, "Insufficient USDT balance");
        
        // 计算BSDT数量 (1:1)
        uint256 bsdtAmount = (_usdtAmount * USDT_TO_BSDT_RATE) / 10000;
        
        // 检查底池容量
        require(usdtPoolBalance + _usdtAmount <= getMaxPoolCapacity(), "Pool capacity exceeded");
        
        // 转移USDT到合约
        require(usdtToken.transferFrom(msg.sender, address(this), _usdtAmount), "USDT transfer failed");
        
        // 铸造BSDT给用户
        bsdtToken.mint(msg.sender, bsdtAmount);
        
        // 更新底池余额
        usdtPoolBalance += _usdtAmount;
        bsdtPoolBalance += bsdtAmount;
        
        emit USDTToBSDT(msg.sender, _usdtAmount, bsdtAmount);
    }
    
    /**
     * @dev BSDT → USDT: 97%兑换率 (扣3%手续费)
     */
    function swapBSDTToUSDT(uint256 _bsdtAmount) external nonReentrant {
        require(_bsdtAmount >= minExchangeAmount, "Amount too small");
        require(_bsdtAmount <= maxExchangeAmount, "Amount too large");
        require(bsdtToken.balanceOf(msg.sender) >= _bsdtAmount, "Insufficient BSDT balance");
        
        // 计算USDT数量 (97%)
        uint256 usdtAmount = (_bsdtAmount * BSDT_TO_USDT_RATE) / 10000;
        uint256 feeAmount = (_bsdtAmount * FEE_RATE) / 10000;
        
        // 检查底池USDT余额
        require(usdtPoolBalance >= usdtAmount, "Insufficient USDT in pool");
        
        // 销毁用户的BSDT
        require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        bsdtToken.burn(_bsdtAmount);
        
        // 转移USDT给用户 (97%)
        require(usdtToken.transfer(msg.sender, usdtAmount), "USDT transfer failed");
        
        // 收集手续费 (3%)
        uint256 feeInUSDT = (_bsdtAmount * FEE_RATE) / 10000;
        if (feeInUSDT > 0 && feeCollector != address(0)) {
            require(usdtToken.transfer(feeCollector, feeInUSDT), "Fee transfer failed");
            totalFeesCollected += feeInUSDT;
        }
        
        // 更新底池余额
        usdtPoolBalance = usdtPoolBalance - usdtAmount - feeInUSDT;
        bsdtPoolBalance -= _bsdtAmount;
        
        emit BSDTToUSDT(msg.sender, _bsdtAmount, usdtAmount, feeInUSDT);
    }
    
    // ============ LP挖矿流动性功能 ============
    
    /**
     * @dev 添加流动性 (USDT+BSDT) - 获得LP挖矿权重
     */
    function addLiquidity(uint256 _usdtAmount, uint256 _bsdtAmount) external nonReentrant {
        require(_usdtAmount > 0 && _bsdtAmount > 0, "Amounts must be positive");
        require(usdtToken.balanceOf(msg.sender) >= _usdtAmount, "Insufficient USDT");
        require(bsdtToken.balanceOf(msg.sender) >= _bsdtAmount, "Insufficient BSDT");
        
        // 计算LP代币数量
        uint256 lpTokens;
        if (totalLPSupply == 0) {
            // 初始流动性
            lpTokens = _usdtAmount; // 使用USDT数量作为LP代币
        } else {
            // 按比例计算
            lpTokens = (_usdtAmount * totalLPSupply) / usdtPoolBalance;
        }
        
        // 转移代币到合约
        require(usdtToken.transferFrom(msg.sender, address(this), _usdtAmount), "USDT transfer failed");
        require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        
        // 更新状态
        usdtPoolBalance += _usdtAmount;
        bsdtPoolBalance += _bsdtAmount;
        lpBalances[msg.sender] += lpTokens;
        totalLPSupply += lpTokens;
        
        // 更新LP挖矿余额 (如果挖矿合约已设置)
        if (address(lpMiningContract) != address(0)) {
            lpMiningContract.updateBSDTLPBalance(msg.sender, lpBalances[msg.sender]);
        }
        
        // 激活无常损失保护 (如果保护合约已设置)
        if (address(lossProtection) != address(0)) {
            lossProtection.activateLPProtection(msg.sender, lpTokens);
        }
        
        emit LiquidityAdded(msg.sender, _usdtAmount, _bsdtAmount, lpTokens);
    }
    
    /**
     * @dev 移除流动性 - 减少LP挖矿权重
     */
    function removeLiquidity(uint256 _lpTokens) external nonReentrant {
        require(_lpTokens > 0, "LP tokens must be positive");
        require(lpBalances[msg.sender] >= _lpTokens, "Insufficient LP balance");
        require(totalLPSupply > 0, "No liquidity to remove");
        
        // 计算可提取的代币数量
        uint256 usdtAmount = (_lpTokens * usdtPoolBalance) / totalLPSupply;
        uint256 bsdtAmount = (_lpTokens * bsdtPoolBalance) / totalLPSupply;
        
        // 检查合约余额
        require(usdtToken.balanceOf(address(this)) >= usdtAmount, "Insufficient USDT in contract");
        require(bsdtToken.balanceOf(address(this)) >= bsdtAmount, "Insufficient BSDT in contract");
        
        // 更新状态
        lpBalances[msg.sender] -= _lpTokens;
        totalLPSupply -= _lpTokens;
        usdtPoolBalance -= usdtAmount;
        bsdtPoolBalance -= bsdtAmount;
        
        // 更新LP挖矿余额 (如果挖矿合约已设置)
        if (address(lpMiningContract) != address(0)) {
            lpMiningContract.updateBSDTLPBalance(msg.sender, lpBalances[msg.sender]);
        }
        
        // 停用无常损失保护 (如果保护合约已设置)
        if (address(lossProtection) != address(0)) {
            lossProtection.deactivateLPProtection(msg.sender, _lpTokens);
        }
        
        // 转移代币给用户
        require(usdtToken.transfer(msg.sender, usdtAmount), "USDT transfer failed");
        require(bsdtToken.transfer(msg.sender, bsdtAmount), "BSDT transfer failed");
        
        emit LiquidityRemoved(msg.sender, _lpTokens, usdtAmount, bsdtAmount);
    }
    
    // ============ 9.9亿LP挖矿奖励分发 ============
    
    /**
     * @dev 分发LP挖矿奖励 (从9.9亿挖矿池)
     */
    function distributeLPMiningReward(address _lpProvider, uint256 _rewardAmount) external onlyOwner {
        require(_lpProvider != address(0), "Invalid LP provider");
        require(_rewardAmount > 0, "Reward must be positive");
        require(lpBalances[_lpProvider] > 0, "User has no LP balance");
        
        // 从HCF合约发放挖矿奖励
        require(hcfToken.transfer(_lpProvider, _rewardAmount), "HCF reward transfer failed");
        
        emit LPMiningReward(_lpProvider, _rewardAmount);
    }
    
    /**
     * @dev 批量分发LP挖矿奖励
     */
    function batchDistributeLPMiningRewards(address[] memory _lpProviders, uint256[] memory _rewardAmounts) external onlyOwner {
        require(_lpProviders.length == _rewardAmounts.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < _lpProviders.length; i++) {
            if (_lpProviders[i] != address(0) && _rewardAmounts[i] > 0 && lpBalances[_lpProviders[i]] > 0) {
                require(hcfToken.transfer(_lpProviders[i], _rewardAmounts[i]), "HCF reward transfer failed");
                emit LPMiningReward(_lpProviders[i], _rewardAmounts[i]);
            }
        }
    }
    
    /**
     * @dev 计算用户LP挖矿权重 (基于LP余额占比)
     */
    function calculateLPWeight(address _lpProvider) external view returns (uint256 weight) {
        if (totalLPSupply == 0 || lpBalances[_lpProvider] == 0) {
            return 0;
        }
        
        weight = (lpBalances[_lpProvider] * 10000) / totalLPSupply;
        return weight;
    }
    
    // ============ 查询函数 ============
    
    function getExchangeRates() external view returns (uint256 usdtToBsdt, uint256 bsdtToUsdt, uint256 feeRate) {
        return (USDT_TO_BSDT_RATE, BSDT_TO_USDT_RATE, FEE_RATE);
    }
    
    function getPoolInfo() external view returns (uint256 usdtBalance, uint256 bsdtBalance, uint256 ratio, uint256 totalLP) {
        return (usdtPoolBalance, bsdtPoolBalance, poolRatio, totalLPSupply);
    }
    
    function getUserLPInfo(address _user) external view returns (uint256 lpBalance, uint256 weight, uint256 usdtShare, uint256 bsdtShare) {
        lpBalance = lpBalances[_user];
        weight = totalLPSupply > 0 ? (lpBalance * 10000) / totalLPSupply : 0;
        usdtShare = totalLPSupply > 0 ? (lpBalance * usdtPoolBalance) / totalLPSupply : 0;
        bsdtShare = totalLPSupply > 0 ? (lpBalance * bsdtPoolBalance) / totalLPSupply : 0;
    }
    
    function simulateSwap(uint256 _amount, bool _usdtToBsdt) external view returns (uint256 outputAmount, uint256 feeAmount) {
        if (_usdtToBsdt) {
            outputAmount = (_amount * USDT_TO_BSDT_RATE) / 10000;
            feeAmount = 0;
        } else {
            outputAmount = (_amount * BSDT_TO_USDT_RATE) / 10000;
            feeAmount = (_amount * FEE_RATE) / 10000;
        }
    }
    
    function getMaxPoolCapacity() public pure returns (uint256) {
        return 10000000 * 10**18; // 1000万USDT上限
    }
    
    // ============ 管理函数 ============
    
    function updateExchangeLimits(uint256 _minAmount, uint256 _maxAmount) external onlyOwner {
        require(_minAmount < _maxAmount, "Invalid limits");
        minExchangeAmount = _minAmount;
        maxExchangeAmount = _maxAmount;
    }
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
    }
    
    function updatePoolRatio(uint256 _newRatio) external onlyOwner {
        require(_newRatio > 0 && _newRatio <= 20000, "Invalid ratio");
        
        uint256 oldRatio = poolRatio;
        poolRatio = _newRatio;
        
        emit PoolRatioUpdated(oldRatio, _newRatio);
    }
    
    function withdrawFees(uint256 _amount) external {
        require(msg.sender == feeCollector || msg.sender == owner(), "Not authorized");
        require(_amount <= usdtToken.balanceOf(address(this)), "Insufficient balance");
        
        require(usdtToken.transfer(feeCollector, _amount), "Fee withdrawal failed");
        
        emit FeesWithdrawn(feeCollector, _amount);
    }
    
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(owner(), _amount);
    }
}