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
    
    // Staking Pool Levels
    struct PoolInfo {
        uint256 dailyRate;      // Daily rate in basis points (40 = 0.4%)
        uint256 minAmount;      // Minimum staking amount
        uint256 maxAmount;      // Maximum staking amount
        uint256 totalStaked;    // Total amount staked in this pool
        bool active;            // Pool active status
    }
    
    // User Staking Info
    struct UserInfo {
        uint256 amount;         // Staked amount
        uint256 poolId;         // Pool ID (0-4 for 5 levels)
        uint256 startTime;      // Staking start timestamp
        uint256 lastClaim;      // Last claim timestamp
        uint256 totalClaimed;   // Total rewards claimed
        bool isLP;              // Is LP staking (gets 2x multiplier)
        uint256 cycleCount;     // Dual cycle count
        uint256 lastDepositTime; // For purchase limit tracking
        uint256 weeklyDeposited; // Weekly deposit tracking
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
    
    // Pool configurations
    PoolInfo[5] public pools;
    mapping(address => UserInfo) public userInfo;
    mapping(address => bool) public isLPToken;
    
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
    mapping(uint256 => uint256) public poolRateMultipliers; // Backend rate adjustments
    
    // Events
    event Staked(address indexed user, uint256 poolId, uint256 amount, bool isLP);
    event Unstaked(address indexed user, uint256 amount, uint256 penalty);
    event RewardsClaimed(address indexed user, uint256 amount);
    event CycleCompleted(address indexed user, uint256 cycleCount);
    event PoolRateUpdated(uint256 poolId, uint256 newRate);
    event LPAutoCompound(address indexed user, uint256 amount);
    
    constructor(
        address _hcfToken,
        address _bsdtToken,
        address _usdcToken
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtToken = IBSDT(_bsdtToken);
        usdcToken = IUSDC(_usdcToken);
        
        // Initialize 5 pool levels
        pools[0] = PoolInfo(40, 100 * 10**18, 1000 * 10**18, 0, true);     // 0.4%
        pools[1] = PoolInfo(80, 1000 * 10**18, 5000 * 10**18, 0, true);    // 0.8%
        pools[2] = PoolInfo(120, 5000 * 10**18, 10000 * 10**18, 0, true);  // 1.2%
        pools[3] = PoolInfo(140, 10000 * 10**18, 50000 * 10**18, 0, true); // 1.4%
        pools[4] = PoolInfo(160, 50000 * 10**18, type(uint256).max, 0, true); // 1.6%
        
        // Initialize dual cycle config
        cycleConfig = CycleInfo(100, 500, 10000 * 10**18); // 1x base, 5x after cycle, 10k threshold
        
        // Initialize pool rate multipliers to 100% (10000 basis points)
        for (uint256 i = 0; i < 5; i++) {
            poolRateMultipliers[i] = 10000;
        }
    }
    
    // Staking Functions
    function stake(uint256 _poolId, uint256 _amount, bool _isLP) external nonReentrant {
        require(stakingEnabled, "Staking disabled");
        require(_poolId < 5, "Invalid pool ID");
        require(_amount > 0, "Amount must be positive");
        require(pools[_poolId].active, "Pool not active");
        require(_amount >= pools[_poolId].minAmount, "Below minimum amount");
        require(_amount <= pools[_poolId].maxAmount, "Above maximum amount");
        
        UserInfo storage user = userInfo[msg.sender];
        
        // Check purchase limits
        _checkPurchaseLimit(user, _amount);
        
        // Transfer HCF tokens from user
        require(hcfToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        // If user has existing stake in different pool, claim rewards first
        if (user.amount > 0 && user.poolId != _poolId) {
            _claimRewards(msg.sender);
        }
        
        // Update user info
        if (user.amount == 0) {
            user.startTime = block.timestamp;
            user.lastClaim = block.timestamp;
            user.poolId = _poolId;
        }
        
        user.amount += _amount;
        user.isLP = _isLP;
        user.lastDepositTime = block.timestamp;
        _updateWeeklyDeposit(user, _amount);
        
        // Update pool info
        pools[_poolId].totalStaked += _amount;
        
        // Auto-compound for LP staking
        if (_isLP) {
            _autoCompoundLP(msg.sender);
        }
        
        emit Staked(msg.sender, _poolId, _amount, _isLP);
    }
    
    function unstake(uint256 _amount) external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "Insufficient staked amount");
        
        // Claim pending rewards first
        _claimRewards(msg.sender);
        
        // Calculate penalties
        uint256 bnbPenalty = (_amount * BNB_PENALTY) / 10000;
        uint256 burnAmount = (_amount * BURN_PENALTY) / 10000;
        uint256 returnAmount = _amount - bnbPenalty - burnAmount;
        
        // Update user and pool info
        user.amount -= _amount;
        pools[user.poolId].totalStaked -= _amount;
        
        // Transfer tokens
        require(hcfToken.transfer(msg.sender, returnAmount), "Transfer failed");
        
        // Burn penalty tokens (send to dead address)
        if (burnAmount > 0) {
            require(hcfToken.transfer(address(0xdead), burnAmount), "Burn failed");
        }
        
        // BNB penalty handling (converted to contract for operations)
        // Note: In practice, this would involve DEX operations to get BNB
        
        emit Unstaked(msg.sender, _amount, bnbPenalty + burnAmount);
    }
    
    function claimRewards() external nonReentrant {
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
        
        PoolInfo storage pool = pools[user.poolId];
        uint256 timeDiff = block.timestamp - user.lastClaim;
        
        // Base daily rate adjusted by backend multiplier
        uint256 adjustedRate = (pool.dailyRate * poolRateMultipliers[user.poolId]) / 10000;
        
        // Calculate base rewards
        uint256 baseReward = (user.amount * adjustedRate * timeDiff) / (86400 * 10000);
        
        // Apply LP multiplier (2x)
        if (user.isLP) {
            baseReward *= 2;
        }
        
        // Apply cycle multiplier
        uint256 multiplier = user.cycleCount > 0 ? cycleConfig.bonusMultiplier : cycleConfig.baseMultiplier;
        baseReward = (baseReward * multiplier) / 100;
        
        return baseReward;
    }
    
    function _checkCycleCompletion(address _user, uint256 _rewardAmount) internal {
        UserInfo storage user = userInfo[_user];
        
        if (user.totalClaimed + _rewardAmount >= cycleConfig.cycleThreshold && user.cycleCount == 0) {
            user.cycleCount = 1;
            emit CycleCompleted(_user, user.cycleCount);
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
        pools[user.poolId].totalStaked += pending;
        
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
    function updatePoolRate(uint256 _poolId, uint256 _newRateMultiplier) external onlyOwner {
        require(_poolId < 5, "Invalid pool ID");
        require(_newRateMultiplier > 0, "Rate must be positive");
        
        poolRateMultipliers[_poolId] = _newRateMultiplier;
        emit PoolRateUpdated(_poolId, _newRateMultiplier);
    }
    
    function setPoolActive(uint256 _poolId, bool _active) external onlyOwner {
        require(_poolId < 5, "Invalid pool ID");
        pools[_poolId].active = _active;
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
    
    // Emergency functions
    function emergencyWithdraw() external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount > 0, "No staked amount");
        
        uint256 amount = user.amount;
        user.amount = 0;
        pools[user.poolId].totalStaked -= amount;
        
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
        uint256 poolId,
        uint256 pendingRewards,
        uint256 totalClaimed,
        bool isLP,
        uint256 cycleCount
    ) {
        UserInfo storage user = userInfo[_user];
        return (
            user.amount,
            user.poolId,
            calculatePendingRewards(_user),
            user.totalClaimed,
            user.isLP,
            user.cycleCount
        );
    }
    
    function getPoolInfo(uint256 _poolId) external view returns (
        uint256 dailyRate,
        uint256 adjustedRate,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 totalStaked,
        bool active
    ) {
        require(_poolId < 5, "Invalid pool ID");
        PoolInfo storage pool = pools[_poolId];
        uint256 adjusted = (pool.dailyRate * poolRateMultipliers[_poolId]) / 10000;
        
        return (
            pool.dailyRate,
            adjusted,
            pool.minAmount,
            pool.maxAmount,
            pool.totalStaked,
            pool.active
        );
    }
    
    function getTotalStaked() external view returns (uint256 total) {
        for (uint256 i = 0; i < 5; i++) {
            total += pools[i].totalStaked;
        }
    }
}