// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IHCFBSDTExchange {
    function lpBalances(address user) external view returns (uint256);
    function totalLPSupply() external view returns (uint256);
    function getUserLPInfo(address _user) external view returns (uint256 lpBalance, uint256 weight, uint256 usdtShare, uint256 bsdtShare);
}

/**
 * @title HCFNodeNFT
 * @dev 99个节点NFT系统 + 动态算力机制
 * 
 * 功能包括:
 * - 限量99个节点NFT
 * - 5000 BSDT申请费 (动态调整)
 * - 1000 HCF + 1000 HCF/BSDT LP激活
 * - 动态算力: LP HCF/maxHCF × 100%
 * - 4种分红收益源
 * - 节点状态管理
 */
contract HCFNodeNFT is ERC721, Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IBSDT public bsdtToken;
    IHCFBSDTExchange public bsdtExchange; // 用于获取LP余额
    
    // 节点限制
    uint256 public constant MAX_NODES = 99;
    uint256 public currentNodeId = 0;
    
    // 申请费用 (动态调整)
    uint256 public baseApplicationFee = 5000 * 10**18; // 5000 BSDT
    uint256 public highPriceApplicationFee = 50000 * 10**18; // 50000 HCF
    uint256 public priceThreshold = 1300; // 1.3 USD (basis points: 1300/1000 = 1.3)
    
    // 激活要求
    uint256 public activationHCFAmount = 1000 * 10**18; // 1000 HCF
    uint256 public activationLPAmount = 1000 * 10**18; // 1000 HCF/BSDT LP
    
    // 动态算力系统
    uint256 public maxHCFInLP = 100000 * 10**18; // 最大LP中的HCF数量 (用于算力计算)
    
    // 节点信息
    struct NodeInfo {
        uint256 nodeId;
        address owner;
        uint256 applicationTime;
        uint256 activationTime;
        bool isActive;
        uint256 computingPower;        // 当前算力百分比 (basis points: 10000 = 100%)
        uint256 totalSlippageRewards;
        uint256 totalWithdrawalFeeRewards;
        uint256 totalStakingRewards;
        uint256 totalAntiDumpRewards;
    }
    
    mapping(uint256 => NodeInfo) public nodes;
    mapping(address => uint256) public ownerToNodeId;
    
    // 分红池
    uint256 public slippageRewardPool;        // ①滑点分红池
    uint256 public withdrawalFeeRewardPool;   // ②提现手续费分红池  
    uint256 public stakingRewardPool;         // ③全网入单分红池 (2%)
    uint256 public antiDumpRewardPool;        // ④防暴跌分红池
    
    // 分红权重
    mapping(uint256 => uint256) public nodeWeight; // 节点权重 (基于激活时间等)
    uint256 public totalActiveWeight;
    
    // ============ 事件 ============
    
    event NodeApplied(address indexed applicant, uint256 nodeId, uint256 applicationFee);
    event NodeActivated(address indexed owner, uint256 nodeId);
    event NodeDeactivated(address indexed owner, uint256 nodeId);
    event RewardDistributed(uint256 nodeId, uint256 rewardType, uint256 amount);
    event ApplicationFeeUpdated(uint256 basePrice, uint256 highPrice, uint256 threshold);
    event ComputingPowerUpdated(uint256 nodeId, uint256 oldPower, uint256 newPower);
    event MaxHCFUpdated(uint256 oldMaxHCF, uint256 newMaxHCF);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _bsdtToken,
        address _bsdtExchange
    ) ERC721("HCF Node NFT", "HCFNODE") Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtToken = IBSDT(_bsdtToken);
        bsdtExchange = IHCFBSDTExchange(_bsdtExchange);
    }
    
    // ============ 核心功能 ============
    
    /**
     * @dev 申请节点 (支付申请费)
     * @param _useHCF 是否使用HCF支付 (当价格>1.3USD时)
     */
    function applyForNode(bool _useHCF) external nonReentrant {
        require(currentNodeId < MAX_NODES, "All nodes allocated");
        require(ownerToNodeId[msg.sender] == 0, "Already owns a node");
        
        uint256 nodeId = ++currentNodeId;
        
        // 根据价格选择支付方式
        if (_useHCF) {
            require(hcfToken.transferFrom(msg.sender, address(this), highPriceApplicationFee), "HCF payment failed");
        } else {
            require(bsdtToken.transferFrom(msg.sender, address(this), baseApplicationFee), "BSDT payment failed");
        }
        
        // 铸造NFT
        _safeMint(msg.sender, nodeId);
        
        // 初始化节点信息
        nodes[nodeId] = NodeInfo({
            nodeId: nodeId,
            owner: msg.sender,
            applicationTime: block.timestamp,
            activationTime: 0,
            isActive: false,
            computingPower: 0, // 初始算力为0，激活后根据LP计算
            totalSlippageRewards: 0,
            totalWithdrawalFeeRewards: 0,
            totalStakingRewards: 0,
            totalAntiDumpRewards: 0
        });
        
        ownerToNodeId[msg.sender] = nodeId;
        
        uint256 fee = _useHCF ? highPriceApplicationFee : baseApplicationFee;
        emit NodeApplied(msg.sender, nodeId, fee);
    }
    
    /**
     * @dev 激活节点 (1000 HCF + 1000 HCF/BSDT LP)
     */
    function activateNode() external nonReentrant {
        uint256 nodeId = ownerToNodeId[msg.sender];
        require(nodeId > 0, "No node owned");
        require(!nodes[nodeId].isActive, "Node already active");
        
        // 转移激活资金
        require(hcfToken.transferFrom(msg.sender, address(this), activationHCFAmount), "HCF activation failed");
        require(hcfToken.transferFrom(msg.sender, address(this), activationLPAmount), "HCF LP failed");
        require(bsdtToken.transferFrom(msg.sender, address(this), activationLPAmount), "BSDT LP failed");
        
        // 激活节点
        nodes[nodeId].isActive = true;
        nodes[nodeId].activationTime = block.timestamp;
        
        // 设置节点权重 (早期激活获得更高权重)
        uint256 weight = 100 + (MAX_NODES - nodeId) * 5; // 越早申请权重越高
        nodeWeight[nodeId] = weight;
        totalActiveWeight += weight;
        
        // 计算初始算力 (基于当前LP余额)
        uint256 initialComputingPower = calculateDynamicComputingPower(msg.sender);
        nodes[nodeId].computingPower = initialComputingPower;
        
        emit NodeActivated(msg.sender, nodeId);
        if (initialComputingPower > 0) {
            emit ComputingPowerUpdated(nodeId, 0, initialComputingPower);
        }
    }
    
    // ============ 动态算力系统 ============
    
    /**
     * @dev 计算用户的动态算力: LP HCF/maxHCF × 100%
     * @param _user 用户地址
     * @return computingPower 算力百分比 (basis points: 10000 = 100%)
     */
    function calculateDynamicComputingPower(address _user) public view returns (uint256 computingPower) {
        // 获取用户LP信息
        (uint256 lpBalance, , uint256 usdtShare, uint256 bsdtShare) = bsdtExchange.getUserLPInfo(_user);
        
        if (lpBalance == 0) {
            return 0;
        }
        
        // 计算LP中的HCF等价数量 (假设50/50分配)
        // 在BSDT/HCF LP中，HCF的数量等于BSDT的数量 (因为1:1兑换)
        uint256 hcfInLP = bsdtShare; // BSDT等价于HCF
        
        // 算力 = (LP中HCF数量 / 最大HCF数量) × 100%
        if (hcfInLP >= maxHCFInLP) {
            computingPower = 10000; // 100%
        } else {
            computingPower = (hcfInLP * 10000) / maxHCFInLP;
        }
        
        return computingPower;
    }
    
    /**
     * @dev 更新节点算力 (可由节点所有者或管理员调用)
     * @param _nodeId 节点ID
     */
    function updateNodeComputingPower(uint256 _nodeId) external {
        require(_nodeId > 0 && _nodeId <= currentNodeId, "Invalid node ID");
        require(nodes[_nodeId].isActive, "Node not active");
        
        address nodeOwner = nodes[_nodeId].owner;
        require(msg.sender == nodeOwner || msg.sender == owner(), "Not authorized");
        
        uint256 oldPower = nodes[_nodeId].computingPower;
        uint256 newPower = calculateDynamicComputingPower(nodeOwner);
        
        if (oldPower != newPower) {
            nodes[_nodeId].computingPower = newPower;
            emit ComputingPowerUpdated(_nodeId, oldPower, newPower);
        }
    }
    
    /**
     * @dev 批量更新所有活跃节点的算力
     */
    function updateAllNodesComputingPower() external {
        for (uint256 i = 1; i <= currentNodeId; i++) {
            if (nodes[i].isActive) {
                address nodeOwner = nodes[i].owner;
                uint256 oldPower = nodes[i].computingPower;
                uint256 newPower = calculateDynamicComputingPower(nodeOwner);
                
                if (oldPower != newPower) {
                    nodes[i].computingPower = newPower;
                    emit ComputingPowerUpdated(i, oldPower, newPower);
                }
            }
        }
    }
    
    /**
     * @dev 设置最大HCF数量 (用于算力计算)
     */
    function setMaxHCFInLP(uint256 _maxHCF) external onlyOwner {
        require(_maxHCF > 0, "Max HCF must be positive");
        
        uint256 oldMaxHCF = maxHCFInLP;
        maxHCFInLP = _maxHCF;
        
        emit MaxHCFUpdated(oldMaxHCF, _maxHCF);
        
        // 更新所有节点算力
        updateAllNodesComputingPower();
    }
    
    /**
     * @dev 设置BSDT交易所地址
     */
    function setBSDTExchange(address _bsdtExchange) external onlyOwner {
        require(_bsdtExchange != address(0), "Invalid exchange address");
        bsdtExchange = IHCFBSDTExchange(_bsdtExchange);
    }
    
    /**
     * @dev 获取节点的详细信息包括算力
     */
    function getNodeInfo(uint256 _nodeId) external view returns (
        uint256 nodeId,
        address owner,
        bool isActive,
        uint256 computingPower,
        uint256 activationTime,
        uint256 totalRewards
    ) {
        require(_nodeId > 0 && _nodeId <= currentNodeId, "Invalid node ID");
        
        NodeInfo memory node = nodes[_nodeId];
        uint256 totalRewards = node.totalSlippageRewards + 
                             node.totalWithdrawalFeeRewards + 
                             node.totalStakingRewards + 
                             node.totalAntiDumpRewards;
        
        return (
            node.nodeId,
            node.owner,
            node.isActive,
            node.computingPower,
            node.activationTime,
            totalRewards
        );
    }
    
    /**
     * @dev 获取所有活跃节点的算力信息
     */
    function getAllActiveNodesComputingPower() external view returns (
        uint256[] memory nodeIds,
        uint256[] memory computingPowers
    ) {
        uint256 activeCount = 0;
        
        // 计算活跃节点数量
        for (uint256 i = 1; i <= currentNodeId; i++) {
            if (nodes[i].isActive) {
                activeCount++;
            }
        }
        
        nodeIds = new uint256[](activeCount);
        computingPowers = new uint256[](activeCount);
        
        uint256 index = 0;
        for (uint256 i = 1; i <= currentNodeId; i++) {
            if (nodes[i].isActive) {
                nodeIds[index] = i;
                computingPowers[index] = nodes[i].computingPower;
                index++;
            }
        }
        
        return (nodeIds, computingPowers);
    }
    
    // ============ 分红系统 ============
    
    /**
     * @dev 分发滑点分红 (外部调用)
     */
    function distributeSlippageRewards(uint256 _amount) external {
        require(msg.sender == address(hcfToken), "Only HCF token can call");
        slippageRewardPool += _amount;
        _distributeRewards(1, _amount);
    }
    
    /**
     * @dev 分发提现手续费分红 (2%加权分红)
     */
    function distributeWithdrawalFeeRewards(uint256 _amount) external {
        require(msg.sender == address(hcfToken), "Only HCF token can call");
        withdrawalFeeRewardPool += _amount;
        _distributeRewards(2, _amount);
    }
    
    /**
     * @dev 分发全网入单分红 (2%加权分红)
     */
    function distributeStakingRewards(uint256 _amount) external {
        require(msg.sender == address(hcfToken), "Only HCF token can call");
        stakingRewardPool += _amount;
        _distributeRewards(3, _amount);
    }
    
    /**
     * @dev 分发防暴跌分红
     */
    function distributeAntiDumpRewards(uint256 _amount) external {
        require(msg.sender == address(hcfToken), "Only HCF token can call");
        antiDumpRewardPool += _amount;
        _distributeRewards(4, _amount);
    }
    
    /**
     * @dev 内部分红分配逻辑
     * @param _rewardType 1:滑点 2:提现 3:入单 4:防暴跌
     * @param _totalAmount 总分红金额
     */
    function _distributeRewards(uint256 _rewardType, uint256 _totalAmount) internal {
        if (totalActiveWeight == 0) return;
        
        for (uint256 i = 1; i <= currentNodeId; i++) {
            if (nodes[i].isActive) {
                uint256 nodeReward = (_totalAmount * nodeWeight[i]) / totalActiveWeight;
                
                if (_rewardType == 1) {
                    nodes[i].totalSlippageRewards += nodeReward;
                } else if (_rewardType == 2) {
                    nodes[i].totalWithdrawalFeeRewards += nodeReward;
                } else if (_rewardType == 3) {
                    nodes[i].totalStakingRewards += nodeReward;
                } else if (_rewardType == 4) {
                    nodes[i].totalAntiDumpRewards += nodeReward;
                }
                
                emit RewardDistributed(i, _rewardType, nodeReward);
            }
        }
    }
    
    /**
     * @dev 节点提取所有分红
     */
    function claimNodeRewards() external nonReentrant {
        uint256 nodeId = ownerToNodeId[msg.sender];
        require(nodeId > 0 && nodes[nodeId].isActive, "No active node");
        
        NodeInfo storage node = nodes[nodeId];
        uint256 totalRewards = node.totalSlippageRewards + 
                              node.totalWithdrawalFeeRewards + 
                              node.totalStakingRewards + 
                              node.totalAntiDumpRewards;
        
        require(totalRewards > 0, "No rewards to claim");
        
        // 重置分红
        node.totalSlippageRewards = 0;
        node.totalWithdrawalFeeRewards = 0;
        node.totalStakingRewards = 0;
        node.totalAntiDumpRewards = 0;
        
        // 转移奖励
        require(hcfToken.transfer(msg.sender, totalRewards), "Reward transfer failed");
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 获取节点详细信息
     */
    function getNodeInfo(uint256 _nodeId) external view returns (
        address owner,
        bool isActive,
        uint256 applicationTime,
        uint256 activationTime,
        uint256 nodeWeight_,
        uint256[4] memory rewards
    ) {
        require(_nodeId > 0 && _nodeId <= currentNodeId, "Invalid node ID");
        NodeInfo memory node = nodes[_nodeId];
        
        rewards[0] = node.totalSlippageRewards;
        rewards[1] = node.totalWithdrawalFeeRewards;
        rewards[2] = node.totalStakingRewards;
        rewards[3] = node.totalAntiDumpRewards;
        
        return (
            node.owner,
            node.isActive,
            node.applicationTime,
            node.activationTime,
            nodeWeight[_nodeId],
            rewards
        );
    }
    
    /**
     * @dev 获取用户节点信息
     */
    function getUserNodeInfo(address _user) external view returns (
        uint256 nodeId,
        bool isActive,
        uint256 totalRewards,
        uint256[4] memory rewardBreakdown
    ) {
        nodeId = ownerToNodeId[_user];
        if (nodeId == 0) {
            return (0, false, 0, [uint256(0), 0, 0, 0]);
        }
        
        NodeInfo memory node = nodes[nodeId];
        isActive = node.isActive;
        
        rewardBreakdown[0] = node.totalSlippageRewards;
        rewardBreakdown[1] = node.totalWithdrawalFeeRewards;
        rewardBreakdown[2] = node.totalStakingRewards;
        rewardBreakdown[3] = node.totalAntiDumpRewards;
        
        totalRewards = rewardBreakdown[0] + rewardBreakdown[1] + rewardBreakdown[2] + rewardBreakdown[3];
        
        return (nodeId, isActive, totalRewards, rewardBreakdown);
    }
    
    /**
     * @dev 获取系统统计信息
     */
    function getSystemStats() external view returns (
        uint256 totalNodes,
        uint256 activeNodes,
        uint256 availableNodes,
        uint256[4] memory rewardPools
    ) {
        totalNodes = currentNodeId;
        availableNodes = MAX_NODES - currentNodeId;
        
        // 统计活跃节点
        activeNodes = 0;
        for (uint256 i = 1; i <= currentNodeId; i++) {
            if (nodes[i].isActive) {
                activeNodes++;
            }
        }
        
        rewardPools[0] = slippageRewardPool;
        rewardPools[1] = withdrawalFeeRewardPool;
        rewardPools[2] = stakingRewardPool;
        rewardPools[3] = antiDumpRewardPool;
        
        return (totalNodes, activeNodes, availableNodes, rewardPools);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 更新申请费用
     */
    function updateApplicationFee(
        uint256 _basePrice,
        uint256 _highPrice,
        uint256 _threshold
    ) external onlyOwner {
        baseApplicationFee = _basePrice;
        highPriceApplicationFee = _highPrice;
        priceThreshold = _threshold;
        
        emit ApplicationFeeUpdated(_basePrice, _highPrice, _threshold);
    }
    
    /**
     * @dev 更新激活要求
     */
    function updateActivationRequirements(
        uint256 _hcfAmount,
        uint256 _lpAmount
    ) external onlyOwner {
        activationHCFAmount = _hcfAmount;
        activationLPAmount = _lpAmount;
    }
    
    /**
     * @dev 紧急停用节点
     */
    function deactivateNode(uint256 _nodeId) external onlyOwner {
        require(_nodeId > 0 && _nodeId <= currentNodeId, "Invalid node ID");
        require(nodes[_nodeId].isActive, "Node not active");
        
        nodes[_nodeId].isActive = false;
        totalActiveWeight -= nodeWeight[_nodeId];
        
        emit NodeDeactivated(nodes[_nodeId].owner, _nodeId);
    }
    
    /**
     * @dev 管理员提取合约资金 (紧急情况)
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(owner(), _amount);
    }
    
    /**
     * @dev 阻止节点NFT转移 (保持节点与用户绑定)
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        require(to == address(0) || _ownerOf(tokenId) == address(0), "Node NFTs cannot be transferred");
        return super._update(to, tokenId, auth);
    }
}