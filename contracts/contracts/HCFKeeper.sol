// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
// Chainlink Automation接口
interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

interface IHCFStaking {
    function distributeRewards() external;
    function updateDecayFactors() external;
    function processCompoundRewards() external;
}

interface IHCFRanking {
    function updateDailyRankings() external;
    function distributeDailyBonus() external;
    function resetDailyStats() external;
}

interface IHCFBurnMechanism {
    function executeBurn() external;
    function updateBurnCap() external;
}

interface IHCFMarketControl {
    function checkAndApplyAntiDump() external;
    function updateProductionReduction() external;
    function processImpermanentLossProtection() external;
}

interface IUSDTOracle {
    function submitSupplyUpdate(
        uint256 _totalSupply,
        uint256 _ethSupply,
        uint256 _bscSupply,
        uint256 _tronSupply,
        uint256 _otherSupply
    ) external;
}

interface IHCFNodeNFT {
    function updateOnlineStatus(uint256[] calldata tokenIds, bool[] calldata statuses) external;
    function distributeNodeRewards() external;
}

/**
 * @title HCFKeeper
 * @dev Chainlink Keeper自动化合约 - 定时执行系统任务
 * 
 * 自动化任务：
 * - 每日：收益分配、排名更新、销毁执行
 * - 每小时：市场监控、无常损失保护
 * - 每6小时：Oracle数据更新
 * - 每周：产量衰减更新
 */
contract HCFKeeper is AutomationCompatibleInterface, Ownable {
    
    // ============ 状态变量 ============
    
    // 关联合约
    IHCFStaking public stakingContract;
    IHCFRanking public rankingContract;
    IHCFBurnMechanism public burnContract;
    IHCFMarketControl public marketControlContract;
    IUSDTOracle public oracleContract;
    IHCFNodeNFT public nodeContract;
    
    // 任务间隔（秒）
    uint256 public constant DAILY_INTERVAL = 86400;      // 24小时
    uint256 public constant HOURLY_INTERVAL = 3600;      // 1小时
    uint256 public constant SIX_HOUR_INTERVAL = 21600;   // 6小时
    uint256 public constant WEEKLY_INTERVAL = 604800;    // 7天
    
    // 上次执行时间
    mapping(bytes32 => uint256) public lastExecutionTime;
    
    // 任务标识
    bytes32 public constant DAILY_REWARDS = keccak256("DAILY_REWARDS");
    bytes32 public constant DAILY_RANKING = keccak256("DAILY_RANKING");
    bytes32 public constant DAILY_BURN = keccak256("DAILY_BURN");
    bytes32 public constant HOURLY_MARKET = keccak256("HOURLY_MARKET");
    bytes32 public constant SIX_HOUR_ORACLE = keccak256("SIX_HOUR_ORACLE");
    bytes32 public constant WEEKLY_DECAY = keccak256("WEEKLY_DECAY");
    bytes32 public constant DAILY_NODE = keccak256("DAILY_NODE");
    
    // 任务开关
    mapping(bytes32 => bool) public taskEnabled;
    
    // Oracle数据源（示例数据，实际应从链下获取）
    struct OracleData {
        uint256 totalSupply;
        uint256 ethSupply;
        uint256 bscSupply;
        uint256 tronSupply;
        uint256 otherSupply;
    }
    
    OracleData public pendingOracleData;
    
    // ============ 事件 ============
    
    event TaskExecuted(bytes32 indexed taskId, uint256 timestamp);
    event TaskFailed(bytes32 indexed taskId, string reason);
    event ContractsUpdated(address indexed updater);
    event TaskToggled(bytes32 indexed taskId, bool enabled);
    
    // ============ 构造函数 ============
    
    constructor() Ownable(msg.sender) {
        // 默认启用所有任务
        taskEnabled[DAILY_REWARDS] = true;
        taskEnabled[DAILY_RANKING] = true;
        taskEnabled[DAILY_BURN] = true;
        taskEnabled[HOURLY_MARKET] = true;
        taskEnabled[SIX_HOUR_ORACLE] = true;
        taskEnabled[WEEKLY_DECAY] = true;
        taskEnabled[DAILY_NODE] = true;
        
        // 初始化执行时间
        uint256 currentTime = block.timestamp;
        lastExecutionTime[DAILY_REWARDS] = currentTime;
        lastExecutionTime[DAILY_RANKING] = currentTime;
        lastExecutionTime[DAILY_BURN] = currentTime;
        lastExecutionTime[HOURLY_MARKET] = currentTime;
        lastExecutionTime[SIX_HOUR_ORACLE] = currentTime;
        lastExecutionTime[WEEKLY_DECAY] = currentTime;
        lastExecutionTime[DAILY_NODE] = currentTime;
    }
    
    // ============ Chainlink Keeper接口 ============
    
    /**
     * @dev 检查是否需要执行任务
     */
    function checkUpkeep(bytes calldata /* checkData */) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        uint256 currentTime = block.timestamp;
        
        // 检查每日任务
        if (taskEnabled[DAILY_REWARDS] && currentTime >= lastExecutionTime[DAILY_REWARDS] + DAILY_INTERVAL) {
            return (true, abi.encode(DAILY_REWARDS));
        }
        
        if (taskEnabled[DAILY_RANKING] && currentTime >= lastExecutionTime[DAILY_RANKING] + DAILY_INTERVAL) {
            return (true, abi.encode(DAILY_RANKING));
        }
        
        if (taskEnabled[DAILY_BURN] && currentTime >= lastExecutionTime[DAILY_BURN] + DAILY_INTERVAL) {
            return (true, abi.encode(DAILY_BURN));
        }
        
        if (taskEnabled[DAILY_NODE] && currentTime >= lastExecutionTime[DAILY_NODE] + DAILY_INTERVAL) {
            return (true, abi.encode(DAILY_NODE));
        }
        
        // 检查每小时任务
        if (taskEnabled[HOURLY_MARKET] && currentTime >= lastExecutionTime[HOURLY_MARKET] + HOURLY_INTERVAL) {
            return (true, abi.encode(HOURLY_MARKET));
        }
        
        // 检查6小时任务
        if (taskEnabled[SIX_HOUR_ORACLE] && currentTime >= lastExecutionTime[SIX_HOUR_ORACLE] + SIX_HOUR_INTERVAL) {
            return (true, abi.encode(SIX_HOUR_ORACLE));
        }
        
        // 检查每周任务
        if (taskEnabled[WEEKLY_DECAY] && currentTime >= lastExecutionTime[WEEKLY_DECAY] + WEEKLY_INTERVAL) {
            return (true, abi.encode(WEEKLY_DECAY));
        }
        
        return (false, "");
    }
    
    /**
     * @dev 执行任务
     */
    function performUpkeep(bytes calldata performData) external override {
        bytes32 taskId = abi.decode(performData, (bytes32));
        uint256 currentTime = block.timestamp;
        
        // 验证任务需要执行
        require(taskEnabled[taskId], "Task disabled");
        
        if (taskId == DAILY_REWARDS) {
            require(currentTime >= lastExecutionTime[DAILY_REWARDS] + DAILY_INTERVAL, "Too early");
            executeDailyRewards();
            lastExecutionTime[DAILY_REWARDS] = currentTime;
        } else if (taskId == DAILY_RANKING) {
            require(currentTime >= lastExecutionTime[DAILY_RANKING] + DAILY_INTERVAL, "Too early");
            executeDailyRanking();
            lastExecutionTime[DAILY_RANKING] = currentTime;
        } else if (taskId == DAILY_BURN) {
            require(currentTime >= lastExecutionTime[DAILY_BURN] + DAILY_INTERVAL, "Too early");
            executeDailyBurn();
            lastExecutionTime[DAILY_BURN] = currentTime;
        } else if (taskId == DAILY_NODE) {
            require(currentTime >= lastExecutionTime[DAILY_NODE] + DAILY_INTERVAL, "Too early");
            executeDailyNode();
            lastExecutionTime[DAILY_NODE] = currentTime;
        } else if (taskId == HOURLY_MARKET) {
            require(currentTime >= lastExecutionTime[HOURLY_MARKET] + HOURLY_INTERVAL, "Too early");
            executeHourlyMarket();
            lastExecutionTime[HOURLY_MARKET] = currentTime;
        } else if (taskId == SIX_HOUR_ORACLE) {
            require(currentTime >= lastExecutionTime[SIX_HOUR_ORACLE] + SIX_HOUR_INTERVAL, "Too early");
            executeSixHourOracle();
            lastExecutionTime[SIX_HOUR_ORACLE] = currentTime;
        } else if (taskId == WEEKLY_DECAY) {
            require(currentTime >= lastExecutionTime[WEEKLY_DECAY] + WEEKLY_INTERVAL, "Too early");
            executeWeeklyDecay();
            lastExecutionTime[WEEKLY_DECAY] = currentTime;
        }
        
        emit TaskExecuted(taskId, currentTime);
    }
    
    // ============ 任务执行函数 ============
    
    /**
     * @dev 执行每日收益分配
     */
    function executeDailyRewards() internal {
        if (address(stakingContract) != address(0)) {
            try stakingContract.distributeRewards() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_REWARDS, reason);
            }
            
            try stakingContract.processCompoundRewards() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_REWARDS, string(abi.encodePacked("Compound: ", reason)));
            }
        }
    }
    
    /**
     * @dev 执行每日排名更新
     */
    function executeDailyRanking() internal {
        if (address(rankingContract) != address(0)) {
            try rankingContract.updateDailyRankings() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_RANKING, reason);
            }
            
            try rankingContract.distributeDailyBonus() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_RANKING, string(abi.encodePacked("Bonus: ", reason)));
            }
            
            try rankingContract.resetDailyStats() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_RANKING, string(abi.encodePacked("Reset: ", reason)));
            }
        }
    }
    
    /**
     * @dev 执行每日销毁
     */
    function executeDailyBurn() internal {
        if (address(burnContract) != address(0)) {
            try burnContract.executeBurn() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_BURN, reason);
            }
            
            try burnContract.updateBurnCap() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_BURN, string(abi.encodePacked("Cap: ", reason)));
            }
        }
    }
    
    /**
     * @dev 执行每日节点任务
     */
    function executeDailyNode() internal {
        if (address(nodeContract) != address(0)) {
            try nodeContract.distributeNodeRewards() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(DAILY_NODE, reason);
            }
        }
    }
    
    /**
     * @dev 执行每小时市场监控
     */
    function executeHourlyMarket() internal {
        if (address(marketControlContract) != address(0)) {
            try marketControlContract.checkAndApplyAntiDump() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(HOURLY_MARKET, reason);
            }
            
            try marketControlContract.processImpermanentLossProtection() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(HOURLY_MARKET, string(abi.encodePacked("IL: ", reason)));
            }
        }
    }
    
    /**
     * @dev 执行6小时Oracle更新
     */
    function executeSixHourOracle() internal {
        if (address(oracleContract) != address(0) && pendingOracleData.totalSupply > 0) {
            try oracleContract.submitSupplyUpdate(
                pendingOracleData.totalSupply,
                pendingOracleData.ethSupply,
                pendingOracleData.bscSupply,
                pendingOracleData.tronSupply,
                pendingOracleData.otherSupply
            ) {
                // 重置数据
                pendingOracleData = OracleData(0, 0, 0, 0, 0);
            } catch Error(string memory reason) {
                emit TaskFailed(SIX_HOUR_ORACLE, reason);
            }
        }
    }
    
    /**
     * @dev 执行每周衰减更新
     */
    function executeWeeklyDecay() internal {
        if (address(stakingContract) != address(0)) {
            try stakingContract.updateDecayFactors() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(WEEKLY_DECAY, reason);
            }
        }
        
        if (address(marketControlContract) != address(0)) {
            try marketControlContract.updateProductionReduction() {
                // 成功
            } catch Error(string memory reason) {
                emit TaskFailed(WEEKLY_DECAY, string(abi.encodePacked("Production: ", reason)));
            }
        }
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 设置关联合约
     */
    function setContracts(
        address _staking,
        address _ranking,
        address _burn,
        address _marketControl,
        address _oracle,
        address _node
    ) external onlyOwner {
        stakingContract = IHCFStaking(_staking);
        rankingContract = IHCFRanking(_ranking);
        burnContract = IHCFBurnMechanism(_burn);
        marketControlContract = IHCFMarketControl(_marketControl);
        oracleContract = IUSDTOracle(_oracle);
        nodeContract = IHCFNodeNFT(_node);
        
        emit ContractsUpdated(msg.sender);
    }
    
    /**
     * @dev 设置Oracle数据（链下数据源提供）
     */
    function setOracleData(
        uint256 _totalSupply,
        uint256 _ethSupply,
        uint256 _bscSupply,
        uint256 _tronSupply,
        uint256 _otherSupply
    ) external onlyOwner {
        require(_totalSupply == _ethSupply + _bscSupply + _tronSupply + _otherSupply, "Invalid data");
        
        pendingOracleData = OracleData({
            totalSupply: _totalSupply,
            ethSupply: _ethSupply,
            bscSupply: _bscSupply,
            tronSupply: _tronSupply,
            otherSupply: _otherSupply
        });
    }
    
    /**
     * @dev 开关任务
     */
    function toggleTask(bytes32 _taskId, bool _enabled) external onlyOwner {
        taskEnabled[_taskId] = _enabled;
        emit TaskToggled(_taskId, _enabled);
    }
    
    /**
     * @dev 手动执行任务（紧急情况）
     */
    function manualExecute(bytes32 _taskId) external onlyOwner {
        if (_taskId == DAILY_REWARDS) {
            executeDailyRewards();
        } else if (_taskId == DAILY_RANKING) {
            executeDailyRanking();
        } else if (_taskId == DAILY_BURN) {
            executeDailyBurn();
        } else if (_taskId == DAILY_NODE) {
            executeDailyNode();
        } else if (_taskId == HOURLY_MARKET) {
            executeHourlyMarket();
        } else if (_taskId == SIX_HOUR_ORACLE) {
            executeSixHourOracle();
        } else if (_taskId == WEEKLY_DECAY) {
            executeWeeklyDecay();
        }
        
        lastExecutionTime[_taskId] = block.timestamp;
        emit TaskExecuted(_taskId, block.timestamp);
    }
    
    /**
     * @dev 获取任务信息
     */
    function getTaskInfo(bytes32 _taskId) external view returns (
        bool enabled,
        uint256 lastExecution,
        uint256 nextExecution,
        uint256 interval
    ) {
        enabled = taskEnabled[_taskId];
        lastExecution = lastExecutionTime[_taskId];
        
        if (_taskId == DAILY_REWARDS || _taskId == DAILY_RANKING || 
            _taskId == DAILY_BURN || _taskId == DAILY_NODE) {
            interval = DAILY_INTERVAL;
        } else if (_taskId == HOURLY_MARKET) {
            interval = HOURLY_INTERVAL;
        } else if (_taskId == SIX_HOUR_ORACLE) {
            interval = SIX_HOUR_INTERVAL;
        } else if (_taskId == WEEKLY_DECAY) {
            interval = WEEKLY_INTERVAL;
        }
        
        nextExecution = lastExecution + interval;
    }
    
    /**
     * @dev 批量更新节点在线状态
     */
    function updateNodeStatuses(uint256[] calldata tokenIds, bool[] calldata statuses) external onlyOwner {
        require(tokenIds.length == statuses.length, "Length mismatch");
        if (address(nodeContract) != address(0)) {
            nodeContract.updateOnlineStatus(tokenIds, statuses);
        }
    }
}