// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function releaseMiningRewards(address to, uint256 amount) external;
}

interface IBSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUSDC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IHCFReferral {
    function distributeReferralRewards(address user, uint256 rewardAmount) external;
    function distributeTeamRewards(address user, uint256 rewardAmount) external;
    function getUserData(address user) external view returns (address referrer, uint256 directCount, uint256 teamLevel, uint256 personalVolume, uint256 teamVolume, uint256 totalReferralReward, uint256 totalTeamReward, bool isActive, uint256 joinTime, uint256 lastRewardTime);
}

contract HCFStaking is ReentrancyGuard, Ownable {
    
    // Staking Level System (按照真实需求重构)
    struct StakingLevel {
        uint256 minAmount;       // 最小质押数量
        uint256 baseRate;        // 基础日化率 (basis points)
        uint256 lpRate;          // LP模式日化率
        uint256 compoundUnit;    // 复投倍数单位
        uint256 lpCoefficient;   // LP系数 (1:5 = 500)
        uint256 totalStaked;     // 该等级总质押量
        bool active;             // 等级激活状态
    }
    
    // User Staking Info (重构为真实需求)
    struct UserInfo {
        uint256 amount;          // 质押总金额
        uint256 levelId;         // 质押等级 (0-3)
        uint256 startTime;       // 开始质押时间
        uint256 lastClaim;       // 上次提取时间
        uint256 totalClaimed;    // 累计已提取
        bool isLP;               // 是否LP模式
        uint256 lpHCFAmount;     // LP模式中的HCF数量
        uint256 lpBSDTAmount;    // LP模式中的BSDT数量
        uint256 compoundCount;   // 复投次数
        uint256 lastDepositTime; // 最后存款时间
        uint256 weeklyDeposited; // 周存款量
        bool isEquityLP;         // 是否股权LP
    }
    
    // Dual Cycle System
    struct CycleInfo {
        uint256 baseMultiplier; // Base multiplier (100 = 1x)
        uint256 bonusMultiplier; // Bonus multiplier after cycle (500 = 5x)
        uint256 cycleThreshold; // Amount needed to complete cycle
    }
    
    // Contract state
    IHCFToken public hcfToken;
    IBSDT public bsdtToken;
    IUSDC public usdcToken;
    IHCFReferral public referralContract;
    
    // Level configurations (真实需求的4等级，①-④)
    StakingLevel[4] public stakingLevels;
    mapping(address => UserInfo) public userInfo;
    mapping(address => bool) public isLPToken;
    
    // 股权LP归集账户
    address public equityLPCollector;
    
    // LP动态平衡参数
    uint256 public lpTargetRatio = 5000; // 50% HCF in LP
    uint256 public priceImpactThreshold = 1000; // 10% price change threshold
    
    // Cycle configuration
    CycleInfo public cycleConfig;
    
    // Purchase limits
    uint256 public constant PURCHASE_LIMIT_PERIOD = 7 days;
    uint256 public constant DAILY_PURCHASE_LIMIT = 500 * 10**18; // 500 HCF per day
    
    // Withdrawal penalties
    uint256 public constant BNB_PENALTY = 1000; // 10%
    uint256 public constant BURN_PENALTY = 3000; // 30%
    
    // USDC slippage range
    uint256 public constant MIN_SLIPPAGE = 99; // 0.99
    uint256 public constant MAX_SLIPPAGE = 100; // 1.00
    
    // Admin controls
    bool public stakingEnabled = true;
    mapping(uint256 => uint256) public levelRateMultipliers; // Backend rate adjustments
    
    // 防暴跌系统参数
    uint256 public currentPriceImpact = 0; // 当日价格变化百分比
    uint256 public additionalTaxRate = 0; // 额外税率
    uint256 public productionReductionRate = 0; // 减产率
    
    // Events
    event Staked(address indexed user, uint256 levelId, uint256 amount, bool isLP);
    event Unstaked(address indexed user, uint256 amount, uint256 penalty);
    event RewardsClaimed(address indexed user, uint256 amount);
    event CycleCompleted(address indexed user, uint256 cycleCount);
    event LevelRateUpdated(uint256 levelId, uint256 baseRate, uint256 lpRate);
    event LPAutoCompound(address indexed user, uint256 amount);
    event EquityLPStaked(address indexed user, uint256 hcfAmount, uint256 bsdtAmount);
    
    constructor(
        address _hcfToken,
        address _bsdtToken,
        address _usdcToken
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtToken = IBSDT(_bsdtToken);
        usdcToken = IUSDC(_usdcToken);
        
        // Initialize 4等级质押系统 - 完全按照文档要求
        // LP配比1:5增益机制
        
        // ①级: 10 HCF, 0.4% → LP后0.8% (2倍基础)
        stakingLevels[0] = StakingLevel({
            minAmount: 10 * 10**18,
            baseRate: 40,  // 0.4%
            lpRate: 80,    // 0.8%
            compoundUnit: 10 * 10**18,
            lpCoefficient: 500,  // 1:5增益
            totalStaked: 0,
            active: true
        });
        
        // ②级: 100 HCF, 0.4% → LP后0.8% (2倍基础)
        stakingLevels[1] = StakingLevel({
            minAmount: 100 * 10**18,
            baseRate: 40,  // 0.4%
            lpRate: 80,    // 0.8%
            compoundUnit: 100 * 10**18,
            lpCoefficient: 500,  // 1:5增益
            totalStaked: 0,
            active: true
        });
        
        // ③级: 1000 HCF, 0.5% → LP后1% (2倍基础)
        stakingLevels[2] = StakingLevel({
            minAmount: 1000 * 10**18,
            baseRate: 50,  // 0.5%
            lpRate: 100,   // 1.0%
            compoundUnit: 1000 * 10**18,
            lpCoefficient: 500,  // 1:5增益
            totalStaked: 0,
            active: true
        });
        
        // ④级: 10000 HCF, 0.6% → LP后1.2% (2倍基础)
        stakingLevels[3] = StakingLevel({
            minAmount: 10000 * 10**18,
            baseRate: 60,  // 0.6%
            lpRate: 120,   // 1.2%
            compoundUnit: 10000 * 10**18,
            lpCoefficient: 500,  // 1:5增益
            totalStaked: 0,
            active: true
        });
        
        // Initialize dual cycle config (100倍显示，不是100倍收益)
        // 1000+ HCF激活双循环，显示为100倍复投
        cycleConfig = CycleInfo(100, 100, 1000 * 10**18); // 100倍显示
        
        // Initialize level rate multipliers to 100% (10000 basis points)
        for (uint256 i = 0; i < 4; i++) {
            levelRateMultipliers[i] = 10000;
        }
    }
    
    // 质押函数 (重构为真实需求)
    function stake(uint256 _levelId, uint256 _amount, bool _isLP, uint256 _bsdtAmount) external nonReentrant {
        require(stakingEnabled, "Staking disabled");
        require(_levelId < 5, "Invalid level ID");
        require(_amount > 0, "Amount must be positive");
        require(stakingLevels[_levelId].active, "Level not active");
        require(_amount >= stakingLevels[_levelId].minAmount, "Below minimum amount");
        
        UserInfo storage user = userInfo[msg.sender];
        
        // 检查限购 (前7天每天500枚)
        _checkPurchaseLimit(user, _amount);
        
        // LP模式需要BSDT
        if (_isLP) {
            require(_bsdtAmount > 0, "LP mode requires BSDT");
            require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        }
        
        // 转移HCF代币
        require(hcfToken.transferFrom(msg.sender, address(this), _amount), "HCF transfer failed");
        
        // 如果有现有质押且等级不同，先提取奖励
        if (user.amount > 0 && user.levelId != _levelId) {
            _claimRewards(msg.sender);
        }
        
        // 更新用户信息
        if (user.amount == 0) {
            user.startTime = block.timestamp;
            user.lastClaim = block.timestamp;
            user.levelId = _levelId;
        }
        
        user.amount += _amount;
        user.isLP = _isLP;
        if (_isLP) {
            user.lpHCFAmount += _amount;
            user.lpBSDTAmount += _bsdtAmount;
        }
        user.lastDepositTime = block.timestamp;
        _updateWeeklyDeposit(user, _amount);
        
        // 更新等级信息
        stakingLevels[_levelId].totalStaked += _amount;
        
        // LP模式自动复投
        if (_isLP) {
            _autoCompoundLP(msg.sender);
        }
        
        emit Staked(msg.sender, _levelId, _amount, _isLP);
    }
    
    // 股权LP质押函数
    function stakeEquityLP(uint256 _hcfAmount, uint256 _bsdtAmount) external nonReentrant {
        require(stakingEnabled, "Staking disabled");
        require(_hcfAmount > 0 && _bsdtAmount > 0, "Amounts must be positive");
        require(equityLPCollector != address(0), "Equity LP collector not set");
        
        UserInfo storage user = userInfo[msg.sender];
        
        // 转移代币到归集账户
        require(hcfToken.transferFrom(msg.sender, equityLPCollector, _hcfAmount), "HCF transfer failed");
        require(bsdtToken.transferFrom(msg.sender, equityLPCollector, _bsdtAmount), "BSDT transfer failed");
        
        // 更新用户股权LP信息
        user.isEquityLP = true;
        user.amount += _hcfAmount; // 股权LP也计入质押量
        user.lastDepositTime = block.timestamp;
        
        // TODO: 归集账户自动执行加LP操作
        // 这里需要外部服务或者Keeper机制来处理
        
        emit EquityLPStaked(msg.sender, _hcfAmount, _bsdtAmount);
    }
    
    // LP动态平衡机制
    function checkLPBalance() external view returns (bool needRebalance, uint256 currentRatio) {
        // TODO: 获取LP中的HCF占比
        // 这里需要与Uniswap/PancakeSwap LP合约集成
        // currentRatio = (LP中HCF数量 * 10000) / LP总价值
        currentRatio = 5000; // 模拟50%
        needRebalance = currentRatio < lpTargetRatio - 500 || currentRatio > lpTargetRatio + 500;
        return (needRebalance, currentRatio);
    }
    
    function rebalanceLP() external {
        // TODO: LP自动平衡遗辑
        // 1. 检查当前价格
        // 2. 计算需要补充的HCF数量
        // 3. 从合约中调用HCF补充LP
        // 4. 调整质押奖励率
        require(msg.sender == owner() || msg.sender == equityLPCollector, "Unauthorized");
        
        // 暂时留空，等待具体LP集成
    }
    
    // 设置LP目标比例
    function setLPTargetRatio(uint256 _ratio) external onlyOwner {
        require(_ratio > 0 && _ratio < 10000, "Invalid ratio");
        lpTargetRatio = _ratio;
    }
    
    // 防暴跌机制
    function updatePriceImpact(uint256 _priceChangePercent) external onlyOwner {
        currentPriceImpact = _priceChangePercent;
        
        // 根据价格跌幅调整额外税率
        if (_priceChangePercent >= 5000) { // 50%跌幅
            additionalTaxRate = 3000; // +30%税率
            productionReductionRate = 3000; // -30%产出
        } else if (_priceChangePercent >= 3000) { // 30%跌幅
            additionalTaxRate = 1500; // +15%税率
            productionReductionRate = 1500; // -15%产出
        } else if (_priceChangePercent >= 1000) { // 10%跌幅
            additionalTaxRate = 500; // +5%税率
            productionReductionRate = 500; // -5%产出
        } else {
            additionalTaxRate = 0;
            productionReductionRate = 0;
        }
    }
    
    // 获取当前防暴跌状态
    function getAntiDumpStatus() external view returns (
        uint256 priceImpact,
        uint256 additionalTax,
        uint256 reductionRate
    ) {
        return (currentPriceImpact, additionalTaxRate, productionReductionRate);
    }
    
    /**
     * @dev 赎回机制 - 按文档要求实现罚款
     * 质押赎回: 扣10% BNB手续费
     * LP赎回: 扣50% BSDT + 20%币（其中30%销毁）
     * 未达分享总量1:1时，额外烧30% HCF
     */
    function unstake(uint256 _amount) external nonReentrant payable {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "Insufficient staked amount");
        
        // 先领取待领取奖励
        _claimRewards(msg.sender);
        
        uint256 returnAmount = _amount;
        uint256 totalPenalty = 0;
        
        if (user.isLP) {
            // LP赎回罚款
            // 50% BSDT罚款
            uint256 bsdtPenalty = (user.lpBSDTAmount * 5000) / 10000; // 50%
            if (bsdtPenalty > 0 && bsdtToken.balanceOf(msg.sender) >= bsdtPenalty) {
                require(bsdtToken.transferFrom(msg.sender, address(this), bsdtPenalty), "BSDT penalty failed");
            }
            
            // 20%币罚款（其中30%销毁）
            uint256 hcfPenalty = (_amount * 2000) / 10000; // 20%
            uint256 burnPortion = (hcfPenalty * 3000) / 10000; // 30%的20% = 6%
            
            returnAmount = _amount - hcfPenalty;
            
            // 销毁部分
            if (burnPortion > 0) {
                require(hcfToken.transfer(address(0xdead), burnPortion), "Burn failed");
            }
            
            totalPenalty = hcfPenalty;
            
            // 更新LP信息
            user.lpHCFAmount = user.lpHCFAmount > _amount ? user.lpHCFAmount - _amount : 0;
            user.lpBSDTAmount = user.lpBSDTAmount > bsdtPenalty ? user.lpBSDTAmount - bsdtPenalty : 0;
        } else {
            // 普通质押赎回 - 扣10% BNB
            uint256 bnbPenalty = (_amount * 1000) / 10000; // 10%
            uint256 bnbRequired = (bnbPenalty * 1e18) / (10**18); // 转换为BNB
            
            // 需要用户支付BNB作为手续费
            require(msg.value >= bnbRequired, "Insufficient BNB for penalty");
            
            // 如果支付过多，退还多余的
            if (msg.value > bnbRequired) {
                payable(msg.sender).transfer(msg.value - bnbRequired);
            }
            
            totalPenalty = bnbPenalty;
        }
        
        // 检查是否达到分享总量1:1
        if (user.totalClaimed < user.amount) {
            // 未达1:1，额外烧30%
            uint256 additionalBurn = (returnAmount * 3000) / 10000; // 30%
            returnAmount -= additionalBurn;
            
            if (additionalBurn > 0) {
                require(hcfToken.transfer(address(0xdead), additionalBurn), "Additional burn failed");
            }
            
            totalPenalty += additionalBurn;
        }
        
        // 更新用户和等级信息
        user.amount -= _amount;
        stakingLevels[user.levelId].totalStaked -= _amount;
        
        // 如果完全退出，重置用户状态
        if (user.amount == 0) {
            user.isLP = false;
            user.compoundCount = 0;
        }
        
        // 转移剩余代币给用户
        require(hcfToken.transfer(msg.sender, returnAmount), "Transfer failed");
        
        emit Unstaked(msg.sender, _amount, totalPenalty);
    }
    
    /**
     * @dev 领取奖励 - 扣5% BNB手续费
     */
    function claimRewards() external nonReentrant payable {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount > 0, "No staked amount");
        
        uint256 pending = calculatePendingRewards(msg.sender);
        require(pending > 0, "No rewards to claim");
        
        // 计算5% BNB手续费
        uint256 bnbFee = (pending * 500) / 10000; // 5%
        uint256 bnbRequired = (bnbFee * 1e15) / (10**18); // 转换为BNB（简化计算）
        
        // 检查用户是否支付了足够的BNB
        require(msg.value >= bnbRequired, "Insufficient BNB for claim fee (5%)");
        
        // 如果支付过多，退还多余的
        if (msg.value > bnbRequired) {
            payable(msg.sender).transfer(msg.value - bnbRequired);
        }
        
        // BNB手续费发送到owner（后续可以设置专门的费用接收地址）
        if (bnbRequired > 0) {
            payable(owner()).transfer(bnbRequired);
        }
        
        // 执行领取
        _claimRewards(msg.sender);
    }
    
    function _claimRewards(address _user) internal {
        UserInfo storage user = userInfo[_user];
        require(user.amount > 0, "No staked amount");
        
        uint256 pending = calculatePendingRewards(_user);
        if (pending == 0) return;
        
        user.lastClaim = block.timestamp;
        user.totalClaimed += pending;
        
        // Check and update cycle
        _checkCycleCompletion(_user, pending);
        
        // Mint rewards from mining pool
        hcfToken.releaseMiningRewards(_user, pending);
        
        // Distribute referral rewards if referral contract is set
        if (address(referralContract) != address(0)) {
            try referralContract.distributeReferralRewards(_user, pending) {} catch {}
            try referralContract.distributeTeamRewards(_user, pending) {} catch {}
        }
        
        emit RewardsClaimed(_user, pending);
    }
    
    function calculatePendingRewards(address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        if (user.amount == 0) return 0;
        
        StakingLevel storage level = stakingLevels[user.levelId];
        uint256 timeDiff = block.timestamp - user.lastClaim;
        
        // 获取对应的日化率
        uint256 currentRate = user.isLP ? level.lpRate : level.baseRate;
        
        // 计算基础奖励
        uint256 baseReward = (user.amount * currentRate * timeDiff) / (86400 * 10000);
        
        // 应用减产机制
        if (productionReductionRate > 0) {
            baseReward = (baseReward * (10000 - productionReductionRate)) / 10000;
        }
        
        // LP模式墝外系数: 使用lpRate而非系数
        // 已经在currentRate中应用了LP翻倍机制
        // 再应用 1:5 额外增益 (lpCoefficient = 500 = 5倍)
        if (user.isLP) {
            baseReward = (baseReward * level.lpCoefficient) / 100;
        }
        
        // 应用复投倍数 (按照等级设定)
        if (user.compoundCount > 0) {
            baseReward = baseReward * 100; // 100倍增益
        }
        
        return baseReward;
    }
    
    function _checkCycleCompletion(address _user, uint256 _rewardAmount) internal {
        UserInfo storage user = userInfo[_user];
        
        // 检查复投机制 (按照等级复投倍数)
        StakingLevel storage level = stakingLevels[user.levelId];
        if (user.totalClaimed >= level.compoundUnit && user.compoundCount == 0) {
            user.compoundCount = 1;
            emit CycleCompleted(_user, user.compoundCount);
        }
    }
    
    function _checkPurchaseLimit(UserInfo storage user, uint256 _amount) internal view {
        // Check weekly deposit limit
        uint256 weeklyLimit = DAILY_PURCHASE_LIMIT * 7;
        require(_amount <= DAILY_PURCHASE_LIMIT, "Exceeds daily limit");
        
        if (block.timestamp - user.lastDepositTime < PURCHASE_LIMIT_PERIOD) {
            require(user.weeklyDeposited + _amount <= weeklyLimit, "Exceeds weekly limit");
        }
    }
    
    function _updateWeeklyDeposit(UserInfo storage user, uint256 _amount) internal {
        if (block.timestamp - user.lastDepositTime >= PURCHASE_LIMIT_PERIOD) {
            user.weeklyDeposited = _amount;
        } else {
            user.weeklyDeposited += _amount;
        }
    }
    
    function _autoCompoundLP(address _user) internal {
        UserInfo storage user = userInfo[_user];
        if (!user.isLP) return;
        
        uint256 pending = calculatePendingRewards(_user);
        if (pending == 0) return;
        
        // Auto-add to LP (simplified - in practice would interact with DEX)
        user.amount += pending;
        stakingLevels[user.levelId].totalStaked += pending;
        
        // Mint the rewards for compounding
        hcfToken.releaseMiningRewards(address(this), pending);
        
        emit LPAutoCompound(_user, pending);
    }
    
    // USDC Withdrawal (replacing BSDT with slippage)
    function withdrawToUSDC(uint256 _hcfAmount, uint256 _minUSDCOut) external nonReentrant {
        require(_hcfAmount > 0, "Amount must be positive");
        require(hcfToken.balanceOf(msg.sender) >= _hcfAmount, "Insufficient HCF balance");
        
        // Calculate USDC amount with slippage (0.99-1.00 range)
        uint256 usdcAmount = (_hcfAmount * MIN_SLIPPAGE) / MAX_SLIPPAGE;
        require(usdcAmount >= _minUSDCOut, "Slippage too high");
        require(usdcToken.balanceOf(address(this)) >= usdcAmount, "Insufficient USDC liquidity");
        
        // Transfer HCF from user to contract
        require(hcfToken.transferFrom(msg.sender, address(this), _hcfAmount), "HCF transfer failed");
        
        // Transfer USDC to user
        require(usdcToken.transfer(msg.sender, usdcAmount), "USDC transfer failed");
    }
    
    // Admin Functions
    function updateLevelRates(uint256 _levelId, uint256 _baseRate, uint256 _lpRate) external onlyOwner {
        require(_levelId < 5, "Invalid level ID");
        require(_baseRate > 0, "Base rate must be positive");
        require(_lpRate > 0, "LP rate must be positive");
        
        stakingLevels[_levelId].baseRate = _baseRate;
        stakingLevels[_levelId].lpRate = _lpRate;
        emit LevelRateUpdated(_levelId, _baseRate, _lpRate);
    }
    
    function setLevelActive(uint256 _levelId, bool _active) external onlyOwner {
        require(_levelId < 5, "Invalid level ID");
        stakingLevels[_levelId].active = _active;
    }
    
    function setStakingEnabled(bool _enabled) external onlyOwner {
        stakingEnabled = _enabled;
    }
    
    function updateCycleConfig(uint256 _baseMultiplier, uint256 _bonusMultiplier, uint256 _threshold) external onlyOwner {
        cycleConfig.baseMultiplier = _baseMultiplier;
        cycleConfig.bonusMultiplier = _bonusMultiplier;
        cycleConfig.cycleThreshold = _threshold;
    }
    
    function setLPToken(address _token, bool _isLP) external onlyOwner {
        isLPToken[_token] = _isLP;
    }
    
    function setReferralContract(address _referralContract) external onlyOwner {
        referralContract = IHCFReferral(_referralContract);
    }
    
    function setEquityLPCollector(address _collector) external onlyOwner {
        equityLPCollector = _collector;
    }
    
    // Emergency functions
    function emergencyWithdraw() external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount > 0, "No staked amount");
        
        uint256 amount = user.amount;
        user.amount = 0;
        stakingLevels[user.levelId].totalStaked -= amount;
        
        // Emergency withdrawal with higher penalty (50%)
        uint256 penaltyAmount = amount / 2;
        uint256 returnAmount = amount - penaltyAmount;
        
        require(hcfToken.transfer(msg.sender, returnAmount), "Transfer failed");
        require(hcfToken.transfer(address(0xdead), penaltyAmount), "Burn failed");
    }
    
    function adminWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(owner(), _amount);
    }
    
    // View Functions
    function getUserInfo(address _user) external view returns (
        uint256 amount,
        uint256 levelId,
        uint256 pendingRewards,
        uint256 totalClaimed,
        bool isLP,
        uint256 compoundCount,
        bool isEquityLP,
        uint256 lpHCFAmount,
        uint256 lpBSDTAmount
    ) {
        UserInfo storage user = userInfo[_user];
        return (
            user.amount,
            user.levelId,
            calculatePendingRewards(_user),
            user.totalClaimed,
            user.isLP,
            user.compoundCount,
            user.isEquityLP,
            user.lpHCFAmount,
            user.lpBSDTAmount
        );
    }
    
    function getLevelInfo(uint256 _levelId) external view returns (
        uint256 minAmount,
        uint256 baseRate,
        uint256 lpRate,
        uint256 compoundUnit,
        uint256 lpCoefficient,
        uint256 totalStaked,
        bool active
    ) {
        require(_levelId < 5, "Invalid level ID");
        StakingLevel storage level = stakingLevels[_levelId];
        
        return (
            level.minAmount,
            level.baseRate,
            level.lpRate,
            level.compoundUnit,
            level.lpCoefficient,
            level.totalStaked,
            level.active
        );
    }
    
    function getTotalStaked() external view returns (uint256 total) {
        for (uint256 i = 0; i < 5; i++) {
            total += stakingLevels[i].totalStaked;
        }
    }
}