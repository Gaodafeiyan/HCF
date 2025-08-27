// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
    function hasValidCommunity(address user) external view returns (bool);
    function getCommunityPerformance(address user) external view returns (uint256);
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
 * @title HCFRanking
 * @dev 排名奖励系统 - 基于静态产出的两项独立排名
 * 
 * 1. 质押排名：基于个人静态产出，任何人可进
 * 2. 小区排名：基于小区静态产出，需要有效小区（业绩>0，非单条线）
 * 
 * Top 2000名额外加10%-20%静态产出奖励
 */
contract HCFRanking is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFStaking public stakingContract;
    IHCFReferral public referralContract;
    
    // 排名配置
    struct RankingConfig {
        uint256 top100Bonus;    // 1-100名: 20%
        uint256 top299Bonus;    // 101-299名: 15%
        uint256 top599Bonus;    // 300-599名: 12%
        uint256 top999Bonus;    // 600-999名: 11%
        uint256 top2000Bonus;   // 1000-2000名: 10%
        uint256 updateInterval;  // 更新间隔（日/周/月）
        bool enabled;            // 是否启用
    }
    
    // 用户排名数据
    struct UserRankData {
        uint256 stakingRank;        // 质押排名
        uint256 communityRank;      // 小区排名
        uint256 staticOutput;       // 个人静态产出
        uint256 communityStaticOutput; // 小区静态产出
        uint256 stakingBonus;       // 质押排名奖励
        uint256 communityBonus;     // 小区排名奖励
        uint256 lastUpdateTime;     // 最后更新时间
        bool hasValidCommunity;     // 是否有有效小区
    }
    
    // 排名配置（质押和小区独立）
    RankingConfig public stakingRankConfig;
    RankingConfig public communityRankConfig;
    
    // 用户排名数据
    mapping(address => UserRankData) public userRankData;
    
    // 排名列表
    address[] public stakingRankList;    // 质押排名列表
    address[] public communityRankList;  // 小区排名列表
    
    // 最后更新时间
    uint256 public lastStakingRankUpdate;
    uint256 public lastCommunityRankUpdate;
    
    // 周期重设功能
    uint256 public currentCycle;  // 当前周期
    mapping(uint256 => mapping(address => UserRankData)) public cycleUserData; // 周期数据
    
    // ============ 事件 ============
    
    event RankingUpdated(string rankType, uint256 timestamp);
    event UserRankChanged(address indexed user, uint256 stakingRank, uint256 communityRank);
    event BonusCalculated(address indexed user, uint256 stakingBonus, uint256 communityBonus);
    
    // ============ 构造函数 ============
    
    constructor(
        address _stakingContract,
        address _referralContract
    ) Ownable(msg.sender) {
        stakingContract = IHCFStaking(_stakingContract);
        referralContract = IHCFReferral(_referralContract);
        
        // 初始化排名配置 - 基于静态产出加10%-20%
        // Top 100: 20%, 101-500: 15%, 501-1000: 12%, 1001-2000: 10%
        stakingRankConfig = RankingConfig({
            top100Bonus: 2000,    // 20%
            top299Bonus: 1500,    // 15%
            top599Bonus: 1200,    // 12%
            top999Bonus: 1100,    // 11%
            top2000Bonus: 1000,   // 10%
            updateInterval: 1 days,
            enabled: true
        });
        
        communityRankConfig = RankingConfig({
            top100Bonus: 2000,    // 20%
            top299Bonus: 1500,    // 15%
            top599Bonus: 1200,    // 12%
            top999Bonus: 1100,    // 11%
            top2000Bonus: 1000,   // 10%
            updateInterval: 1 days,
            enabled: true
        });
    }
    
    // ============ 排名更新功能 ============
    
    /**
     * @dev 更新质押排名
     */
    function updateStakingRanking() external {
        require(
            block.timestamp >= lastStakingRankUpdate + stakingRankConfig.updateInterval,
            "Too early to update"
        );
        
        // 清空旧排名
        delete stakingRankList;
        
        // 这里需要获取所有质押用户并排序
        // 实际实现需要链下索引或限制用户数量
        
        lastStakingRankUpdate = block.timestamp;
        emit RankingUpdated("staking", block.timestamp);
    }
    
    /**
     * @dev 更新小区排名
     */
    function updateCommunityRanking() external {
        require(
            block.timestamp >= lastCommunityRankUpdate + communityRankConfig.updateInterval,
            "Too early to update"
        );
        
        // 清空旧排名
        delete communityRankList;
        
        // 这里需要获取所有有效小区用户并排序
        // 实际实现需要链下索引或限制用户数量
        
        lastCommunityRankUpdate = block.timestamp;
        emit RankingUpdated("community", block.timestamp);
    }
    
    /**
     * @dev 计算用户排名奖励
     */
    function calculateUserRankingBonus(address user) external view returns (
        uint256 stakingBonus,
        uint256 communityBonus,
        bool eligibleForCommunity,
        string memory reason
    ) {
        UserRankData memory userData = userRankData[user];
        
        // 计算质押排名奖励（任何人都可以参与）
        stakingBonus = _calculateBonus(userData.stakingRank, stakingRankConfig);
        
        // 检查是否有资格参与小区排名
        bool hasValidCommunity = referralContract.hasValidCommunity(user);
        
        if (!hasValidCommunity) {
            // 无有效小区，不能获得小区排名奖励
            communityBonus = 0;
            eligibleForCommunity = false;
            
            // 获取具体原因
            (, , uint256 teamLevel, , uint256 teamVolume, , , , , ) = referralContract.getUserData(user);
            
            if (teamLevel == 0) {
                reason = "No community (no direct referrals)";
            } else if (teamVolume == 0) {
                reason = "Zero performance";
            } else {
                reason = "Single line structure";
            }
        } else {
            // 有有效小区，计算小区排名奖励
            communityBonus = _calculateBonus(userData.communityRank, communityRankConfig);
            eligibleForCommunity = true;
            reason = "Eligible";
        }
        
        return (stakingBonus, communityBonus, eligibleForCommunity, reason);
    }
    
    /**
     * @dev 内部函数：根据排名计算奖励
     */
    function _calculateBonus(uint256 rank, RankingConfig memory config) internal pure returns (uint256) {
        if (!config.enabled || rank == 0) return 0;
        
        if (rank <= 100) {
            return config.top100Bonus;    // 20%
        } else if (rank <= 500) {
            return config.top299Bonus;    // 15%
        } else if (rank <= 1000) {
            return config.top599Bonus;    // 12%
        } else if (rank <= 2000) {
            return config.top2000Bonus;   // 10%
        } else {
            return 0; // 2000名以外无奖励
        }
    }
    
    /**
     * @dev 手动更新用户排名数据（后端调用）
     */
    function updateUserRankData(
        address user,
        uint256 stakingRank,
        uint256 communityRank,
        uint256 staticOutput,
        uint256 communityStaticOutput
    ) external onlyOwner {
        UserRankData storage userData = userRankData[user];
        
        // 获取小区信息
        bool hasValidCommunity = referralContract.hasValidCommunity(user);
        uint256 communityPerformance = referralContract.getCommunityPerformance(user);
        
        // 更新数据
        userData.stakingRank = stakingRank;
        userData.communityRank = hasValidCommunity ? communityRank : 0;
        userData.staticOutput = staticOutput;
        userData.communityStaticOutput = communityStaticOutput;
        userData.hasValidCommunity = hasValidCommunity && communityPerformance > 0; // 业绩>0
        userData.lastUpdateTime = block.timestamp;
        
        // 计算奖励
        userData.stakingBonus = _calculateBonus(stakingRank, stakingRankConfig);
        userData.communityBonus = hasValidCommunity ? 
            _calculateBonus(communityRank, communityRankConfig) : 0;
        
        emit UserRankChanged(user, stakingRank, communityRank);
        emit BonusCalculated(user, userData.stakingBonus, userData.communityBonus);
    }
    
    /**
     * @dev 批量更新用户排名（后端调用）
     */
    function batchUpdateUserRanks(
        address[] memory users,
        uint256[] memory stakingRanks,
        uint256[] memory communityRanks,
        uint256[] memory staticOutputs,
        uint256[] memory communityStaticOutputs
    ) external onlyOwner {
        require(users.length == stakingRanks.length, "Length mismatch");
        require(users.length == communityRanks.length, "Length mismatch");
        require(users.length == staticOutputs.length, "Length mismatch");
        require(users.length == communityStaticOutputs.length, "Length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            // 内联更新逻辑，避免前向引用问题
            UserRankData storage userData = userRankData[users[i]];
            
            // 获取小区信息
            bool hasValidCommunity = referralContract.hasValidCommunity(users[i]);
            uint256 communityPerformance = referralContract.getCommunityPerformance(users[i]);
            
            // 更新数据
            userData.stakingRank = stakingRanks[i];
            userData.communityRank = (hasValidCommunity && communityPerformance > 0) ? communityRanks[i] : 0;
            userData.staticOutput = staticOutputs[i];
            userData.communityStaticOutput = communityStaticOutputs[i];
            userData.hasValidCommunity = hasValidCommunity && communityPerformance > 0;
            userData.lastUpdateTime = block.timestamp;
            
            // 计算奖励
            userData.stakingBonus = _calculateBonus(stakingRanks[i], stakingRankConfig);
            userData.communityBonus = hasValidCommunity ? 
                _calculateBonus(communityRanks[i], communityRankConfig) : 0;
            
            emit UserRankChanged(users[i], stakingRanks[i], communityRanks[i]);
            emit BonusCalculated(users[i], userData.stakingBonus, userData.communityBonus);
        }
    }
    
    // ============ 查询功能 ============
    
    /**
     * @dev 获取用户完整排名信息
     */
    function getUserRankingInfo(address user) external view returns (
        uint256 stakingRank,
        uint256 communityRank,
        uint256 stakingBonus,
        uint256 communityBonus,
        bool hasValidCommunity,
        uint256 stakingAmount,
        uint256 communityPerformance
    ) {
        UserRankData memory userData = userRankData[user];
        
        return (
            userData.stakingRank,
            userData.communityRank,
            userData.stakingBonus,
            userData.communityBonus,
            userData.hasValidCommunity,
            userData.stakingAmount,
            userData.communityPerformance
        );
    }
    
    /**
     * @dev 获取总排名奖励（质押+小区）
     */
    function getTotalRankingBonus(address user) external view returns (uint256) {
        UserRankData memory userData = userRankData[user];
        return userData.stakingBonus + userData.communityBonus;
    }
    
    // ============ 管理功能 ============
    
    /**
     * @dev 更新排名配置
     */
    function updateRankingConfig(
        bool isStaking,
        uint256[5] memory bonuses,
        uint256 interval,
        bool enabled
    ) external onlyOwner {
        RankingConfig storage config = isStaking ? stakingRankConfig : communityRankConfig;
        
        config.top100Bonus = bonuses[0];
        config.top299Bonus = bonuses[1];
        config.top599Bonus = bonuses[2];
        config.top999Bonus = bonuses[3];
        config.top2000Bonus = bonuses[4];
        config.updateInterval = interval;
        config.enabled = enabled;
    }
    
    /**
     * @dev 周期重设 - 每周/每月重置排名
     */
    function resetCycle() external onlyOwner {
        currentCycle++;
        
        // 清空当前排名数据
        delete stakingRankList;
        delete communityRankList;
        
        // 重置更新时间
        lastStakingRankUpdate = block.timestamp;
        lastCommunityRankUpdate = block.timestamp;
        
        emit RankingUpdated("cycle_reset", block.timestamp);
    }
    
    /**
     * @dev 获取当前周期信息
     */
    function getCurrentCycleInfo() external view returns (
        uint256 cycle,
        uint256 stakingLastUpdate,
        uint256 communityLastUpdate,
        uint256 nextStakingUpdate,
        uint256 nextCommunityUpdate
    ) {
        return (
            currentCycle,
            lastStakingRankUpdate,
            lastCommunityRankUpdate,
            lastStakingRankUpdate + stakingRankConfig.updateInterval,
            lastCommunityRankUpdate + communityRankConfig.updateInterval
        );
    }
    
    /**
     * @dev 设置合约地址
     */
    function setContracts(address _staking, address _referral) external onlyOwner {
        if (_staking != address(0)) stakingContract = IHCFStaking(_staking);
        if (_referral != address(0)) referralContract = IHCFReferral(_referral);
    }
}
