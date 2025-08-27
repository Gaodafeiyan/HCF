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

interface IHCFStaking {
    function getUserInfo(address user) external view returns (uint256 amount, bool isLP);
    function updateReferralReward(address user, uint256 reward) external;
    function calculateStaticRatio(address user) external view returns (uint256);
}

/**
 * @title HCFReferral
 * @dev HCF推荐/团队系统合约
 * 
 * 功能包括:
 * - 20级推荐体系 (20%~2% 递减奖励)
 * - V1-V6团队等级系统 (6%-36% 团队奖励)
 * - 直推解锁机制
 * - 推荐燃烧机制
 * - 团队业绩统计
 */
contract HCFReferral is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IHCFStaking public hcfStaking;
    
    // ============ 推荐系统数据结构 ============
    
    struct UserData {
        address referrer;           // 推荐人
        uint256 directCount;        // 直推人数
        uint256 teamLevel;          // 团队等级 (V1-V6)
        uint256 personalVolume;     // 个人业绩
        uint256 teamVolume;         // 团队业绩
        uint256 totalReferralReward; // 累计推荐奖励
        uint256 totalTeamReward;    // 累计团队奖励
        bool isActive;              // 是否激活
        uint256 joinTime;           // 加入时间
        uint256 lastRewardTime;     // 最后奖励时间
    }
    
    struct TeamLevelConfig {
        uint256 directRequirement;    // 直推要求
        uint256 teamVolumeRequirement; // 小区业绩要求
        uint256 rewardRate;           // 团队奖励率 (basis points)
        bool unlockRequired;          // 是否需要下级V级解锁
    }
    
    // ============ 映射存储 ============
    
    mapping(address => UserData) public users;
    mapping(address => address[]) public directReferrals; // 直推列表
    mapping(uint256 => TeamLevelConfig) public teamLevelConfigs; // V1-V6配置
    mapping(uint256 => uint256) public depositReferralRates; // 入金推荐奖励费率
    mapping(uint256 => uint256) public staticReferralRates; // 静态收益推荐奖励费率
    
    // ============ 系统参数 ============
    
    uint256 public constant MAX_REFERRAL_LEVELS = 20;
    uint256 public constant MAX_TEAM_LEVEL = 6;
    
    // 燃烧机制参数
    uint256 public referralBurnRate = 1000; // 10% 推荐奖励燃烧
    uint256 public teamBurnRate = 500;      // 5% 团队奖励燃烧
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // 激活要求
    uint256 public activationStakeAmount = 100 * 10**18; // 100 HCF激活
    
    // 封顶机制 - 日产出封顶
    uint256 public dailyYieldCap = 10000; // 100% 日产出封顶（相对于质押量）
    bool public yieldCapEnabled = true;    // 是否启用封顶
    
    // 特定烧伤率（可投票调整）
    uint256 public volatilityBurnRate = 500;  // 5% 波动烧伤
    uint256 public tradingBurnRate = 100;     // 1% 交易烧伤
    uint256 public timedBurnRate = 100;       // 1% 定时烧伤
    address public multiSigWallet;            // 多签钱包（用于投票调整）
    
    // 动态收益比例控制
    uint256 public constant BASE_DYNAMIC_RATIO = 5000;  // 基础动态比50%
    uint256 public constant MAX_DYNAMIC_RATIO = 10000;  // 最大动态比100%
    IHCFStaking public stakingContract;  // 用于获取静态比例
    
    // ============ 事件 ============
    
    event ReferrerSet(address indexed user, address indexed referrer);
    event ReferralRewardDistributed(address indexed user, address indexed referrer, uint256 level, uint256 amount);
    event TeamRewardDistributed(address indexed user, uint256 level, uint256 amount);
    event TeamLevelUpgraded(address indexed user, uint256 newLevel);
    event UserActivated(address indexed user, address indexed referrer);
    event RewardBurned(address indexed user, uint256 amount, string rewardType);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _hcfStaking
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        hcfStaking = IHCFStaking(_hcfStaking);
        
        _initializeReferralRates();
        _initializeTeamLevelConfigs();
    }
    
    // ============ 初始化配置 ============
    
    function _initializeReferralRates() private {
        // 入金推荐奖励 (烧伤限制)
        depositReferralRates[1] = 500;  // 一代5%
        depositReferralRates[2] = 300;  // 二代3%
        // 3-20代无入金奖励
        
        // 静态收益推荐奖励 (V3/V4解锁, 烧10%)
        staticReferralRates[1] = 2000;  // 一代20%
        staticReferralRates[2] = 1000;  // 二代10%
        
        // 3-8级各5% (V3解锁6-8代)
        for (uint256 i = 3; i <= 8; i++) {
            staticReferralRates[i] = 500; // 5%
        }
        
        // 9-15级各3% (V4解锁9-15代)
        for (uint256 i = 9; i <= 15; i++) {
            staticReferralRates[i] = 300; // 3%
        }
        
        // 16-20级各2%
        for (uint256 i = 16; i <= 20; i++) {
            staticReferralRates[i] = 200; // 2%
        }
    }
    
    function _initializeTeamLevelConfigs() private {
        // V1: 6% 团队奖励, 小区2000 HCF, 需要下级V1 (烧5%)
        teamLevelConfigs[1] = TeamLevelConfig(0, 2000 * 10**18, 600, true);
        
        // V2: 12% 团队奖励, 小区20000 HCF, 需要下级V2 (烧5%)
        teamLevelConfigs[2] = TeamLevelConfig(0, 20000 * 10**18, 1200, true);
        
        // V3: 18% 团队奖励, 小区100000 HCF, 需要下级V3 (烧5%, 解锁6-8代)
        teamLevelConfigs[3] = TeamLevelConfig(0, 100000 * 10**18, 1800, true);
        
        // V4: 24% 团队奖励, 小区1000000 HCF, 需要下级V4 (烧5%, 解锁9-15代)
        teamLevelConfigs[4] = TeamLevelConfig(0, 1000000 * 10**18, 2400, true);
        
        // V5: 30% 团队奖励, 小区8000000 HCF, 需要下级V5 (烧5%)
        teamLevelConfigs[5] = TeamLevelConfig(0, 8000000 * 10**18, 3000, true);
        
        // V6: 36% 团队奖励, 小区20000000 HCF, 需要下级V6 (烧5%)
        teamLevelConfigs[6] = TeamLevelConfig(0, 20000000 * 10**18, 3600, true);
    }
    
    // ============ 推荐绑定功能 ============
    
    function setReferrer(address referrer) external {
        require(referrer != address(0), "Invalid referrer");
        require(referrer != msg.sender, "Cannot refer yourself");
        require(users[msg.sender].referrer == address(0), "Already has referrer");
        require(users[referrer].isActive, "Referrer not activated");
        
        users[msg.sender].referrer = referrer;
        users[msg.sender].joinTime = block.timestamp;
        
        // 添加到推荐人的直推列表
        directReferrals[referrer].push(msg.sender);
        users[referrer].directCount++;
        
        emit ReferrerSet(msg.sender, referrer);
    }
    
    
    // ============ 用户激活功能 ============
    
    function activateUser() external nonReentrant {
        require(!users[msg.sender].isActive, "Already activated");
        
        // 检查质押要求
        (uint256 stakedAmount, ) = hcfStaking.getUserInfo(msg.sender);
        require(stakedAmount >= activationStakeAmount, "Insufficient staking for activation");
        
        users[msg.sender].isActive = true;
        users[msg.sender].joinTime = block.timestamp;
        
        emit UserActivated(msg.sender, users[msg.sender].referrer);
        
        // 自动检查团队等级升级
        _checkAndUpgradeTeamLevel(msg.sender);
    }
    
    // ============ 入金奖励分发 ============
    
    /**
     * @dev 分发入金奖励 - 一代5%，二代3%
     */
    function distributeDepositRewards(address user, uint256 depositAmount) external nonReentrant {
        require(msg.sender == address(hcfStaking), "Only staking contract can distribute");
        require(users[user].isActive, "User not activated");
        
        // 一代5%奖励
        address firstGen = users[user].referrer;
        if (firstGen != address(0) && users[firstGen].isActive) {
            uint256 firstGenReward = (depositAmount * 500) / 10000; // 5%
            if (firstGenReward > 0) {
                // 应用烧伤机制
                uint256 burnAmount = (firstGenReward * referralBurnRate) / 10000;
                uint256 netReward = firstGenReward - burnAmount;
                
                if (netReward > 0) {
                    hcfToken.transfer(firstGen, netReward);
                    users[firstGen].totalReferralReward += netReward;
                }
                
                if (burnAmount > 0) {
                    hcfToken.transfer(BURN_ADDRESS, burnAmount);
                    emit RewardBurned(firstGen, burnAmount, "deposit");
                }
            }
        }
        
        // 二代3%奖励
        if (firstGen != address(0)) {
            address secondGen = users[firstGen].referrer;
            if (secondGen != address(0) && users[secondGen].isActive) {
                uint256 secondGenReward = (depositAmount * 300) / 10000; // 3%
                if (secondGenReward > 0) {
                    // 应用烧伤机制
                    uint256 burnAmount = (secondGenReward * referralBurnRate) / 10000;
                    uint256 netReward = secondGenReward - burnAmount;
                    
                    if (netReward > 0) {
                        hcfToken.transfer(secondGen, netReward);
                        users[secondGen].totalReferralReward += netReward;
                    }
                    
                    if (burnAmount > 0) {
                        hcfToken.transfer(BURN_ADDRESS, burnAmount);
                        emit RewardBurned(secondGen, burnAmount, "deposit");
                    }
                }
            }
        }
    }
    
    // ============ 推荐奖励分发 ============
    
    /**
     * @dev 分发入金推荐奖励 - 只给1-2代
     * 一代5%，二代3%（烧伤限制）
     */
    function distributeDepositRewards(address user, uint256 depositAmount) external nonReentrant {
        require(msg.sender == address(hcfStaking), "Only staking contract can distribute");
        require(users[user].isActive, "User not activated");
        
        address currentReferrer = users[user].referrer;
        
        for (uint256 level = 1; level <= 2 && currentReferrer != address(0); level++) {
            if (!users[currentReferrer].isActive) {
                currentReferrer = users[currentReferrer].referrer;
                continue;
            }
            
            uint256 rewardRate = depositReferralRates[level];
            if (rewardRate > 0) {
                uint256 referralReward = (depositAmount * rewardRate) / 10000;
                
                // 烧伤限制：奖励不能超过推荐人自己的质押量
                (uint256 referrerStaked, ) = hcfStaking.getUserInfo(currentReferrer);
                if (referralReward > referrerStaked) {
                    referralReward = referrerStaked;
                }
                
                if (referralReward > 0) {
                    hcfToken.transfer(currentReferrer, referralReward);
                    users[currentReferrer].totalReferralReward += referralReward;
                    
                    emit ReferralRewardDistributed(user, currentReferrer, level, referralReward);
                }
            }
            
            currentReferrer = users[currentReferrer].referrer;
        }
    }
    
    /**
     * @dev 分发静态产出奖励 - 按文档要求的代数限制
     * 一代20%，二代10%，3-8代5%（V3解锁），9-15代3%（V4解锁），16-20代2%（V4解锁）
     * 烧10%
     */
    function distributeReferralRewards(address user, uint256 rewardAmount) external nonReentrant {
        require(msg.sender == address(hcfStaking), "Only staking contract can distribute");
        require(users[user].isActive, "User not activated");
        
        // 应用日产出封顶
        if (yieldCapEnabled) {
            (uint256 stakedAmount, ) = hcfStaking.getUserInfo(user);
            uint256 dailyCap = (stakedAmount * dailyYieldCap) / 10000;
            if (rewardAmount > dailyCap) {
                rewardAmount = dailyCap; // 封顶处理
            }
        }
        
        address currentReferrer = users[user].referrer;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS && currentReferrer != address(0); level++) {
            if (!users[currentReferrer].isActive) {
                currentReferrer = users[currentReferrer].referrer;
                continue;
            }
            
            // 检查代数限制和解锁条件
            bool canReceive = false;
            uint256 rewardRate = staticReferralRates[level];
            
            if (level <= 2) {
                // 1-2代直接获得
                canReceive = true;
            } else if (level >= 3 && level <= 8) {
                // 3-8代需要V3解锁
                canReceive = users[currentReferrer].teamLevel >= 3;
            } else if (level >= 9 && level <= 15) {
                // 9-15代需要V4解锁
                canReceive = users[currentReferrer].teamLevel >= 4;
            } else if (level >= 16 && level <= 20) {
                // 16-20代需要V4解锁
                canReceive = users[currentReferrer].teamLevel >= 4;
            }
            
            if (!canReceive) {
                currentReferrer = users[currentReferrer].referrer;
                continue;
            }
            
            uint256 referralReward = (rewardAmount * rewardRate) / 10000;
            
            // 应用动态收益比例
            referralReward = calculateActualDynamicReward(currentReferrer, referralReward);
            
            if (referralReward > 0) {
                // 计算燃烧部分
                uint256 burnAmount = (referralReward * referralBurnRate) / 10000;
                uint256 netReward = referralReward - burnAmount;
                
                // 发放净奖励
                if (netReward > 0) {
                    hcfToken.transfer(currentReferrer, netReward);
                    users[currentReferrer].totalReferralReward += netReward;
                    
                    emit ReferralRewardDistributed(user, currentReferrer, level, netReward);
                }
                
                // 燃烧部分
                if (burnAmount > 0) {
                    hcfToken.transfer(BURN_ADDRESS, burnAmount);
                    emit RewardBurned(currentReferrer, burnAmount, "referral");
                }
            }
            
            // 更新推荐人的个人业绩
            users[currentReferrer].personalVolume += rewardAmount;
            
            // 检查团队等级升级
            _checkAndUpgradeTeamLevel(currentReferrer);
            
            currentReferrer = users[currentReferrer].referrer;
        }
    }
    
    // ============ 团队奖励分发 ============
    
    function distributeTeamRewards(address user, uint256 rewardAmount) external nonReentrant {
        require(msg.sender == address(hcfStaking), "Only staking contract can distribute");
        require(users[user].isActive, "User not activated");
        
        // 只给有团队等级的用户发放团队奖励
        if (users[user].teamLevel > 0) {
            TeamLevelConfig memory config = teamLevelConfigs[users[user].teamLevel];
            uint256 teamReward = (rewardAmount * config.rewardRate) / 10000;
            
            // 应用动态收益比例
            teamReward = calculateActualDynamicReward(user, teamReward);
            
            if (teamReward > 0) {
                // 计算燃烧部分
                uint256 burnAmount = (teamReward * teamBurnRate) / 10000;
                uint256 netReward = teamReward - burnAmount;
                
                // 发放净奖励
                if (netReward > 0) {
                    hcfToken.transfer(user, netReward);
                    users[user].totalTeamReward += netReward;
                    
                    emit TeamRewardDistributed(user, users[user].teamLevel, netReward);
                }
                
                // 燃烧部分
                if (burnAmount > 0) {
                    hcfToken.transfer(BURN_ADDRESS, burnAmount);
                    emit RewardBurned(user, burnAmount, "team");
                }
            }
        }
    }
    
    // ============ 团队等级管理 ============
    
    function _checkAndUpgradeTeamLevel(address user) private {
        uint256 currentLevel = users[user].teamLevel;
        
        // 计算小区业绩 (包括下级的业绩)
        uint256 totalTeamVolume = _calculateTeamVolume(user);
        users[user].teamVolume = totalTeamVolume;
        
        // 检查是否可以升级到更高等级
        for (uint256 level = currentLevel + 1; level <= MAX_TEAM_LEVEL; level++) {
            TeamLevelConfig memory config = teamLevelConfigs[level];
            
            // 检查基本条件
            bool meetsBasicRequirements = users[user].directCount >= config.directRequirement && 
                                         totalTeamVolume >= config.teamVolumeRequirement;
            
            if (!meetsBasicRequirements) {
                break; // 不满足基本条件
            }
            
            // 检查是否需要下级V级解锁
            if (config.unlockRequired) {
                bool hasRequiredSubLevel = _checkSubordinateLevel(user, level);
                if (!hasRequiredSubLevel) {
                    break; // 没有所需的下级V级
                }
            }
            
            users[user].teamLevel = level;
            emit TeamLevelUpgraded(user, level);
        }
    }
    
    function _checkSubordinateLevel(address user, uint256 requiredLevel) private view returns (bool) {
        address[] memory directs = directReferrals[user];
        uint256 subordinatesWithLevel = 0;
        
        // V1需要1个V1下级，V2需要2个V2下级，以此类推
        uint256 requiredSubordinates = requiredLevel;
        
        for (uint256 i = 0; i < directs.length; i++) {
            if (users[directs[i]].teamLevel >= requiredLevel) {
                subordinatesWithLevel++;
                if (subordinatesWithLevel >= requiredSubordinates) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    function _calculateTeamVolume(address user) private view returns (uint256) {
        uint256 totalVolume = users[user].personalVolume;
        
        // 递归计算所有下级的业绩 (限制深度避免无限递归)
        address[] memory directs = directReferrals[user];
        for (uint256 i = 0; i < directs.length; i++) {
            totalVolume += _calculateTeamVolumeRecursive(directs[i], 0);
        }
        
        return totalVolume;
    }
    
    function _calculateTeamVolumeRecursive(address user, uint256 depth) private view returns (uint256) {
        if (depth >= MAX_REFERRAL_LEVELS) return 0; // 限制递归深度
        
        uint256 volume = users[user].personalVolume;
        
        address[] memory directs = directReferrals[user];
        for (uint256 i = 0; i < directs.length; i++) {
            volume += _calculateTeamVolumeRecursive(directs[i], depth + 1);
        }
        
        return volume;
    }
    
    // ============ 管理员功能 ============
    
    function updateTeamLevelConfig(
        uint256 level,
        uint256 directRequirement,
        uint256 teamVolumeRequirement,
        uint256 rewardRate,
        bool unlockRequired
    ) external onlyOwner {
        require(level > 0 && level <= MAX_TEAM_LEVEL, "Invalid team level");
        require(rewardRate <= 5000, "Reward rate too high"); // 最大50%
        
        teamLevelConfigs[level] = TeamLevelConfig(
            directRequirement,
            teamVolumeRequirement,
            rewardRate,
            unlockRequired
        );
    }
    
    function updateReferralRate(uint256 level, uint256 rate) external onlyOwner {
        require(level > 0 && level <= MAX_REFERRAL_LEVELS, "Invalid level");
        require(rate <= 3000, "Rate too high"); // 最大30%
        
        referralRates[level] = rate;
    }
    
    function updateBurnRates(uint256 _referralBurnRate, uint256 _teamBurnRate) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_referralBurnRate <= 5000, "Burn rate too high"); // 最大50%
        require(_teamBurnRate <= 5000, "Burn rate too high");
        
        referralBurnRate = _referralBurnRate;
        teamBurnRate = _teamBurnRate;
    }
    
    /**
     * @dev 投票调整特定烧伤率（需要多签）
     */
    function voteOnSpecialBurnRates(
        uint256 _volatilityBurn,
        uint256 _tradingBurn,
        uint256 _timedBurn
    ) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_volatilityBurn <= 1000, "Volatility burn too high"); // 最大10%
        require(_tradingBurn <= 500, "Trading burn too high");       // 最大5%
        require(_timedBurn <= 500, "Timed burn too high");           // 最大5%
        
        volatilityBurnRate = _volatilityBurn;
        tradingBurnRate = _tradingBurn;
        timedBurnRate = _timedBurn;
    }
    
    /**
     * @dev 设置日产出封顶
     */
    function setDailyYieldCap(uint256 _cap, bool _enabled) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_cap <= 20000, "Cap too high"); // 最大200%
        
        dailyYieldCap = _cap;
        yieldCapEnabled = _enabled;
    }
    
    function setMultiSigWallet(address _multiSig) external onlyOwner {
        require(_multiSig != address(0), "Invalid multisig address");
        multiSigWallet = _multiSig;
    }
    
    function updateActivationStakeAmount(uint256 amount) external onlyOwner {
        activationStakeAmount = amount;
    }
    
    function setHCFStaking(address _hcfStaking) external onlyOwner {
        hcfStaking = IHCFStaking(_hcfStaking);
    }
    
    // ============ 小区验证功能 ============
    
    /**
     * @dev 检查用户是否有有效的小区（不是单条线）
     * 无小区、零业绩或单条线无法进入小区排名奖
     */
    function hasValidCommunity(address user) public view returns (bool) {
        // 检查是否有小区（至少有直推）
        if (users[user].directCount == 0) {
            return false; // 无小区
        }
        
        // 检查团队业绩
        if (users[user].teamVolume == 0) {
            return false; // 零业绩
        }
        
        // 检查是否单条线（需要至少2条活跃线）
        uint256 activeLines = 0;
        address[] memory directs = directReferrals[user];
        
        for (uint256 i = 0; i < directs.length; i++) {
            // 如果下级有团队业绩，算作一条活跃线
            if (users[directs[i]].teamVolume > 0 || users[directs[i]].personalVolume > 0) {
                activeLines++;
            }
        }
        
        // 至少需要2条活跃线才不是单条线
        return activeLines >= 2;
    }
    
    /**
     * @dev 获取用户的小区业绩（用于排名）
     */
    function getCommunityPerformance(address user) public view returns (uint256) {
        if (!hasValidCommunity(user)) {
            return 0; // 无有效小区，业绩为0
        }
        
        // 小区业绩 = 团队总业绩
        return users[user].teamVolume;
    }
    
    /**
     * @dev 检查用户是否可以参与小区排名奖
     */
    function canParticipateInCommunityRanking(address user) external view returns (bool canParticipate, string memory reason) {
        if (users[user].directCount == 0) {
            return (false, "No community (no direct referrals)");
        }
        
        if (users[user].teamVolume == 0) {
            return (false, "Zero performance");
        }
        
        // 检查活跃线数量
        uint256 activeLines = 0;
        address[] memory directs = directReferrals[user];
        
        for (uint256 i = 0; i < directs.length; i++) {
            if (users[directs[i]].teamVolume > 0 || users[directs[i]].personalVolume > 0) {
                activeLines++;
            }
        }
        
        if (activeLines < 2) {
            return (false, "Single line structure (need at least 2 active lines)");
        }
        
        return (true, "Eligible for community ranking");
    }
    
    // ============ 动态收益比例功能 ============
    
    /**
     * @dev 获取用户动态收益比例（基于静态比例）
     * @param _user 用户地址
     * @return dynamicRatio 动态收益比例 (10000 = 100%)
     */
    function getDynamicRatio(address _user) public view returns (uint256 dynamicRatio) {
        // 获取用户的静态比例
        uint256 staticRatio = 5000; // 默认50%
        if (address(stakingContract) != address(0)) {
            try stakingContract.calculateStaticRatio(_user) returns (uint256 ratio) {
                staticRatio = ratio;
            } catch {
                // 如果调用失败，使用默认值
            }
        }
        
        // 动态比例 = max(50%, min(100%, 50% + (静态比 - 50%)))
        // 简化为：动态比例 = 静态比例（因为公式结果相同）
        dynamicRatio = staticRatio;
        
        // 确保在范围内
        if (dynamicRatio < BASE_DYNAMIC_RATIO) {
            dynamicRatio = BASE_DYNAMIC_RATIO;
        }
        if (dynamicRatio > MAX_DYNAMIC_RATIO) {
            dynamicRatio = MAX_DYNAMIC_RATIO;
        }
        
        return dynamicRatio;
    }
    
    /**
     * @dev 计算实际动态收益（考虑动态比例）
     * @param _user 用户地址
     * @param _baseReward 基础收益（二十代/团队级差总和）
     * @return actualReward 实际收益
     */
    function calculateActualDynamicReward(address _user, uint256 _baseReward) public view returns (uint256) {
        uint256 dynamicRatio = getDynamicRatio(_user);
        return (_baseReward * dynamicRatio) / 10000;
    }
    
    /**
     * @dev 获取动态收益显示信息（供前端使用）
     * @param _user 用户地址
     * @param _baseReward 基础100%收益量
     * @return fullReward 100%收益量
     * @return currentRatio 当前比例
     * @return actualReward 实际收益量
     */
    function getDynamicRewardDisplay(address _user, uint256 _baseReward) external view returns (
        uint256 fullReward,    // 100%收益量
        uint256 currentRatio,  // 当前比例
        uint256 actualReward   // 实际收益量
    ) {
        fullReward = _baseReward;
        currentRatio = getDynamicRatio(_user);
        actualReward = calculateActualDynamicReward(_user, _baseReward);
        
        return (fullReward, currentRatio, actualReward);
    }
    
    /**
     * @dev 设置质押合约地址（仅owner）
     */
    function setStakingContract(address _staking) external onlyOwner {
        stakingContract = IHCFStaking(_staking);
    }
    
    // ============ 查询功能 ============
    
    function getUserData(address user) external view returns (UserData memory) {
        return users[user];
    }
    
    function getDirectReferrals(address user) external view returns (address[] memory) {
        return directReferrals[user];
    }
    
    function getReferralPath(address user) external view returns (address[] memory) {
        address[] memory path = new address[](MAX_REFERRAL_LEVELS);
        address current = users[user].referrer;
        uint256 length = 0;
        
        while (current != address(0) && length < MAX_REFERRAL_LEVELS) {
            path[length] = current;
            current = users[current].referrer;
            length++;
        }
        
        // 调整数组大小
        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = path[i];
        }
        
        return result;
    }
    
    function calculatePotentialReferralReward(address user, uint256 baseReward) external view returns (uint256) {
        if (!users[user].isActive || users[user].referrer == address(0)) {
            return 0;
        }
        
        uint256 totalReward = 0;
        address currentReferrer = users[user].referrer;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS && currentReferrer != address(0); level++) {
            if (users[currentReferrer].isActive) {
                uint256 referralReward = (baseReward * referralRates[level]) / 10000;
                uint256 netReward = referralReward - (referralReward * referralBurnRate) / 10000;
                totalReward += netReward;
            }
            currentReferrer = users[currentReferrer].referrer;
        }
        
        return totalReward;
    }
    
    function calculatePotentialTeamReward(address user, uint256 baseReward) external view returns (uint256) {
        if (!users[user].isActive || users[user].teamLevel == 0) {
            return 0;
        }
        
        TeamLevelConfig memory config = teamLevelConfigs[users[user].teamLevel];
        uint256 teamReward = (baseReward * config.rewardRate) / 10000;
        uint256 netReward = teamReward - (teamReward * teamBurnRate) / 10000;
        
        return netReward;
    }
    
    // ============ 紧急功能 ============
    
    /**
     * @dev 应用特定事件烧伤（波动/交易/定时）
     */
    function applyEventBurn(uint256 amount, string memory eventType) external returns (uint256) {
        require(msg.sender == address(hcfStaking) || msg.sender == owner(), "Unauthorized");
        
        uint256 burnAmount = 0;
        
        if (keccak256(bytes(eventType)) == keccak256(bytes("volatility"))) {
            burnAmount = (amount * volatilityBurnRate) / 10000;
        } else if (keccak256(bytes(eventType)) == keccak256(bytes("trading"))) {
            burnAmount = (amount * tradingBurnRate) / 10000;
        } else if (keccak256(bytes(eventType)) == keccak256(bytes("timed"))) {
            burnAmount = (amount * timedBurnRate) / 10000;
        }
        
        if (burnAmount > 0) {
            hcfToken.transfer(BURN_ADDRESS, burnAmount);
            emit RewardBurned(msg.sender, burnAmount, eventType);
        }
        
        return amount - burnAmount;
    }
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}