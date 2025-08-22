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
        uint256 teamVolumeRequirement; // 团队业绩要求
        uint256 rewardRate;           // 团队奖励率 (basis points)
        bool unlockRequired;          // 是否需要解锁
    }
    
    // ============ 映射存储 ============
    
    mapping(address => UserData) public users;
    mapping(address => address[]) public directReferrals; // 直推列表
    mapping(uint256 => TeamLevelConfig) public teamLevelConfigs; // V1-V6配置
    mapping(uint256 => uint256) public referralRates; // 20级推荐费率
    
    // ============ 系统参数 ============
    
    uint256 public constant MAX_REFERRAL_LEVELS = 20;
    uint256 public constant MAX_TEAM_LEVEL = 6;
    
    // 燃烧机制参数
    uint256 public referralBurnRate = 1000; // 10% 推荐奖励燃烧
    uint256 public teamBurnRate = 500;      // 5% 团队奖励燃烧
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // 激活要求
    uint256 public activationStakeAmount = 100 * 10**18; // 100 HCF激活
    
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
        // 20级推荐费率: 20% 递减至 2%
        for (uint256 i = 1; i <= MAX_REFERRAL_LEVELS; i++) {
            referralRates[i] = 2000 - (i - 1) * 90; // 20%下降到2% (basis points)
        }
    }
    
    function _initializeTeamLevelConfigs() private {
        // V1: 6% 团队奖励, 需要3个直推, 10000 HCF团队业绩
        teamLevelConfigs[1] = TeamLevelConfig(3, 10000 * 10**18, 600, true);
        
        // V2: 12% 团队奖励, 需要5个直推, 50000 HCF团队业绩
        teamLevelConfigs[2] = TeamLevelConfig(5, 50000 * 10**18, 1200, true);
        
        // V3: 18% 团队奖励, 需要8个直推, 100000 HCF团队业绩
        teamLevelConfigs[3] = TeamLevelConfig(8, 100000 * 10**18, 1800, true);
        
        // V4: 24% 团队奖励, 需要12个直推, 500000 HCF团队业绩
        teamLevelConfigs[4] = TeamLevelConfig(12, 500000 * 10**18, 2400, true);
        
        // V5: 30% 团队奖励, 需要20个直推, 1000000 HCF团队业绩
        teamLevelConfigs[5] = TeamLevelConfig(20, 1000000 * 10**18, 3000, true);
        
        // V6: 36% 团队奖励, 需要30个直推, 5000000 HCF团队业绩
        teamLevelConfigs[6] = TeamLevelConfig(30, 5000000 * 10**18, 3600, true);
    }
    
    // ============ 推荐绑定功能 ============
    
    function setReferrer(address referrer) external {
        require(referrer != address(0), "Invalid referrer");
        require(referrer != msg.sender, "Cannot refer yourself");
        require(users[msg.sender].referrer == address(0), "Already has referrer");
        require(users[referrer].isActive, "Referrer not activated");
        
        // 检查循环推荐
        require(!_isCircularReferral(msg.sender, referrer), "Circular referral detected");
        
        users[msg.sender].referrer = referrer;
        users[msg.sender].joinTime = block.timestamp;
        
        // 添加到推荐人的直推列表
        directReferrals[referrer].push(msg.sender);
        users[referrer].directCount++;
        
        emit ReferrerSet(msg.sender, referrer);
    }
    
    function _isCircularReferral(address user, address potentialReferrer) private view returns (bool) {
        address current = potentialReferrer;
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS && current != address(0); i++) {
            if (current == user) {
                return true;
            }
            current = users[current].referrer;
        }
        return false;
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
    
    // ============ 推荐奖励分发 ============
    
    function distributeReferralRewards(address user, uint256 rewardAmount) external nonReentrant {
        require(msg.sender == address(hcfStaking), "Only staking contract can distribute");
        require(users[user].isActive, "User not activated");
        
        address currentReferrer = users[user].referrer;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS && currentReferrer != address(0); level++) {
            if (!users[currentReferrer].isActive) {
                currentReferrer = users[currentReferrer].referrer;
                continue;
            }
            
            uint256 referralReward = (rewardAmount * referralRates[level]) / 10000;
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
        
        // 计算团队业绩 (包括下级的业绩)
        uint256 totalTeamVolume = _calculateTeamVolume(user);
        users[user].teamVolume = totalTeamVolume;
        
        // 检查是否可以升级到更高等级
        for (uint256 level = currentLevel + 1; level <= MAX_TEAM_LEVEL; level++) {
            TeamLevelConfig memory config = teamLevelConfigs[level];
            
            if (users[user].directCount >= config.directRequirement && 
                totalTeamVolume >= config.teamVolumeRequirement) {
                
                users[user].teamLevel = level;
                emit TeamLevelUpgraded(user, level);
            } else {
                break; // 不满足条件，停止检查更高等级
            }
        }
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
    
    function updateBurnRates(uint256 _referralBurnRate, uint256 _teamBurnRate) external onlyOwner {
        require(_referralBurnRate <= 5000, "Burn rate too high"); // 最大50%
        require(_teamBurnRate <= 5000, "Burn rate too high");
        
        referralBurnRate = _referralBurnRate;
        teamBurnRate = _teamBurnRate;
    }
    
    function updateActivationStakeAmount(uint256 amount) external onlyOwner {
        activationStakeAmount = amount;
    }
    
    function setHCFStaking(address _hcfStaking) external onlyOwner {
        hcfStaking = IHCFStaking(_hcfStaking);
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
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}