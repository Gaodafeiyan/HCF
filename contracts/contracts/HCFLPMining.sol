// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function releaseMiningRewards(address to, uint256 amount) external;
    function getRemainingMiningPool() external view returns (uint256);
}

interface ILPToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract HCFLPMining is Ownable, ReentrancyGuard {
    // LP Mining Parameters
    uint256 public constant MINING_POOL = 990_000_000 * 10**18; // 9.9亿 HCF for LP mining
    uint256 public totalMiningReleased;
    
    // LP Token Contracts
    mapping(address => bool) public isLPToken; // Authorized LP tokens
    mapping(address => uint256) public lpTokenWeight; // Weight for different LP tokens
    
    // User Mining Data
    struct UserMining {
        uint256 totalClaimed;
        uint256 lastClaimBlock;
        mapping(address => uint256) lpTokenBalance; // User's LP token balance
        mapping(address => uint256) lastUpdateBlock; // Last update block for each LP token
    }
    
    mapping(address => UserMining) public userMining;
    
    // Mining Parameters
    uint256 public miningRatePerBlock = 1157407407407; // ~100 HCF per block (15s blocks)
    uint256 public startBlock;
    uint256 public endBlock;
    
    // Contracts
    IHCFToken public hcfToken;
    
    // Events
    event LPTokenAdded(address lpToken, uint256 weight);
    event LPTokenRemoved(address lpToken);
    event MiningClaimed(address indexed user, uint256 amount);
    event LPTokenUpdated(address indexed user, address lpToken, uint256 newBalance);
    
    constructor(
        address _hcfToken,
        uint256 _startBlock
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        startBlock = _startBlock;
        // Mining期限: 假设4年完成 (4年 * 365天 * 24小时 * 60分钟 * 4块/分钟)
        endBlock = _startBlock + (4 * 365 * 24 * 60 * 4);
    }
    
    // Admin Functions
    function addLPToken(address _lpToken, uint256 _weight) external onlyOwner {
        require(_lpToken != address(0), "Invalid LP token");
        require(!isLPToken[_lpToken], "LP token already added");
        
        isLPToken[_lpToken] = true;
        lpTokenWeight[_lpToken] = _weight;
        
        emit LPTokenAdded(_lpToken, _weight);
    }
    
    function removeLPToken(address _lpToken) external onlyOwner {
        require(isLPToken[_lpToken], "LP token not found");
        
        isLPToken[_lpToken] = false;
        lpTokenWeight[_lpToken] = 0;
        
        emit LPTokenRemoved(_lpToken);
    }
    
    function updateLPTokenWeight(address _lpToken, uint256 _weight) external onlyOwner {
        require(isLPToken[_lpToken], "LP token not found");
        lpTokenWeight[_lpToken] = _weight;
    }
    
    function setMiningRate(uint256 _ratePerBlock) external onlyOwner {
        miningRatePerBlock = _ratePerBlock;
    }
    
    // LP Token Balance Update
    function updateLPBalance(address _lpToken, uint256 _newBalance) external {
        require(isLPToken[_lpToken], "Invalid LP token");
        
        // Claim pending rewards first
        _claimRewards(msg.sender);
        
        // Update user's LP token balance
        userMining[msg.sender].lpTokenBalance[_lpToken] = _newBalance;
        userMining[msg.sender].lastUpdateBlock[_lpToken] = block.number;
        
        emit LPTokenUpdated(msg.sender, _lpToken, _newBalance);
    }
    
    // Mining Claim
    function claimRewards() external nonReentrant {
        _claimRewards(msg.sender);
    }
    
    function _claimRewards(address _user) internal {
        uint256 pendingRewards = calculatePendingRewards(_user);
        
        if (pendingRewards > 0) {
            require(totalMiningReleased + pendingRewards <= MINING_POOL, "Exceeds mining pool");
            
            totalMiningReleased += pendingRewards;
            userMining[_user].totalClaimed += pendingRewards;
            userMining[_user].lastClaimBlock = block.number;
            
            // Mint rewards through HCF token contract
            hcfToken.releaseMiningRewards(_user, pendingRewards);
            
            emit MiningClaimed(_user, pendingRewards);
        }
    }
    
    // Calculate Pending Rewards
    function calculatePendingRewards(address _user) public view returns (uint256) {
        if (block.number <= startBlock || block.number <= userMining[_user].lastClaimBlock) {
            return 0;
        }
        
        uint256 userTotalLPValue = getUserTotalLPValue(_user);
        if (userTotalLPValue == 0) {
            return 0;
        }
        
        uint256 totalLPValue = getTotalLPValue();
        if (totalLPValue == 0) {
            return 0;
        }
        
        uint256 blocksToReward = block.number - (userMining[_user].lastClaimBlock > startBlock ? 
            userMining[_user].lastClaimBlock : startBlock);
        
        if (block.number > endBlock) {
            blocksToReward = endBlock - (userMining[_user].lastClaimBlock > startBlock ? 
                userMining[_user].lastClaimBlock : startBlock);
        }
        
        uint256 totalRewards = blocksToReward * miningRatePerBlock;
        uint256 userShare = (totalRewards * userTotalLPValue) / totalLPValue;
        
        // Ensure we don't exceed the mining pool
        if (totalMiningReleased + userShare > MINING_POOL) {
            userShare = MINING_POOL - totalMiningReleased;
        }
        
        return userShare;
    }
    
    // Get User's Total LP Value (weighted)
    function getUserTotalLPValue(address _user) public view returns (uint256) {
        uint256 totalValue = 0;
        
        // This would typically iterate through all LP tokens
        // For now, we'll implement a simplified version
        // In practice, you'd need to track all LP tokens
        
        return totalValue;
    }
    
    // Get Total LP Value (all users, weighted)
    function getTotalLPValue() public view returns (uint256) {
        uint256 totalValue = 0;
        
        // This would sum up all LP values across all users
        // Implementation depends on how LP tokens are tracked
        
        return totalValue;
    }
    
    // Specific LP Token Functions
    function getUserLPBalance(address _user, address _lpToken) external view returns (uint256) {
        return userMining[_user].lpTokenBalance[_lpToken];
    }
    
    function getUserMiningInfo(address _user) external view returns (
        uint256 totalClaimed,
        uint256 lastClaimBlock,
        uint256 pendingRewards
    ) {
        return (
            userMining[_user].totalClaimed,
            userMining[_user].lastClaimBlock,
            calculatePendingRewards(_user)
        );
    }
    
    // BSDT/HCF LP Integration
    function updateBSDTLPBalance(address _user, uint256 _balance) external {
        require(msg.sender == owner(), "Only owner can update"); // In practice, this would be the LP contract
        userMining[_user].lpTokenBalance[address(0x1)] = _balance; // Use specific address for BSDT/HCF LP
        userMining[_user].lastUpdateBlock[address(0x1)] = block.number;
    }
    
    // Emergency Functions
    function emergencyWithdraw() external onlyOwner {
        uint256 remaining = MINING_POOL - totalMiningReleased;
        if (remaining > 0) {
            totalMiningReleased = MINING_POOL;
            hcfToken.releaseMiningRewards(owner(), remaining);
        }
    }
    
    // View Functions
    function getRemainingMiningPool() external view returns (uint256) {
        return MINING_POOL - totalMiningReleased;
    }
    
    function getMiningProgress() external view returns (uint256, uint256) {
        return (totalMiningReleased, MINING_POOL);
    }
    
    function isActiveMining() external view returns (bool) {
        return block.number >= startBlock && block.number <= endBlock && totalMiningReleased < MINING_POOL;
    }
}