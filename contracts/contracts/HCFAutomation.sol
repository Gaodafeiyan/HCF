// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IHCFStaking {
    function distributeRewards() external;
    function updateCompoundRewards() external;
}

interface IHCFRanking {
    function updateStakingRanking() external;
    function updateCommunityRanking() external;
}

interface IHCFToken {
    function executeBurn() external;
    function updatePrice() external;
}

interface IHCFNodeNFT {
    function distributeNodeRewards() external;
    function updateNodePower() external;
}

interface IHCFProtection {
    function checkPriceAndProtect() external;
    function timedBurn() external;
}

interface IHCFBSDTExchange {
    function monitorUSDTTransfer(address user, uint256 amount) external;
    function monitorBSDTTransfer(address user, uint256 amount) external;
}

interface IUSDT {
    function balanceOf(address account) external view returns (uint256);
}

interface IBSDT {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title HCFAutomation
 * @dev Chainlink Keeper自动化和监控系统
 * 
 * 自动执行任务：
 * - 每日任务：收益分发、排名更新、销毁执行
 * - 每小时任务：节点奖励、市场监控、价格更新
 * - 实时监控：异常检测、转账自动化（USDT→BSDT）
 * - 紧急响应：防护触发、无常损失补偿
 */
contract HCFAutomation is KeeperCompatibleInterface, Ownable {
    
    // ============ 状态变量 ============
    
    // 合约接口
    IHCFStaking public stakingContract;
    IHCFRanking public rankingContract;
    IHCFToken public hcfToken;
    IHCFNodeNFT public nodeContract;
    IHCFProtection public protectionContract;
    IHCFBSDTExchange public exchangeContract;
    IUSDT public usdtToken;
    IBSDT public bsdtToken;
    
    // 任务间隔
    uint256 public constant HOURLY_INTERVAL = 1 hours;
    uint256 public constant DAILY_INTERVAL = 24 hours;
    uint256 public constant WEEKLY_INTERVAL = 7 days;
    
    // 上次执行时间
    mapping(bytes32 => uint256) public lastExecutionTime;
    
    // 任务标识
    bytes32 public constant TASK_STAKING_REWARDS = keccak256("STAKING_REWARDS");
    bytes32 public constant TASK_RANKING_UPDATE = keccak256("RANKING_UPDATE");
    bytes32 public constant TASK_TOKEN_BURN = keccak256("TOKEN_BURN");
    bytes32 public constant TASK_NODE_REWARDS = keccak256("NODE_REWARDS");
    bytes32 public constant TASK_PRICE_UPDATE = keccak256("PRICE_UPDATE");
    bytes32 public constant TASK_MARKET_MONITOR = keccak256("MARKET_MONITOR");
    bytes32 public constant TASK_PROTECTION_CHECK = keccak256("PROTECTION_CHECK");
    bytes32 public constant TASK_TRANSFER_MONITOR = keccak256("TRANSFER_MONITOR");
    
    // 监控地址
    mapping(address => bool) public monitoredWallets;
    address[] public monitoredWalletList;
    
    // 自动转账配置
    struct AutoTransferConfig {
        bool enabled;
        uint256 minAmount;      // 最小触发金额
        uint256 checkInterval;  // 检查间隔
    }
    
    AutoTransferConfig public autoTransferConfig;
    
    // 异常检测
    struct AnomalyConfig {
        uint256 priceDropThreshold;   // 价格下跌阈值
        uint256 volumeSpikeThreshold; // 交易量激增阈值
        uint256 gasSpikeTreshold;     // Gas激增阈值
        bool alertsEnabled;
    }
    
    AnomalyConfig public anomalyConfig;
    
    // 任务启用状态
    mapping(bytes32 => bool) public taskEnabled;
    
    // ============ 事件 ============
    
    event TaskExecuted(bytes32 indexed taskId, uint256 timestamp);
    event AutoTransferExecuted(address indexed wallet, uint256 usdtAmount, uint256 bsdtAmount);
    event AnomalyDetected(string anomalyType, uint256 value);
    event KeeperUpkeepPerformed(uint256 timestamp, uint256 gasUsed);
    
    // ============ 构造函数 ============
    
    constructor(
        address _stakingContract,
        address _rankingContract,
        address _hcfToken,
        address _nodeContract,
        address _protectionContract,
        address _exchangeContract,
        address _usdtToken,
        address _bsdtToken
    ) Ownable(msg.sender) {
        stakingContract = IHCFStaking(_stakingContract);
        rankingContract = IHCFRanking(_rankingContract);
        hcfToken = IHCFToken(_hcfToken);
        nodeContract = IHCFNodeNFT(_nodeContract);
        protectionContract = IHCFProtection(_protectionContract);
        exchangeContract = IHCFBSDTExchange(_exchangeContract);
        usdtToken = IUSDT(_usdtToken);
        bsdtToken = IBSDT(_bsdtToken);
        
        // 初始化自动转账配置
        autoTransferConfig = AutoTransferConfig({
            enabled: true,
            minAmount: 100 * 10**18,  // 最小100 USDT
            checkInterval: 5 minutes   // 每5分钟检查
        });
        
        // 初始化异常检测配置
        anomalyConfig = AnomalyConfig({
            priceDropThreshold: 1000,  // 10%
            volumeSpikeThreshold: 5000, // 50%
            gasSpikeTreshold: 500 gwei,
            alertsEnabled: true
        });
        
        // 启用所有任务
        taskEnabled[TASK_STAKING_REWARDS] = true;
        taskEnabled[TASK_RANKING_UPDATE] = true;
        taskEnabled[TASK_TOKEN_BURN] = true;
        taskEnabled[TASK_NODE_REWARDS] = true;
        taskEnabled[TASK_PRICE_UPDATE] = true;
        taskEnabled[TASK_MARKET_MONITOR] = true;
        taskEnabled[TASK_PROTECTION_CHECK] = true;
        taskEnabled[TASK_TRANSFER_MONITOR] = true;
    }
    
    // ============ Chainlink Keeper 接口 ============
    
    /**
     * @dev 检查是否需要执行维护
     */
    function checkUpkeep(bytes calldata checkData) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        // 检查每日任务
        if (_shouldExecuteDaily()) {
            return (true, abi.encode("DAILY"));
        }
        
        // 检查每小时任务
        if (_shouldExecuteHourly()) {
            return (true, abi.encode("HOURLY"));
        }
        
        // 检查转账监控
        if (_shouldMonitorTransfers()) {
            return (true, abi.encode("TRANSFER"));
        }
        
        // 检查异常
        if (_shouldCheckAnomalies()) {
            return (true, abi.encode("ANOMALY"));
        }
        
        return (false, "");
    }
    
    /**
     * @dev 执行维护任务
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256 startGas = gasleft();
        
        string memory taskType = abi.decode(performData, (string));
        
        if (keccak256(bytes(taskType)) == keccak256(bytes("DAILY"))) {
            _executeDailyTasks();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("HOURLY"))) {
            _executeHourlyTasks();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("TRANSFER"))) {
            _executeTransferMonitoring();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("ANOMALY"))) {
            _checkAndHandleAnomalies();
        }
        
        uint256 gasUsed = startGas - gasleft();
        emit KeeperUpkeepPerformed(block.timestamp, gasUsed);
    }
    
    // ============ 任务检查函数 ============
    
    function _shouldExecuteDaily() internal view returns (bool) {
        return block.timestamp >= lastExecutionTime[TASK_STAKING_REWARDS] + DAILY_INTERVAL ||
               block.timestamp >= lastExecutionTime[TASK_RANKING_UPDATE] + DAILY_INTERVAL ||
               block.timestamp >= lastExecutionTime[TASK_TOKEN_BURN] + DAILY_INTERVAL;
    }
    
    function _shouldExecuteHourly() internal view returns (bool) {
        return block.timestamp >= lastExecutionTime[TASK_NODE_REWARDS] + HOURLY_INTERVAL ||
               block.timestamp >= lastExecutionTime[TASK_PRICE_UPDATE] + HOURLY_INTERVAL ||
               block.timestamp >= lastExecutionTime[TASK_MARKET_MONITOR] + HOURLY_INTERVAL;
    }
    
    function _shouldMonitorTransfers() internal view returns (bool) {
        if (!autoTransferConfig.enabled) return false;
        if (block.timestamp < lastExecutionTime[TASK_TRANSFER_MONITOR] + autoTransferConfig.checkInterval) {
            return false;
        }
        
        // 检查监控钱包是否有USDT需要转换
        for (uint256 i = 0; i < monitoredWalletList.length; i++) {
            uint256 usdtBalance = usdtToken.balanceOf(monitoredWalletList[i]);
            if (usdtBalance >= autoTransferConfig.minAmount) {
                return true;
            }
        }
        return false;
    }
    
    function _shouldCheckAnomalies() internal view returns (bool) {
        if (!anomalyConfig.alertsEnabled) return false;
        return block.timestamp >= lastExecutionTime[TASK_PROTECTION_CHECK] + 5 minutes;
    }
    
    // ============ 任务执行函数 ============
    
    /**
     * @dev 执行每日任务
     */
    function _executeDailyTasks() internal {
        // 1. 分发质押收益
        if (taskEnabled[TASK_STAKING_REWARDS]) {
            try stakingContract.distributeRewards() {
                lastExecutionTime[TASK_STAKING_REWARDS] = block.timestamp;
                emit TaskExecuted(TASK_STAKING_REWARDS, block.timestamp);
            } catch {}
        }
        
        // 2. 更新排名
        if (taskEnabled[TASK_RANKING_UPDATE]) {
            try rankingContract.updateStakingRanking() {} catch {}
            try rankingContract.updateCommunityRanking() {} catch {}
            lastExecutionTime[TASK_RANKING_UPDATE] = block.timestamp;
            emit TaskExecuted(TASK_RANKING_UPDATE, block.timestamp);
        }
        
        // 3. 执行代币销毁
        if (taskEnabled[TASK_TOKEN_BURN]) {
            try hcfToken.executeBurn() {
                lastExecutionTime[TASK_TOKEN_BURN] = block.timestamp;
                emit TaskExecuted(TASK_TOKEN_BURN, block.timestamp);
            } catch {}
            
            // 定时销毁
            try protectionContract.timedBurn() {} catch {}
        }
    }
    
    /**
     * @dev 执行每小时任务
     */
    function _executeHourlyTasks() internal {
        // 1. 分发节点奖励
        if (taskEnabled[TASK_NODE_REWARDS]) {
            try nodeContract.distributeNodeRewards() {
                lastExecutionTime[TASK_NODE_REWARDS] = block.timestamp;
                emit TaskExecuted(TASK_NODE_REWARDS, block.timestamp);
            } catch {}
            
            // 更新节点算力
            try nodeContract.updateNodePower() {} catch {}
        }
        
        // 2. 更新价格
        if (taskEnabled[TASK_PRICE_UPDATE]) {
            try hcfToken.updatePrice() {
                lastExecutionTime[TASK_PRICE_UPDATE] = block.timestamp;
                emit TaskExecuted(TASK_PRICE_UPDATE, block.timestamp);
            } catch {}
        }
        
        // 3. 市场监控
        if (taskEnabled[TASK_MARKET_MONITOR]) {
            try protectionContract.checkPriceAndProtect() {
                lastExecutionTime[TASK_MARKET_MONITOR] = block.timestamp;
                emit TaskExecuted(TASK_MARKET_MONITOR, block.timestamp);
            } catch {}
        }
    }
    
    /**
     * @dev 执行转账监控（USDT自动转BSDT）
     */
    function _executeTransferMonitoring() internal {
        if (!taskEnabled[TASK_TRANSFER_MONITOR]) return;
        
        for (uint256 i = 0; i < monitoredWalletList.length; i++) {
            address wallet = monitoredWalletList[i];
            
            // 检查USDT余额
            uint256 usdtBalance = usdtToken.balanceOf(wallet);
            if (usdtBalance >= autoTransferConfig.minAmount) {
                // 自动执行USDT→BSDT转换
                try exchangeContract.monitorUSDTTransfer(wallet, usdtBalance) {
                    emit AutoTransferExecuted(wallet, usdtBalance, usdtBalance);
                } catch {}
            }
            
            // 检查BSDT余额（自动转97% USDT）
            uint256 bsdtBalance = bsdtToken.balanceOf(wallet);
            if (bsdtBalance >= autoTransferConfig.minAmount) {
                try exchangeContract.monitorBSDTTransfer(wallet, bsdtBalance) {
                    uint256 usdtOut = (bsdtBalance * 97) / 100;
                    emit AutoTransferExecuted(wallet, usdtOut, bsdtBalance);
                } catch {}
            }
        }
        
        lastExecutionTime[TASK_TRANSFER_MONITOR] = block.timestamp;
        emit TaskExecuted(TASK_TRANSFER_MONITOR, block.timestamp);
    }
    
    /**
     * @dev 检查和处理异常
     */
    function _checkAndHandleAnomalies() internal {
        // 检查价格异常
        // 这里需要实际的价格Oracle接口
        
        // 检查Gas价格异常
        if (tx.gasprice > anomalyConfig.gasSpikeTreshold) {
            emit AnomalyDetected("GAS_SPIKE", tx.gasprice);
        }
        
        lastExecutionTime[TASK_PROTECTION_CHECK] = block.timestamp;
        emit TaskExecuted(TASK_PROTECTION_CHECK, block.timestamp);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 添加监控钱包
     */
    function addMonitoredWallet(address wallet) external onlyOwner {
        if (!monitoredWallets[wallet]) {
            monitoredWallets[wallet] = true;
            monitoredWalletList.push(wallet);
        }
    }
    
    /**
     * @dev 移除监控钱包
     */
    function removeMonitoredWallet(address wallet) external onlyOwner {
        monitoredWallets[wallet] = false;
        
        // 从列表中移除
        for (uint256 i = 0; i < monitoredWalletList.length; i++) {
            if (monitoredWalletList[i] == wallet) {
                monitoredWalletList[i] = monitoredWalletList[monitoredWalletList.length - 1];
                monitoredWalletList.pop();
                break;
            }
        }
    }
    
    /**
     * @dev 更新自动转账配置
     */
    function updateAutoTransferConfig(
        bool _enabled,
        uint256 _minAmount,
        uint256 _checkInterval
    ) external onlyOwner {
        autoTransferConfig.enabled = _enabled;
        autoTransferConfig.minAmount = _minAmount;
        autoTransferConfig.checkInterval = _checkInterval;
    }
    
    /**
     * @dev 更新异常检测配置
     */
    function updateAnomalyConfig(
        uint256 _priceDropThreshold,
        uint256 _volumeSpikeThreshold,
        uint256 _gasSpikeTreshold,
        bool _alertsEnabled
    ) external onlyOwner {
        anomalyConfig.priceDropThreshold = _priceDropThreshold;
        anomalyConfig.volumeSpikeThreshold = _volumeSpikeThreshold;
        anomalyConfig.gasSpikeTreshold = _gasSpikeTreshold;
        anomalyConfig.alertsEnabled = _alertsEnabled;
    }
    
    /**
     * @dev 启用/禁用任务
     */
    function setTaskEnabled(bytes32 taskId, bool enabled) external onlyOwner {
        taskEnabled[taskId] = enabled;
    }
    
    /**
     * @dev 手动触发任务（用于测试）
     */
    function manualTrigger(string memory taskType) external onlyOwner {
        if (keccak256(bytes(taskType)) == keccak256(bytes("DAILY"))) {
            _executeDailyTasks();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("HOURLY"))) {
            _executeHourlyTasks();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("TRANSFER"))) {
            _executeTransferMonitoring();
        } else if (keccak256(bytes(taskType)) == keccak256(bytes("ANOMALY"))) {
            _checkAndHandleAnomalies();
        }
    }
    
    /**
     * @dev 获取监控钱包列表
     */
    function getMonitoredWallets() external view returns (address[] memory) {
        return monitoredWalletList;
    }
    
    /**
     * @dev 获取任务状态
     */
    function getTaskStatus(bytes32 taskId) external view returns (
        bool enabled,
        uint256 lastExecution,
        uint256 nextExecution
    ) {
        enabled = taskEnabled[taskId];
        lastExecution = lastExecutionTime[taskId];
        
        if (taskId == TASK_STAKING_REWARDS || 
            taskId == TASK_RANKING_UPDATE || 
            taskId == TASK_TOKEN_BURN) {
            nextExecution = lastExecution + DAILY_INTERVAL;
        } else if (taskId == TASK_NODE_REWARDS || 
                   taskId == TASK_PRICE_UPDATE || 
                   taskId == TASK_MARKET_MONITOR) {
            nextExecution = lastExecution + HOURLY_INTERVAL;
        } else if (taskId == TASK_TRANSFER_MONITOR) {
            nextExecution = lastExecution + autoTransferConfig.checkInterval;
        } else {
            nextExecution = lastExecution + 5 minutes;
        }
    }
}