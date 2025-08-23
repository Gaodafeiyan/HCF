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
    );
}

interface IHCFReferral {
    function getUserData(address user) external view returns (
        address referrer,
        uint256 directCount,
        uint256 teamLevel,
        uint256 personalVolume,
        uint256 teamVolume,
        uint256 totalReferralReward,
        uint256 totalTeamReward,
        bool isActive,
        uint256 joinTime,
        uint256 lastRewardTime
    );
}

/**
 * @title HCFBurnMechanism
 * @dev 烧伤机制合约 - 封顶质押日产出百分比奖励
 * 
 * 核心逻辑:
 * - 用户质押1000 HCF → 团队奖励封顶为1000 HCF入单日产出百分比
 * - 烧伤上限 = 个人质押金额的日产出比例
 * - 防止大户通过小额质押获得巨额团队奖励
 * - 激励用户增加个人质押来提升团队奖励上限
 */
contract HCFBurnMechanism is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IHCFStaking public stakingContract;
    IHCFReferral public referralContract;
    
    // 烧伤配置
    struct BurnConfig {
        uint256 referralBurnRate;       // 推荐奖励烧伤率 (10%)
        uint256 teamBurnRate;           // 团队奖励烧伤率 (5%)
        uint256 stakingCapMultiplier;   // 质押封顶倍数 (100% = 10000)
        bool burnMechanismActive;       // 烧伤机制激活状态
    }
    
    BurnConfig public burnConfig;
    
    // 用户烧伤记录
    struct UserBurnRecord {
        uint256 stakingAmount;          // 用户质押金额
        uint256 dailyOutputCap;         // 日产出封顶
        uint256 totalReferralRewards;   // 累计推荐奖励
        uint256 totalTeamRewards;       // 累计团队奖励
        uint256 burnedReferralRewards;  // 被烧伤的推荐奖励
        uint256 burnedTeamRewards;      // 被烧伤的团队奖励
        uint256 lastUpdateTime;         // 最后更新时间
    }
    
    mapping(address => UserBurnRecord) public userBurnRecords;
    
    // 全局统计
    uint256 public totalBurnedReferralRewards;  // 全网推荐奖励烧伤总量
    uint256 public totalBurnedTeamRewards;      // 全网团队奖励烧伤总量
    uint256 public totalStakingCap;             // 全网质押封顶总量
    
    // 质押等级日化率 (用于计算日产出)
    mapping(uint256 => uint256) public levelDailyRates; // levelId => daily rate (bp)
    
    // ============ 事件 ============
    
    event BurnCapCalculated(address indexed user, uint256 stakingAmount, uint256 dailyOutputCap);
    event RewardBurned(address indexed user, uint256 rewardType, uint256 originalAmount, uint256 burnedAmount, uint256 finalAmount);
    event BurnConfigUpdated(uint256 referralBurnRate, uint256 teamBurnRate, uint256 stakingCapMultiplier);
    event BurnMechanismToggled(bool active);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _stakingContract,
        address _referralContract
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        stakingContract = IHCFStaking(_stakingContract);
        referralContract = IHCFReferral(_referralContract);
        
        // 初始化烧伤配置
        burnConfig = BurnConfig({
            referralBurnRate: 1000,         // 10%
            teamBurnRate: 500,              // 5%
            stakingCapMultiplier: 10000,    // 100% (质押金额的100%作为封顶)
            burnMechanismActive: true
        });
        
        // 初始化等级日化率 (与HCFStaking保持一致)
        levelDailyRates[0] = 40;    // 0.4%
        levelDailyRates[1] = 40;    // 0.4% 
        levelDailyRates[2] = 50;    // 0.5%
        levelDailyRates[3] = 40;    // 0.4% (拆分级别)
    }
    
    // ============ 核心烧伤逻辑 ============
    
    /**
     * @dev 计算用户的烧伤上限
     * @param _user 用户地址
     * @return dailyOutputCap 日产出封顶金额
     */
    function calculateBurnCap(address _user) public view returns (uint256 dailyOutputCap) {
        if (!burnConfig.burnMechanismActive) {
            return type(uint256).max; // 烧伤机制关闭时无上限
        }
        
        // 获取用户质押信息
        (uint256 stakingAmount, uint256 levelId, , , bool isLP, , , , ) = stakingContract.getUserInfo(_user);
        
        if (stakingAmount == 0) {
            return 0; // 未质押用户无奖励上限
        }
        
        // 计算基础日产出
        uint256 dailyRate = levelDailyRates[levelId];
        uint256 baseDailyOutput = (stakingAmount * dailyRate) / 10000;
        
        // LP模式额外增益
        if (isLP) {
            baseDailyOutput = (baseDailyOutput * 500) / 100; // 5倍增益 (1:5系数)
        }
        
        // 应用质押封顶倍数
        dailyOutputCap = (baseDailyOutput * burnConfig.stakingCapMultiplier) / 10000;
        
        return dailyOutputCap;
    }
    
    /**
     * @dev 处理推荐奖励烧伤
     * @param _user 用户地址
     * @param _originalReward 原始推荐奖励
     * @return finalReward 烧伤后的最终奖励
     */
    function processReferralRewardBurn(address _user, uint256 _originalReward) 
        external 
        returns (uint256 finalReward) {
        require(
            msg.sender == address(referralContract), 
            "Only referral contract can call"
        );
        
        if (!burnConfig.burnMechanismActive || _originalReward == 0) {
            return _originalReward;
        }
        
        UserBurnRecord storage record = userBurnRecords[_user];
        uint256 dailyOutputCap = calculateBurnCap(_user);
        
        // 更新用户质押信息
        _updateUserStakingInfo(_user, record);
        
        // 检查是否超过烧伤上限
        uint256 todayRewards = _getTodayRewards(_user, record);
        uint256 newTotalRewards = todayRewards + _originalReward;
        
        if (newTotalRewards <= dailyOutputCap) {
            // 未超过上限，无需烧伤
            record.totalReferralRewards += _originalReward;
            return _originalReward;
        }
        
        // 超过上限，计算烧伤
        uint256 excessReward = newTotalRewards - dailyOutputCap;
        uint256 burnAmount = (excessReward * burnConfig.referralBurnRate) / 10000;
        finalReward = _originalReward - burnAmount;
        
        // 更新记录
        record.totalReferralRewards += _originalReward;
        record.burnedReferralRewards += burnAmount;
        record.lastUpdateTime = block.timestamp;
        
        // 更新全局统计
        totalBurnedReferralRewards += burnAmount;
        
        emit RewardBurned(_user, 1, _originalReward, burnAmount, finalReward);
        
        return finalReward;
    }
    
    /**
     * @dev 处理团队奖励烧伤
     * @param _user 用户地址
     * @param _originalReward 原始团队奖励
     * @return finalReward 烧伤后的最终奖励
     */
    function processTeamRewardBurn(address _user, uint256 _originalReward) 
        external 
        returns (uint256 finalReward) {
        require(
            msg.sender == address(referralContract), 
            "Only referral contract can call"
        );
        
        if (!burnConfig.burnMechanismActive || _originalReward == 0) {
            return _originalReward;
        }
        
        UserBurnRecord storage record = userBurnRecords[_user];
        uint256 dailyOutputCap = calculateBurnCap(_user);
        
        // 更新用户质押信息
        _updateUserStakingInfo(_user, record);
        
        // 检查是否超过烧伤上限
        uint256 todayRewards = _getTodayRewards(_user, record);
        uint256 newTotalRewards = todayRewards + _originalReward;
        
        if (newTotalRewards <= dailyOutputCap) {
            // 未超过上限，无需烧伤
            record.totalTeamRewards += _originalReward;
            return _originalReward;
        }
        
        // 超过上限，计算烧伤
        uint256 excessReward = newTotalRewards - dailyOutputCap;
        uint256 burnAmount = (excessReward * burnConfig.teamBurnRate) / 10000;
        finalReward = _originalReward - burnAmount;
        
        // 更新记录
        record.totalTeamRewards += _originalReward;
        record.burnedTeamRewards += burnAmount;
        record.lastUpdateTime = block.timestamp;
        
        // 更新全局统计
        totalBurnedTeamRewards += burnAmount;
        
        emit RewardBurned(_user, 2, _originalReward, burnAmount, finalReward);
        
        return finalReward;
    }
    
    // ============ 辅助函数 ============
    
    /**
     * @dev 获取用户今日奖励总额
     */
    function _getTodayRewards(address _user, UserBurnRecord storage record) 
        internal 
        view 
        returns (uint256) {
        // 如果不是同一天，重置计数
        if (_isNewDay(record.lastUpdateTime)) {
            return 0;
        }
        
        // 返回今日已获得的奖励
        return record.totalReferralRewards + record.totalTeamRewards;
    }
    
    /**
     * @dev 检查是否为新的一天
     */
    function _isNewDay(uint256 _lastUpdateTime) internal view returns (bool) {
        return (block.timestamp / 86400) != (_lastUpdateTime / 86400);
    }
    
    /**
     * @dev 更新用户质押信息
     */
    function _updateUserStakingInfo(address _user, UserBurnRecord storage record) internal {
        (uint256 stakingAmount, , , , , , , , ) = stakingContract.getUserInfo(_user);
        
        if (stakingAmount != record.stakingAmount) {
            record.stakingAmount = stakingAmount;
            record.dailyOutputCap = calculateBurnCap(_user);
            
            emit BurnCapCalculated(_user, stakingAmount, record.dailyOutputCap);
        }
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 获取用户烧伤状态
     */
    function getUserBurnStatus(address _user) external view returns (
        uint256 stakingAmount,
        uint256 dailyOutputCap,
        uint256 todayRewards,
        uint256 remainingCap,
        uint256 totalBurnedRewards,
        bool isCapReached
    ) {
        UserBurnRecord memory record = userBurnRecords[_user];
        
        stakingAmount = record.stakingAmount;
        dailyOutputCap = calculateBurnCap(_user);
        todayRewards = _isNewDay(record.lastUpdateTime) ? 0 : 
                      record.totalReferralRewards + record.totalTeamRewards;
        remainingCap = dailyOutputCap > todayRewards ? dailyOutputCap - todayRewards : 0;
        totalBurnedRewards = record.burnedReferralRewards + record.burnedTeamRewards;
        isCapReached = todayRewards >= dailyOutputCap;
        
        return (
            stakingAmount,
            dailyOutputCap,
            todayRewards,
            remainingCap,
            totalBurnedRewards,
            isCapReached
        );
    }
    
    /**
     * @dev 获取全局烧伤统计
     */
    function getGlobalBurnStats() external view returns (
        uint256 totalReferralBurned,
        uint256 totalTeamBurned,
        uint256 totalBurned,
        uint256 activeBurnMechanisms,
        bool mechanismActive
    ) {
        return (
            totalBurnedReferralRewards,
            totalBurnedTeamRewards,
            totalBurnedReferralRewards + totalBurnedTeamRewards,
            totalStakingCap,
            burnConfig.burnMechanismActive
        );
    }
    
    /**
     * @dev 模拟奖励烧伤计算
     * @param _user 用户地址
     * @param _rewardAmount 奖励金额
     * @param _rewardType 奖励类型 (1:推荐 2:团队)
     * @return originalAmount 原始奖励
     * @return burnAmount 烧伤金额
     * @return finalAmount 最终奖励
     */
    function simulateBurn(address _user, uint256 _rewardAmount, uint256 _rewardType) 
        external 
        view 
        returns (uint256 originalAmount, uint256 burnAmount, uint256 finalAmount) {
        
        originalAmount = _rewardAmount;
        
        if (!burnConfig.burnMechanismActive || _rewardAmount == 0) {
            return (originalAmount, 0, originalAmount);
        }
        
        UserBurnRecord memory record = userBurnRecords[_user];
        uint256 dailyOutputCap = calculateBurnCap(_user);
        uint256 todayRewards = _isNewDay(record.lastUpdateTime) ? 0 : 
                              record.totalReferralRewards + record.totalTeamRewards;
        uint256 newTotalRewards = todayRewards + _rewardAmount;
        
        if (newTotalRewards <= dailyOutputCap) {
            return (originalAmount, 0, originalAmount);
        }
        
        // 计算烧伤
        uint256 excessReward = newTotalRewards - dailyOutputCap;
        uint256 burnRate = _rewardType == 1 ? burnConfig.referralBurnRate : burnConfig.teamBurnRate;
        burnAmount = (excessReward * burnRate) / 10000;
        finalAmount = originalAmount - burnAmount;
        
        return (originalAmount, burnAmount, finalAmount);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 更新烧伤配置
     */
    function updateBurnConfig(
        uint256 _referralBurnRate,
        uint256 _teamBurnRate,
        uint256 _stakingCapMultiplier
    ) external onlyOwner {
        require(_referralBurnRate <= 5000, "Referral burn rate too high"); // Max 50%
        require(_teamBurnRate <= 5000, "Team burn rate too high"); // Max 50%
        require(_stakingCapMultiplier > 0, "Invalid cap multiplier");
        
        burnConfig.referralBurnRate = _referralBurnRate;
        burnConfig.teamBurnRate = _teamBurnRate;
        burnConfig.stakingCapMultiplier = _stakingCapMultiplier;
        
        emit BurnConfigUpdated(_referralBurnRate, _teamBurnRate, _stakingCapMultiplier);
    }
    
    /**
     * @dev 切换烧伤机制开关
     */
    function toggleBurnMechanism(bool _active) external onlyOwner {
        burnConfig.burnMechanismActive = _active;
        emit BurnMechanismToggled(_active);
    }
    
    /**
     * @dev 更新等级日化率
     */
    function updateLevelDailyRates(uint256[] memory _levelIds, uint256[] memory _rates) external onlyOwner {
        require(_levelIds.length == _rates.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < _levelIds.length; i++) {
            levelDailyRates[_levelIds[i]] = _rates[i];
        }
    }
    
    /**
     * @dev 更新合约地址
     */
    function updateContracts(
        address _stakingContract,
        address _referralContract
    ) external onlyOwner {
        if (_stakingContract != address(0)) {
            stakingContract = IHCFStaking(_stakingContract);
        }
        if (_referralContract != address(0)) {
            referralContract = IHCFReferral(_referralContract);
        }
    }
    
    /**
     * @dev 重置用户烧伤记录 (紧急情况)
     */
    function resetUserBurnRecord(address _user) external onlyOwner {
        delete userBurnRecords[_user];
    }
    
    /**
     * @dev 批量重置用户烧伤记录
     */
    function batchResetUserBurnRecords(address[] memory _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            delete userBurnRecords[_users[i]];
        }
    }
}