// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USDTOracle
 * @dev USDT总量预言机 - 跟踪USDT总供应量，控制BSDT发行上限
 * 
 * 功能：
 * - 跟踪USDT在各链上的总供应量
 * - 为BSDT设置动态发行上限
 * - 定期更新供应量数据
 * - 支持多个数据源验证
 */
contract USDTOracle is Ownable {
    
    // ============ 状态变量 ============
    
    // USDT供应量数据
    struct SupplyData {
        uint256 totalSupply;      // USDT总供应量
        uint256 ethSupply;        // Ethereum链上供应量
        uint256 bscSupply;        // BSC链上供应量
        uint256 tronSupply;       // Tron链上供应量
        uint256 otherSupply;      // 其他链供应量
        uint256 lastUpdateTime;   // 最后更新时间
        uint256 updateCount;      // 更新次数
    }
    
    SupplyData public currentSupplyData;
    SupplyData public previousSupplyData;
    
    // 数据提供者
    mapping(address => bool) public dataProviders;
    address[] public providerList;
    uint256 public requiredProviders = 1; // 需要的数据提供者数量
    
    // 临时数据存储（用于多方验证）
    struct PendingUpdate {
        uint256 totalSupply;
        uint256 ethSupply;
        uint256 bscSupply;
        uint256 tronSupply;
        uint256 otherSupply;
        uint256 confirmations;
        mapping(address => bool) confirmed;
        bool executed;
    }
    
    mapping(uint256 => PendingUpdate) public pendingUpdates;
    uint256 public updateNonce;
    
    // 价格和供应量限制
    uint256 public maxSupplyChange = 1000000000 * 10**6; // 最大单次变化10亿USDT（6位小数）
    uint256 public minUpdateInterval = 1 hours;          // 最小更新间隔
    
    // 关联合约
    address public bsdtToken;
    
    // ============ 事件 ============
    
    event SupplyUpdated(
        uint256 totalSupply,
        uint256 ethSupply,
        uint256 bscSupply,
        uint256 tronSupply,
        uint256 otherSupply,
        uint256 timestamp
    );
    event DataProviderAdded(address indexed provider);
    event DataProviderRemoved(address indexed provider);
    event UpdateSubmitted(uint256 indexed nonce, address indexed provider);
    event UpdateConfirmed(uint256 indexed nonce, address indexed provider);
    event UpdateExecuted(uint256 indexed nonce, uint256 newTotalSupply);
    event MaxSupplyChangeUpdated(uint256 oldValue, uint256 newValue);
    
    // ============ 修饰器 ============
    
    modifier onlyDataProvider() {
        require(dataProviders[msg.sender], "Not a data provider");
        _;
    }
    
    modifier updateIntervalPassed() {
        require(
            block.timestamp >= currentSupplyData.lastUpdateTime + minUpdateInterval,
            "Update interval not passed"
        );
        _;
    }
    
    // ============ 构造函数 ============
    
    constructor() Ownable(msg.sender) {
        // 初始化USDT供应量（可以设置初始值）
        currentSupplyData = SupplyData({
            totalSupply: 83000000000 * 10**6,  // 830亿USDT初始值
            ethSupply: 40000000000 * 10**6,    // 400亿在Ethereum
            bscSupply: 20000000000 * 10**6,    // 200亿在BSC
            tronSupply: 20000000000 * 10**6,   // 200亿在Tron
            otherSupply: 3000000000 * 10**6,   // 30亿在其他链
            lastUpdateTime: block.timestamp,
            updateCount: 0
        });
        
        // 添加初始数据提供者（owner）
        dataProviders[msg.sender] = true;
        providerList.push(msg.sender);
    }
    
    // ============ 核心Oracle功能 ============
    
    /**
     * @dev 提交供应量更新（数据提供者）
     */
    function submitSupplyUpdate(
        uint256 _totalSupply,
        uint256 _ethSupply,
        uint256 _bscSupply,
        uint256 _tronSupply,
        uint256 _otherSupply
    ) external onlyDataProvider updateIntervalPassed {
        // 验证数据一致性
        require(
            _totalSupply == _ethSupply + _bscSupply + _tronSupply + _otherSupply,
            "Supply data inconsistent"
        );
        
        // 验证变化范围
        uint256 currentTotal = currentSupplyData.totalSupply;
        if (currentTotal > 0) {
            uint256 change = _totalSupply > currentTotal ? 
                _totalSupply - currentTotal : 
                currentTotal - _totalSupply;
            require(change <= maxSupplyChange, "Supply change too large");
        }
        
        uint256 nonce = updateNonce++;
        PendingUpdate storage update = pendingUpdates[nonce];
        
        update.totalSupply = _totalSupply;
        update.ethSupply = _ethSupply;
        update.bscSupply = _bscSupply;
        update.tronSupply = _tronSupply;
        update.otherSupply = _otherSupply;
        update.confirmations = 0;
        update.executed = false;
        
        emit UpdateSubmitted(nonce, msg.sender);
        
        // 自动确认
        confirmUpdate(nonce);
    }
    
    /**
     * @dev 确认供应量更新
     */
    function confirmUpdate(uint256 _nonce) public onlyDataProvider {
        PendingUpdate storage update = pendingUpdates[_nonce];
        require(!update.executed, "Update already executed");
        require(!update.confirmed[msg.sender], "Already confirmed");
        
        update.confirmed[msg.sender] = true;
        update.confirmations++;
        
        emit UpdateConfirmed(_nonce, msg.sender);
        
        // 如果达到所需确认数，执行更新
        if (update.confirmations >= requiredProviders) {
            executeUpdate(_nonce);
        }
    }
    
    /**
     * @dev 执行供应量更新
     */
    function executeUpdate(uint256 _nonce) internal {
        PendingUpdate storage update = pendingUpdates[_nonce];
        require(!update.executed, "Already executed");
        
        // 保存当前数据为历史数据
        previousSupplyData = currentSupplyData;
        
        // 更新当前数据
        currentSupplyData = SupplyData({
            totalSupply: update.totalSupply,
            ethSupply: update.ethSupply,
            bscSupply: update.bscSupply,
            tronSupply: update.tronSupply,
            otherSupply: update.otherSupply,
            lastUpdateTime: block.timestamp,
            updateCount: currentSupplyData.updateCount + 1
        });
        
        update.executed = true;
        
        // 如果设置了BSDT合约，更新其发行上限
        if (bsdtToken != address(0)) {
            IBSDTToken(bsdtToken).updateMaxSupply(update.totalSupply);
        }
        
        emit UpdateExecuted(_nonce, update.totalSupply);
        emit SupplyUpdated(
            update.totalSupply,
            update.ethSupply,
            update.bscSupply,
            update.tronSupply,
            update.otherSupply,
            block.timestamp
        );
    }
    
    /**
     * @dev 紧急更新（仅owner）
     */
    function emergencyUpdate(
        uint256 _totalSupply,
        uint256 _ethSupply,
        uint256 _bscSupply,
        uint256 _tronSupply,
        uint256 _otherSupply
    ) external onlyOwner {
        require(
            _totalSupply == _ethSupply + _bscSupply + _tronSupply + _otherSupply,
            "Supply data inconsistent"
        );
        
        previousSupplyData = currentSupplyData;
        
        currentSupplyData = SupplyData({
            totalSupply: _totalSupply,
            ethSupply: _ethSupply,
            bscSupply: _bscSupply,
            tronSupply: _tronSupply,
            otherSupply: _otherSupply,
            lastUpdateTime: block.timestamp,
            updateCount: currentSupplyData.updateCount + 1
        });
        
        if (bsdtToken != address(0)) {
            IBSDTToken(bsdtToken).updateMaxSupply(_totalSupply);
        }
        
        emit SupplyUpdated(
            _totalSupply,
            _ethSupply,
            _bscSupply,
            _tronSupply,
            _otherSupply,
            block.timestamp
        );
    }
    
    // ============ 查询功能 ============
    
    /**
     * @dev 获取当前USDT总供应量
     */
    function getTotalSupply() external view returns (uint256) {
        return currentSupplyData.totalSupply;
    }
    
    /**
     * @dev 获取供应量详情
     */
    function getSupplyDetails() external view returns (
        uint256 total,
        uint256 eth,
        uint256 bsc,
        uint256 tron,
        uint256 other,
        uint256 lastUpdate
    ) {
        return (
            currentSupplyData.totalSupply,
            currentSupplyData.ethSupply,
            currentSupplyData.bscSupply,
            currentSupplyData.tronSupply,
            currentSupplyData.otherSupply,
            currentSupplyData.lastUpdateTime
        );
    }
    
    /**
     * @dev 获取供应量变化
     */
    function getSupplyChange() external view returns (
        int256 totalChange,
        int256 ethChange,
        int256 bscChange,
        int256 tronChange,
        int256 otherChange
    ) {
        totalChange = int256(currentSupplyData.totalSupply) - int256(previousSupplyData.totalSupply);
        ethChange = int256(currentSupplyData.ethSupply) - int256(previousSupplyData.ethSupply);
        bscChange = int256(currentSupplyData.bscSupply) - int256(previousSupplyData.bscSupply);
        tronChange = int256(currentSupplyData.tronSupply) - int256(previousSupplyData.tronSupply);
        otherChange = int256(currentSupplyData.otherSupply) - int256(previousSupplyData.otherSupply);
    }
    
    /**
     * @dev 检查BSDT是否可以铸造
     */
    function canMintBSDT(uint256 _amount) external view returns (bool) {
        if (bsdtToken == address(0)) return false;
        
        uint256 currentBSDTSupply = IBSDTToken(bsdtToken).totalSupply();
        return (currentBSDTSupply + _amount) <= currentSupplyData.totalSupply;
    }
    
    // ============ 管理功能 ============
    
    /**
     * @dev 添加数据提供者
     */
    function addDataProvider(address _provider) external onlyOwner {
        require(_provider != address(0), "Invalid provider");
        require(!dataProviders[_provider], "Already a provider");
        
        dataProviders[_provider] = true;
        providerList.push(_provider);
        
        emit DataProviderAdded(_provider);
    }
    
    /**
     * @dev 移除数据提供者
     */
    function removeDataProvider(address _provider) external onlyOwner {
        require(dataProviders[_provider], "Not a provider");
        require(providerList.length > requiredProviders, "Cannot remove: would break requirement");
        
        dataProviders[_provider] = false;
        
        // 从列表中移除
        for (uint256 i = 0; i < providerList.length; i++) {
            if (providerList[i] == _provider) {
                providerList[i] = providerList[providerList.length - 1];
                providerList.pop();
                break;
            }
        }
        
        emit DataProviderRemoved(_provider);
    }
    
    /**
     * @dev 设置所需数据提供者数量
     */
    function setRequiredProviders(uint256 _required) external onlyOwner {
        require(_required > 0 && _required <= providerList.length, "Invalid requirement");
        requiredProviders = _required;
    }
    
    /**
     * @dev 设置BSDT代币合约
     */
    function setBSDTToken(address _bsdtToken) external onlyOwner {
        require(_bsdtToken != address(0), "Invalid address");
        bsdtToken = _bsdtToken;
    }
    
    /**
     * @dev 设置最大供应量变化限制
     */
    function setMaxSupplyChange(uint256 _maxChange) external onlyOwner {
        uint256 oldValue = maxSupplyChange;
        maxSupplyChange = _maxChange;
        emit MaxSupplyChangeUpdated(oldValue, _maxChange);
    }
    
    /**
     * @dev 设置最小更新间隔
     */
    function setMinUpdateInterval(uint256 _interval) external onlyOwner {
        minUpdateInterval = _interval;
    }
    
    /**
     * @dev 获取数据提供者列表
     */
    function getProviders() external view returns (address[] memory) {
        return providerList;
    }
}

// BSDT接口
interface IBSDTToken {
    function totalSupply() external view returns (uint256);
    function updateMaxSupply(uint256 _maxSupply) external;
}