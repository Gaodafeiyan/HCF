// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function burn(uint256 amount) external;
}

interface IPriceOracle {
    function getPrice() external view returns (uint256);
    function updatePrice() external;
}

interface IHCFStaking {
    function updatePriceImpact(uint256 _priceChangePercent) external;
    function getAntiDumpStatus() external view returns (uint256, uint256, uint256);
}

interface IHCFNodeNFT {
    function distributeAntiDumpRewards(uint256 _amount) external;
}

/**
 * @title HCFMarketControl
 * @dev 防暴跌市场控制系统
 * 
 * 功能包括:
 * - 防暴跌机制 (动态税收调整)
 * - 减产机制 (质押收益调整)
 * - 房损保护 (损失补偿)
 * - 控盘燃烧 (自动燃烧机制)
 * - 价格监控和预警
 */
contract HCFMarketControl is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IPriceOracle public priceOracle;
    IHCFStaking public stakingContract;
    IHCFNodeNFT public nodeNFT;
    
    // 900万调控底池 - 文档要求的调控机制
    uint256 public constant CONTROL_POOL = 9_000_000 * 10**18; // 900万HCF调控池
    uint256 public controlPoolUsed; // 已使用的调控资金
    uint256 public controlPoolAvailable; // 可用调控资金
    uint256 public controlPoolFunds; // 管理员添加的资金用于稳价
    
    // 价格监控
    uint256 public currentPrice;
    uint256 public previousPrice;
    uint256 public priceUpdateTime;
    uint256 public constant PRICE_UPDATE_INTERVAL = 1 hours;
    uint256 public targetPrice = 1 * 10**18; // 目标价格 1 USD
    uint256 public interventionCooldown = 3600; // 干预冷却时间
    
    // 防暴跌参数
    struct AntiDumpConfig {
        uint256 threshold10;        // 10%跌幅阈值
        uint256 threshold30;        // 30%跌幅阈值  
        uint256 threshold50;        // 50%跌幅阈值
        uint256 additionalTax10;    // 10%跌幅额外税收 (5%)
        uint256 additionalTax30;    // 30%跌幅额外税收 (15%)
        uint256 additionalTax50;    // 50%跌幅额外税收 (30%)
        uint256 burnRate10;         // 10%跌幅燃烧率 (3%)
        uint256 burnRate30;         // 30%跌幅燃烧率 (10%)
        uint256 burnRate50;         // 50%跌幅燃烧率 (20%)
        uint256 nodeRate10;         // 10%跌幅节点分红 (2%)
        uint256 nodeRate30;         // 30%跌幅节点分红 (5%)
        uint256 nodeRate50;         // 50%跌幅节点分红 (10%)
    }
    
    AntiDumpConfig public antiDumpConfig;
    
    // 减产机制参数
    struct ProductionConfig {
        uint256 reductionRate10;    // 10%跌幅减产率 (5%)
        uint256 reductionRate30;    // 30%跌幅减产率 (15%)
        uint256 reductionRate50;    // 50%跌幅减产率 (30%)
        uint256 recoveryTime;       // 恢复时间 (24小时)
        uint256 lastReductionTime;  // 最后减产时间
    }
    
    ProductionConfig public productionConfig;
    
    // 房损保护参数
    struct LossProtectionConfig {
        uint256 protectionThreshold;    // 保护阈值 (30%)
        uint256 compensationRate;       // 补偿率 (50%)
        uint256 maxCompensation;        // 单次最大补偿
        uint256 protectionPool;         // 保护资金池
        mapping(address => uint256) userLossRecord; // 用户损失记录
        mapping(address => uint256) lastClaimTime;  // 最后申请时间
    }
    
    LossProtectionConfig public lossProtection;
    
    // 控盘燃烧参数
    struct BurnConfig {
        uint256 priceStabilityBurn;     // 价格稳定燃烧率
        uint256 volumeBurn;             // 交易量燃烧率
        uint256 timeBurn;               // 定时燃烧率
        uint256 lastBurnTime;           // 最后燃烧时间
        uint256 burnInterval;           // 燃烧间隔 (24小时)
        uint256 totalBurned;            // 总燃烧量
    }
    
    BurnConfig public burnConfig;
    
    // 当前市场状态
    enum MarketState { NORMAL, DUMP_10, DUMP_30, DUMP_50 }
    MarketState public currentMarketState = MarketState.NORMAL;
    
    // 紧急模式
    bool public emergencyMode = false;
    uint256 public emergencyActivationTime;
    
    // 交易量监控
    uint256 public dailyVolume;
    uint256 public lastVolumeResetTime;
    uint256 public constant VOLUME_RESET_INTERVAL = 24 hours;
    
    // ============ 事件 ============
    
    event PriceUpdated(uint256 newPrice, uint256 oldPrice, uint256 changePercent);
    event MarketStateChanged(MarketState oldState, MarketState newState);
    event AntiDumpTriggered(uint256 priceImpact, uint256 additionalTax, uint256 burnAmount);
    event ProductionReduced(uint256 reductionRate, uint256 duration);
    event LossCompensation(address indexed user, uint256 lossAmount, uint256 compensation);
    event ControlBurnExecuted(uint256 burnAmount, string burnType);
    event EmergencyModeActivated(uint256 activationTime);
    event EmergencyModeDeactivated(uint256 deactivationTime);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _priceOracle,
        address _stakingContract,
        address _nodeNFT
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        priceOracle = IPriceOracle(_priceOracle);
        stakingContract = IHCFStaking(_stakingContract);
        nodeNFT = IHCFNodeNFT(_nodeNFT);
        
        _initializeConfigs();
    }
    
    function _initializeConfigs() internal {
        // 防暴跌配置
        antiDumpConfig = AntiDumpConfig({
            threshold10: 1000,      // 10%
            threshold30: 3000,      // 30%
            threshold50: 5000,      // 50%
            additionalTax10: 500,   // 5%
            additionalTax30: 1500,  // 15%
            additionalTax50: 3000,  // 30%
            burnRate10: 300,        // 3%
            burnRate30: 1000,       // 10%
            burnRate50: 2000,       // 20%
            nodeRate10: 200,        // 2%
            nodeRate30: 500,        // 5%
            nodeRate50: 1000        // 10%
        });
        
        // 减产机制配置
        productionConfig = ProductionConfig({
            reductionRate10: 500,       // 5%
            reductionRate30: 1500,      // 15%
            reductionRate50: 3000,      // 30%
            recoveryTime: 24 hours,
            lastReductionTime: 0
        });
        
        // 房损保护配置
        lossProtection.protectionThreshold = 3000;     // 30%
        lossProtection.compensationRate = 5000;        // 50%
        lossProtection.maxCompensation = 10000 * 10**18; // 10000 HCF
        
        // 控盘燃烧配置
        burnConfig = BurnConfig({
            priceStabilityBurn: 100,    // 1%
            volumeBurn: 50,             // 0.5%
            timeBurn: 200,              // 2%
            lastBurnTime: block.timestamp,
            burnInterval: 24 hours,
            totalBurned: 0
        });
    }
    
    // ============ 价格监控和更新 ============
    
    /**
     * @dev 更新价格并触发相应机制
     */
    function updatePrice() external {
        require(
            block.timestamp >= priceUpdateTime + PRICE_UPDATE_INTERVAL || 
            msg.sender == owner(),
            "Too early to update"
        );
        
        previousPrice = currentPrice;
        currentPrice = priceOracle.getPrice();
        priceUpdateTime = block.timestamp;
        
        if (previousPrice > 0) {
            uint256 priceChange = _calculatePriceChange();
            _updateMarketState(priceChange);
            
            emit PriceUpdated(currentPrice, previousPrice, priceChange);
        }
    }
    
    function _calculatePriceChange() internal view returns (uint256) {
        if (currentPrice >= previousPrice) {
            return 0; // 价格上涨或持平
        }
        
        uint256 decrease = previousPrice - currentPrice;
        return (decrease * 10000) / previousPrice; // 返回基点 (bp)
    }
    
    /**
     * @dev 更新市场状态并触发相应机制
     */
    function _updateMarketState(uint256 _priceChange) internal {
        MarketState oldState = currentMarketState;
        MarketState newState = _determineMarketState(_priceChange);
        
        if (newState != oldState) {
            currentMarketState = newState;
            _triggerMarketMechanisms(_priceChange);
            
            emit MarketStateChanged(oldState, newState);
        }
    }
    
    function _determineMarketState(uint256 _priceChange) internal view returns (MarketState) {
        if (_priceChange >= antiDumpConfig.threshold50) {
            return MarketState.DUMP_50;
        } else if (_priceChange >= antiDumpConfig.threshold30) {
            return MarketState.DUMP_30;
        } else if (_priceChange >= antiDumpConfig.threshold10) {
            return MarketState.DUMP_10;
        } else {
            return MarketState.NORMAL;
        }
    }
    
    // ============ 市场控制机制 ============
    
    /**
     * @dev 触发所有市场控制机制
     */
    function _triggerMarketMechanisms(uint256 _priceChange) internal {
        if (currentMarketState != MarketState.NORMAL) {
            _executeAntiDump(_priceChange);
            _executeProductionReduction();
            _executeControlBurn();
            
            // 通知质押合约更新参数
            stakingContract.updatePriceImpact(_priceChange);
        }
    }
    
    /**
     * @dev 执行防暴跌机制
     */
    function _executeAntiDump(uint256 _priceChange) internal {
        (uint256 additionalTax, uint256 burnRate, uint256 nodeRate) = _getAntiDumpRates();
        
        // 计算燃烧量
        uint256 burnAmount = (hcfToken.balanceOf(address(this)) * burnRate) / 10000;
        if (burnAmount > 0) {
            hcfToken.burn(burnAmount);
        }
        
        // 分发节点奖励
        uint256 nodeReward = (hcfToken.balanceOf(address(this)) * nodeRate) / 10000;
        if (nodeReward > 0 && address(nodeNFT) != address(0)) {
            nodeNFT.distributeAntiDumpRewards(nodeReward);
        }
        
        emit AntiDumpTriggered(_priceChange, additionalTax, burnAmount);
    }
    
    function _getAntiDumpRates() internal view returns (uint256, uint256, uint256) {
        if (currentMarketState == MarketState.DUMP_50) {
            return (antiDumpConfig.additionalTax50, antiDumpConfig.burnRate50, antiDumpConfig.nodeRate50);
        } else if (currentMarketState == MarketState.DUMP_30) {
            return (antiDumpConfig.additionalTax30, antiDumpConfig.burnRate30, antiDumpConfig.nodeRate30);
        } else if (currentMarketState == MarketState.DUMP_10) {
            return (antiDumpConfig.additionalTax10, antiDumpConfig.burnRate10, antiDumpConfig.nodeRate10);
        }
        return (0, 0, 0);
    }
    
    /**
     * @dev 执行减产机制
     */
    function _executeProductionReduction() internal {
        uint256 reductionRate = _getProductionReductionRate();
        
        productionConfig.lastReductionTime = block.timestamp;
        
        emit ProductionReduced(reductionRate, productionConfig.recoveryTime);
    }
    
    function _getProductionReductionRate() internal view returns (uint256) {
        if (currentMarketState == MarketState.DUMP_50) {
            return productionConfig.reductionRate50;
        } else if (currentMarketState == MarketState.DUMP_30) {
            return productionConfig.reductionRate30;
        } else if (currentMarketState == MarketState.DUMP_10) {
            return productionConfig.reductionRate10;
        }
        return 0;
    }
    
    // ============ 房损保护机制 ============
    
    /**
     * @dev 申请房损保护补偿
     * @param _lossAmount 损失金额
     */
    function claimLossProtection(uint256 _lossAmount) external nonReentrant {
        require(_lossAmount > 0, "Loss amount must be positive");
        require(
            block.timestamp >= lossProtection.lastClaimTime[msg.sender] + 24 hours,
            "Too early to claim again"
        );
        
        // 验证损失 (简化版本，实际需要更复杂的验证逻辑)
        uint256 priceChange = _calculatePriceChange();
        require(priceChange >= lossProtection.protectionThreshold, "Price drop insufficient");
        
        // 计算补偿
        uint256 compensation = (_lossAmount * lossProtection.compensationRate) / 10000;
        if (compensation > lossProtection.maxCompensation) {
            compensation = lossProtection.maxCompensation;
        }
        
        require(compensation <= lossProtection.protectionPool, "Insufficient protection pool");
        
        // 发放补偿
        lossProtection.protectionPool -= compensation;
        lossProtection.userLossRecord[msg.sender] += _lossAmount;
        lossProtection.lastClaimTime[msg.sender] = block.timestamp;
        
        require(hcfToken.transfer(msg.sender, compensation), "Compensation transfer failed");
        
        emit LossCompensation(msg.sender, _lossAmount, compensation);
    }
    
    /**
     * @dev 向保护池注入资金
     */
    function fundProtectionPool(uint256 _amount) external {
        require(hcfToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        lossProtection.protectionPool += _amount;
    }
    
    // ============ 控盘燃烧机制 ============
    
    /**
     * @dev 执行控盘燃烧
     */
    function _executeControlBurn() internal {
        uint256 burnAmount = _calculateControlBurnAmount();
        
        if (burnAmount > 0) {
            hcfToken.burn(burnAmount);
            burnConfig.totalBurned += burnAmount;
            
            emit ControlBurnExecuted(burnAmount, "Anti-dump burn");
        }
    }
    
    /**
     * @dev 定时燃烧机制
     */
    function executeTimedBurn() external {
        require(
            block.timestamp >= burnConfig.lastBurnTime + burnConfig.burnInterval,
            "Too early for timed burn"
        );
        
        uint256 burnAmount = (hcfToken.balanceOf(address(this)) * burnConfig.timeBurn) / 10000;
        
        if (burnAmount > 0) {
            hcfToken.burn(burnAmount);
            burnConfig.totalBurned += burnAmount;
            burnConfig.lastBurnTime = block.timestamp;
            
            emit ControlBurnExecuted(burnAmount, "Timed burn");
        }
    }
    
    function _calculateControlBurnAmount() internal view returns (uint256) {
        uint256 balance = hcfToken.balanceOf(address(this));
        return (balance * burnConfig.priceStabilityBurn) / 10000;
    }
    
    // ============ 紧急模式 ============
    
    /**
     * @dev 激活紧急模式
     */
    function activateEmergencyMode() external onlyOwner {
        require(!emergencyMode, "Already in emergency mode");
        
        emergencyMode = true;
        emergencyActivationTime = block.timestamp;
        
        // 紧急模式下的特殊参数
        // TODO: 实现紧急模式特殊逻辑
        
        emit EmergencyModeActivated(block.timestamp);
    }
    
    /**
     * @dev 停用紧急模式
     */
    function deactivateEmergencyMode() external onlyOwner {
        require(emergencyMode, "Not in emergency mode");
        
        emergencyMode = false;
        
        emit EmergencyModeDeactivated(block.timestamp);
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 获取当前市场状态
     */
    function getMarketStatus() external view returns (
        uint256 currentPrice_,
        uint256 previousPrice_,
        uint256 priceChange,
        MarketState marketState,
        bool emergencyMode_
    ) {
        return (
            currentPrice,
            previousPrice,
            _calculatePriceChange(),
            currentMarketState,
            emergencyMode
        );
    }
    
    /**
     * @dev 获取防暴跌状态
     */
    function getAntiDumpStatus() external view returns (
        uint256 additionalTax,
        uint256 burnRate,
        uint256 nodeRate,
        uint256 totalBurned
    ) {
        (additionalTax, burnRate, nodeRate) = _getAntiDumpRates();
        totalBurned = burnConfig.totalBurned;
    }
    
    /**
     * @dev 获取房损保护状态
     */
    function getLossProtectionStatus(address _user) external view returns (
        uint256 protectionPool,
        uint256 userLossRecord,
        uint256 lastClaimTime,
        uint256 nextClaimTime
    ) {
        return (
            lossProtection.protectionPool,
            lossProtection.userLossRecord[_user],
            lossProtection.lastClaimTime[_user],
            lossProtection.lastClaimTime[_user] + 24 hours
        );
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 更新防暴跌配置
     */
    function updateAntiDumpConfig(
        uint256[3] memory thresholds,
        uint256[3] memory additionalTaxes,
        uint256[3] memory burnRates,
        uint256[3] memory nodeRates
    ) external onlyOwner {
        antiDumpConfig.threshold10 = thresholds[0];
        antiDumpConfig.threshold30 = thresholds[1];
        antiDumpConfig.threshold50 = thresholds[2];
        
        antiDumpConfig.additionalTax10 = additionalTaxes[0];
        antiDumpConfig.additionalTax30 = additionalTaxes[1];
        antiDumpConfig.additionalTax50 = additionalTaxes[2];
        
        antiDumpConfig.burnRate10 = burnRates[0];
        antiDumpConfig.burnRate30 = burnRates[1];
        antiDumpConfig.burnRate50 = burnRates[2];
        
        antiDumpConfig.nodeRate10 = nodeRates[0];
        antiDumpConfig.nodeRate30 = nodeRates[1];
        antiDumpConfig.nodeRate50 = nodeRates[2];
    }
    
    /**
     * @dev 更新合约地址
     */
    function updateContracts(
        address _priceOracle,
        address _stakingContract,
        address _nodeNFT
    ) external onlyOwner {
        if (_priceOracle != address(0)) priceOracle = IPriceOracle(_priceOracle);
        if (_stakingContract != address(0)) stakingContract = IHCFStaking(_stakingContract);
        if (_nodeNFT != address(0)) nodeNFT = IHCFNodeNFT(_nodeNFT);
    }
    
    /**
     * @dev 使用调控池资金稳定价格
     */
    function useControlPool(uint256 _amount, string memory _purpose) external onlyOwner {
        require(controlPoolUsed + _amount <= CONTROL_POOL, "Exceeds control pool limit");
        require(hcfToken.balanceOf(address(this)) >= _amount, "Insufficient HCF in contract");
        
        controlPoolUsed += _amount;
        controlPoolAvailable = CONTROL_POOL - controlPoolUsed;
        
        // 根据用途执行不同操作
        // 例如：添加流动性、回购、销毁等
        emit ControlPoolUsed(_amount, _purpose, block.timestamp);
    }
    
    /**
     * @dev 管理员添加资金到调控池
     */
    function addControlFunds(uint256 _amount) external onlyOwner {
        require(hcfToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        controlPoolFunds += _amount;
        controlPoolAvailable = CONTROL_POOL - controlPoolUsed + controlPoolFunds;
        
        emit ControlFundsAdded(_amount, block.timestamp);
    }
    
    /**
     * @dev 紧急提取合约资金
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        require(emergencyMode, "Must be in emergency mode");
        IERC20(_token).transfer(owner(), _amount);
    }
    
    // 新增事件
    event ControlPoolUsed(uint256 amount, string purpose, uint256 timestamp);
    event ControlFundsAdded(uint256 amount, uint256 timestamp);
}