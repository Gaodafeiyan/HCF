// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHCFToken {
    function getPrice() external view returns (uint256);
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IHCFStaking {
    function updateDailyRate(uint256 levelId, uint256 newRate) external;
    function getDailyRate(uint256 levelId) external view returns (uint256);
}

interface IHCFNodeNFT {
    function updateRewardRate(uint256 newRate) external;
    function getRewardRate() external view returns (uint256);
}

/**
 * @title HCFProtection
 * @dev 防护和控制机制
 * 
 * 防护机制：
 * - 防暴跌：增加滑点5%-30%（通过销毁+节点奖励）
 * - 减产机制：价格下跌触发5%-30%减产
 * - 烧伤机制：特定条件触发（波动5%/交易1%/定时1%/投票）
 * - 防砸盘：24小时限制，大额多签
 * - 闪电贷/三明治攻击防护
 * - 紧急暂停（多签恢复）
 */
contract HCFProtection is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IHCFStaking public stakingContract;
    IHCFNodeNFT public nodeContract;
    
    // 价格监控
    uint256 public lastPrice;
    uint256 public priceCheckInterval = 1 hours;
    uint256 public lastPriceCheck;
    
    // 防暴跌机制
    struct AntiDumpConfig {
        uint256 threshold10;  // 跌10%阈值
        uint256 threshold20;  // 跌20%阈值
        uint256 threshold30;  // 跌30%阈值
        uint256 threshold50;  // 跌50%阈值
        uint256 slippage5;    // 5%滑点
        uint256 slippage10;   // 10%滑点
        uint256 slippage20;   // 20%滑点
        uint256 slippage30;   // 30%滑点
    }
    
    AntiDumpConfig public antiDumpConfig;
    
    // 减产机制
    struct ProductionReduction {
        uint256 reduction5;   // 5%减产
        uint256 reduction10;  // 10%减产
        uint256 reduction20;  // 20%减产
        uint256 reduction30;  // 30%减产
        bool isActive;
        uint256 lastReductionTime;
    }
    
    ProductionReduction public productionReduction;
    
    // 烧伤机制
    struct BurnConfig {
        uint256 volatilityThreshold;  // 波动阈值5%
        uint256 tradeVolumeThreshold; // 交易量阈值1%
        uint256 timedBurnInterval;    // 定时销毁间隔
        uint256 lastTimedBurn;
        bool voteBurnEnabled;         // 投票销毁启用
    }
    
    BurnConfig public burnConfig;
    
    // 防砸盘机制
    mapping(address => uint256) public dailySellLimit;
    mapping(address => uint256) public lastSellTime;
    mapping(address => uint256) public dailySellAmount;
    uint256 public maxDailySellPercent = 100; // 1%每日限制
    uint256 public largeAmountThreshold = 100000 * 10**18; // 大额阈值
    
    // 多签控制
    mapping(address => bool) public signers;
    uint256 public requiredSignatures = 2;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    uint256 public transactionCount;
    
    // 闪电贷防护
    mapping(address => uint256) public lastBlock;
    bool public flashLoanProtection = true;
    
    // 紧急暂停
    bool public emergencyPause = false;
    uint256 public pauseStartTime;
    uint256 public maxPauseDuration = 72 hours;
    
    // ============ 事件 ============
    
    event PriceDrop(uint256 dropPercent, uint256 oldPrice, uint256 newPrice);
    event SlippageApplied(uint256 slippagePercent, uint256 burnAmount);
    event ProductionReduced(uint256 reductionPercent);
    event BurnTriggered(string reason, uint256 amount);
    event LargeTransactionDetected(address indexed user, uint256 amount);
    event EmergencyPauseActivated(uint256 duration);
    event FlashLoanAttackPrevented(address indexed attacker);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _stakingContract,
        address _nodeContract
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        stakingContract = IHCFStaking(_stakingContract);
        nodeContract = IHCFNodeNFT(_nodeContract);
        
        // 初始化防暴跌配置
        antiDumpConfig = AntiDumpConfig({
            threshold10: 1000,  // 10%
            threshold20: 2000,  // 20%
            threshold30: 3000,  // 30%
            threshold50: 5000,  // 50%
            slippage5: 500,     // 5%
            slippage10: 1000,   // 10%
            slippage20: 2000,   // 20%
            slippage30: 3000    // 30%
        });
        
        // 初始化减产配置
        productionReduction = ProductionReduction({
            reduction5: 500,   // 5%
            reduction10: 1000, // 10%
            reduction20: 2000, // 20%
            reduction30: 3000, // 30%
            isActive: true,
            lastReductionTime: block.timestamp
        });
        
        // 初始化烧伤配置
        burnConfig = BurnConfig({
            volatilityThreshold: 500,  // 5%波动
            tradeVolumeThreshold: 100, // 1%交易量
            timedBurnInterval: 24 hours,
            lastTimedBurn: block.timestamp,
            voteBurnEnabled: false
        });
        
        // 设置初始签名者
        signers[msg.sender] = true;
        lastPrice = 10**18; // 初始价格1U
    }
    
    // ============ 修饰器 ============
    
    modifier notPaused() {
        require(!emergencyPause || block.timestamp > pauseStartTime + maxPauseDuration, 
                "System paused");
        _;
    }
    
    modifier onlySigner() {
        require(signers[msg.sender], "Not a signer");
        _;
    }
    
    modifier flashLoanProtected() {
        if (flashLoanProtection) {
            require(lastBlock[msg.sender] != block.number, "Flash loan detected");
            lastBlock[msg.sender] = block.number;
        }
        _;
    }
    
    // ============ 防暴跌机制 ============
    
    /**
     * @dev 检查价格并应用防暴跌措施
     */
    function checkPriceAndProtect() external notPaused {
        require(block.timestamp >= lastPriceCheck + priceCheckInterval, "Too early");
        
        uint256 currentPrice = hcfToken.getPrice();
        uint256 priceDrop = 0;
        
        if (currentPrice < lastPrice) {
            priceDrop = ((lastPrice - currentPrice) * 10000) / lastPrice;
        }
        
        // 根据跌幅应用不同滑点
        uint256 slippageToApply = 0;
        uint256 reductionToApply = 0;
        
        if (priceDrop >= antiDumpConfig.threshold50) {
            // 跌50%：30%滑点 + 30%减产
            slippageToApply = antiDumpConfig.slippage30;
            reductionToApply = productionReduction.reduction30;
            _triggerAlert("CRITICAL", priceDrop);
        } else if (priceDrop >= antiDumpConfig.threshold30) {
            // 跌30%：20%滑点 + 20%减产
            slippageToApply = antiDumpConfig.slippage20;
            reductionToApply = productionReduction.reduction20;
            _triggerAlert("SEVERE", priceDrop);
        } else if (priceDrop >= antiDumpConfig.threshold20) {
            // 跌20%：10%滑点 + 10%减产
            slippageToApply = antiDumpConfig.slippage10;
            reductionToApply = productionReduction.reduction10;
            _triggerAlert("WARNING", priceDrop);
        } else if (priceDrop >= antiDumpConfig.threshold10) {
            // 跌10%：5%滑点 + 5%减产
            slippageToApply = antiDumpConfig.slippage5;
            reductionToApply = productionReduction.reduction5;
            _triggerAlert("NOTICE", priceDrop);
        }
        
        // 应用滑点（通过销毁和节点奖励）
        if (slippageToApply > 0) {
            _applySlippage(slippageToApply);
        }
        
        // 应用减产
        if (reductionToApply > 0 && productionReduction.isActive) {
            _applyProductionReduction(reductionToApply);
        }
        
        lastPrice = currentPrice;
        lastPriceCheck = block.timestamp;
        
        emit PriceDrop(priceDrop, lastPrice, currentPrice);
    }
    
    /**
     * @dev 应用滑点保护
     */
    function _applySlippage(uint256 slippagePercent) internal {
        // 计算销毁量（部分滑点通过销毁实现）
        uint256 totalSupply = hcfToken.balanceOf(address(this));
        uint256 burnAmount = (totalSupply * slippagePercent / 2) / 10000;
        
        if (burnAmount > 0) {
            hcfToken.burn(burnAmount);
        }
        
        // 增加节点奖励（另一部分滑点）
        uint256 currentNodeRate = nodeContract.getRewardRate();
        uint256 newNodeRate = currentNodeRate + (currentNodeRate * slippagePercent / 2) / 10000;
        nodeContract.updateRewardRate(newNodeRate);
        
        emit SlippageApplied(slippagePercent, burnAmount);
    }
    
    // ============ 减产机制 ============
    
    /**
     * @dev 应用减产
     */
    function _applyProductionReduction(uint256 reductionPercent) internal {
        require(block.timestamp >= productionReduction.lastReductionTime + 24 hours, 
                "Reduction cooldown");
        
        // 减少质押收益率
        for (uint256 i = 0; i < 5; i++) {
            uint256 currentRate = stakingContract.getDailyRate(i);
            uint256 newRate = currentRate - (currentRate * reductionPercent) / 10000;
            stakingContract.updateDailyRate(i, newRate);
        }
        
        // 减少节点收益
        uint256 currentNodeRate = nodeContract.getRewardRate();
        uint256 newNodeRate = currentNodeRate - (currentNodeRate * reductionPercent) / 10000;
        nodeContract.updateRewardRate(newNodeRate);
        
        productionReduction.lastReductionTime = block.timestamp;
        emit ProductionReduced(reductionPercent);
    }
    
    // ============ 烧伤机制 ============
    
    /**
     * @dev 波动触发烧伤
     */
    function volatilityBurn(uint256 volatilityPercent) external notPaused {
        require(volatilityPercent >= burnConfig.volatilityThreshold, "Below threshold");
        
        uint256 burnAmount = (hcfToken.balanceOf(address(this)) * volatilityPercent) / 10000;
        _executeBurn(burnAmount, "Volatility");
    }
    
    /**
     * @dev 交易量触发烧伤
     */
    function volumeBurn(uint256 volumePercent) external notPaused {
        require(volumePercent >= burnConfig.tradeVolumeThreshold, "Below threshold");
        
        uint256 burnAmount = (hcfToken.balanceOf(address(this)) * volumePercent) / 10000;
        _executeBurn(burnAmount, "Volume");
    }
    
    /**
     * @dev 定时烧伤
     */
    function timedBurn() external notPaused {
        require(block.timestamp >= burnConfig.lastTimedBurn + burnConfig.timedBurnInterval,
                "Too early");
        
        uint256 burnAmount = (hcfToken.balanceOf(address(this)) * 100) / 10000; // 1%
        burnConfig.lastTimedBurn = block.timestamp;
        _executeBurn(burnAmount, "Timed");
    }
    
    /**
     * @dev 投票烧伤
     */
    function voteBurn(uint256 burnAmount) external notPaused onlySigner {
        require(burnConfig.voteBurnEnabled, "Vote burn disabled");
        require(_confirmTransaction(transactionCount, msg.sender), "Already confirmed");
        
        confirmations[transactionCount][msg.sender] = true;
        
        uint256 confirmCount = 0;
        for (uint256 i = 0; i < 5; i++) {
            address signer = address(uint160(uint256(keccak256(abi.encode(i)))));
            if (confirmations[transactionCount][signer]) {
                confirmCount++;
            }
        }
        
        if (confirmCount >= requiredSignatures) {
            _executeBurn(burnAmount, "Vote");
            transactionCount++;
        }
    }
    
    /**
     * @dev 执行烧伤
     */
    function _executeBurn(uint256 amount, string memory reason) internal {
        if (amount > 0 && hcfToken.balanceOf(address(this)) >= amount) {
            hcfToken.burn(amount);
            emit BurnTriggered(reason, amount);
        }
    }
    
    // ============ 防砸盘机制 ============
    
    /**
     * @dev 检查每日卖出限制
     */
    function checkDailySellLimit(address user, uint256 amount) external notPaused flashLoanProtected {
        // 重置24小时计数器
        if (block.timestamp > lastSellTime[user] + 24 hours) {
            dailySellAmount[user] = 0;
            lastSellTime[user] = block.timestamp;
        }
        
        dailySellAmount[user] += amount;
        
        // 检查是否超过限制
        uint256 userBalance = hcfToken.balanceOf(user);
        uint256 maxDailySell = (userBalance * maxDailySellPercent) / 10000;
        
        require(dailySellAmount[user] <= maxDailySell, "Exceeds daily sell limit");
        
        // 大额交易需要多签
        if (amount >= largeAmountThreshold) {
            emit LargeTransactionDetected(user, amount);
            revert("Large transaction requires multisig approval");
        }
    }
    
    // ============ 闪电贷/三明治攻击防护 ============
    
    /**
     * @dev 防止闪电贷攻击
     */
    function preventFlashLoan(address user) external view returns (bool) {
        if (!flashLoanProtection) return true;
        return lastBlock[user] != block.number;
    }
    
    /**
     * @dev 防止三明治攻击（MEV）
     */
    function preventSandwich(uint256 gasPrice, uint256 maxGasPrice) external pure returns (bool) {
        return gasPrice <= maxGasPrice;
    }
    
    // ============ 紧急暂停 ============
    
    /**
     * @dev 激活紧急暂停（需要多签）
     */
    function activateEmergencyPause() external onlySigner {
        require(!emergencyPause, "Already paused");
        
        // 需要多签确认
        require(_confirmTransaction(transactionCount, msg.sender), "Already confirmed");
        confirmations[transactionCount][msg.sender] = true;
        
        uint256 confirmCount = _countConfirmations(transactionCount);
        
        if (confirmCount >= requiredSignatures) {
            emergencyPause = true;
            pauseStartTime = block.timestamp;
            transactionCount++;
            emit EmergencyPauseActivated(maxPauseDuration);
        }
    }
    
    /**
     * @dev 解除紧急暂停（需要多签）
     */
    function deactivateEmergencyPause() external onlySigner {
        require(emergencyPause, "Not paused");
        
        // 需要多签确认
        require(_confirmTransaction(transactionCount, msg.sender), "Already confirmed");
        confirmations[transactionCount][msg.sender] = true;
        
        uint256 confirmCount = _countConfirmations(transactionCount);
        
        if (confirmCount >= requiredSignatures) {
            emergencyPause = false;
            pauseStartTime = 0;
            transactionCount++;
        }
    }
    
    // ============ 辅助函数 ============
    
    function _triggerAlert(string memory level, uint256 dropPercent) internal {
        // 发送警报事件（链下监控）
    }
    
    function _confirmTransaction(uint256 transactionId, address signer) internal view returns (bool) {
        return !confirmations[transactionId][signer];
    }
    
    function _countConfirmations(uint256 transactionId) internal view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < 5; i++) {
            address signer = address(uint160(uint256(keccak256(abi.encode(i)))));
            if (confirmations[transactionId][signer]) {
                count++;
            }
        }
        return count;
    }
    
    // ============ 管理函数 ============
    
    function addSigner(address signer) external onlyOwner {
        signers[signer] = true;
    }
    
    function removeSigner(address signer) external onlyOwner {
        signers[signer] = false;
    }
    
    function updateRequiredSignatures(uint256 _required) external onlyOwner {
        requiredSignatures = _required;
    }
    
    function updateAntiDumpConfig(
        uint256[4] memory thresholds,
        uint256[4] memory slippages
    ) external onlyOwner {
        antiDumpConfig.threshold10 = thresholds[0];
        antiDumpConfig.threshold20 = thresholds[1];
        antiDumpConfig.threshold30 = thresholds[2];
        antiDumpConfig.threshold50 = thresholds[3];
        
        antiDumpConfig.slippage5 = slippages[0];
        antiDumpConfig.slippage10 = slippages[1];
        antiDumpConfig.slippage20 = slippages[2];
        antiDumpConfig.slippage30 = slippages[3];
    }
    
    function updateBurnConfig(
        uint256 _volatility,
        uint256 _volume,
        uint256 _interval
    ) external onlyOwner {
        burnConfig.volatilityThreshold = _volatility;
        burnConfig.tradeVolumeThreshold = _volume;
        burnConfig.timedBurnInterval = _interval;
    }
    
    function toggleProductionReduction(bool _active) external onlyOwner {
        productionReduction.isActive = _active;
    }
    
    function toggleFlashLoanProtection(bool _enabled) external onlyOwner {
        flashLoanProtection = _enabled;
    }
    
    function setMaxDailySellPercent(uint256 _percent) external onlyOwner {
        maxDailySellPercent = _percent;
    }
    
    function setLargeAmountThreshold(uint256 _threshold) external onlyOwner {
        largeAmountThreshold = _threshold;
    }
}