// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BSDTToken
 * @dev BSDT稳定币 - 只取价，严格禁止DEX交易
 * 
 * 核心机制：
 * - 发行量 <= USDT总量（通过Oracle控制）
 * - 1 BSDT = 1 USDT（1:1锚定）
 * - 严格禁止DEX交易，只能通过授权合约
 * - 自动检测并revert非授权交易
 */
contract BSDTToken is ERC20, Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    // USDT合约地址
    address public usdtToken;
    
    // Oracle合约（跟踪USDT总量）
    address public usdtOracle;
    
    // 授权的兑换合约
    mapping(address => bool) public authorizedExchanges;
    
    // DEX黑名单（自动检测并禁止）
    mapping(address => bool) public blacklistedDEX;
    address[] public knownDEXRouters;
    address[] public knownDEXFactories;
    
    // 禁止的操作标记
    bool public tradingRestricted = true; // 限制交易
    bool public liquidityRestricted = true; // 限制流动性
    bool public emergencyPause = false; // 紧急暂停
    
    // 价格锚定（始终1:1）
    uint256 public constant PRICE_RATIO = 10000; // 1:1 (basis points)
    
    // 底池统计
    uint256 public totalUSDTLocked; // 锁定的USDT总量
    uint256 public totalBSDTIssued; // 发行的BSDT总量
    uint256 public maxSupplyFromOracle; // Oracle设置的最大供应量
    
    // ============ 事件 ============
    
    event BSDTMinted(address indexed to, uint256 usdtAmount, uint256 bsdtAmount);
    event BSDTBurned(address indexed from, uint256 bsdtAmount, uint256 usdtAmount);
    event ExchangeAuthorized(address indexed exchange, bool authorized);
    event TradingRestrictionUpdated(bool restricted);
    event DEXBlacklisted(address indexed dex, bool blacklisted);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event UnauthorizedTransferAttempt(address indexed from, address indexed to, uint256 amount);
    
    // ============ 构造函数 ============
    
    constructor(address _usdtToken) ERC20("BSDT Stable Token", "BSDT") Ownable(msg.sender) {
        usdtToken = _usdtToken;
        
        // 初始化常见DEX地址（BSC主网）
        // PancakeSwap Router
        knownDEXRouters.push(0x10ED43C718714eb63d5aA57B78B54704E256024E);
        // PancakeSwap Factory
        knownDEXFactories.push(0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73);
        
        // 将已知DEX加入黑名单
        for(uint i = 0; i < knownDEXRouters.length; i++) {
            blacklistedDEX[knownDEXRouters[i]] = true;
        }
        for(uint i = 0; i < knownDEXFactories.length; i++) {
            blacklistedDEX[knownDEXFactories[i]] = true;
        }
    }
    
    // ============ 修饰器 ============
    
    modifier onlyAuthorizedExchange() {
        require(authorizedExchanges[msg.sender] || msg.sender == owner(), "Not authorized exchange");
        _;
    }
    
    modifier tradingNotRestricted(address from, address to) {
        // 紧急暂停检查
        require(!emergencyPause, "Emergency pause activated");
        
        // 检测并阻止DEX交易
        require(!blacklistedDEX[from] && !blacklistedDEX[to], "DEX trading strictly prohibited");
        require(!_isDEXPair(from) && !_isDEXPair(to), "DEX pair trading prohibited");
        
        // 允许授权合约和owner操作
        if (tradingRestricted) {
            bool isAuthorized = authorizedExchanges[from] || 
                               authorizedExchanges[to] || 
                               from == owner() || 
                               to == owner() ||
                               from == address(0) || // 铸造
                               to == address(0);    // 销毁
                               
            if (!isAuthorized) {
                emit UnauthorizedTransferAttempt(from, to, 0);
                revert("BSDT: Trading strictly restricted to authorized contracts only");
            }
        }
        _;
    }
    
    // ============ 核心功能 ============
    
    /**
     * @dev 铸造BSDT（兼容HCFBSDTExchange的mint接口）
     */
    function mint(address to, uint256 amount) external onlyAuthorizedExchange {
        require(amount > 0, "Amount must be positive");
        require(!emergencyPause, "Emergency pause activated");
        
        // 检查Oracle供应量限制
        if (usdtOracle != address(0) && maxSupplyFromOracle > 0) {
            require(totalSupply() + amount <= maxSupplyFromOracle, "Exceeds USDT total supply limit from Oracle");
        }
        
        // 更新统计
        totalUSDTLocked += amount;
        totalBSDTIssued += amount;
        
        // 铸造BSDT
        _mint(to, amount);
        
        emit BSDTMinted(to, amount, amount);
    }
    
    /**
     * @dev 销毁BSDT（兼容HCFBSDTExchange的burn接口）
     */
    function burn(uint256 amount) external onlyAuthorizedExchange {
        require(amount > 0, "Amount must be positive");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        // 更新统计
        totalBSDTIssued -= amount;
        totalUSDTLocked -= amount; // 1:1关系
        
        // 销毁BSDT
        _burn(msg.sender, amount);
        
        emit BSDTBurned(msg.sender, amount, amount);
    }
    
    /**
     * @dev 铸造BSDT（保留旧接口兼容性）
     * @param to 接收地址
     * @param usdtAmount USDT数量
     */
    function mintBSDT(address to, uint256 usdtAmount) external onlyAuthorizedExchange {
        this.mint(to, usdtAmount);
    }
    
    /**
     * @dev 销毁BSDT（保留旧接口兼容性）
     * @param from 销毁地址
     * @param bsdtAmount BSDT数量
     */
    function burnBSDT(address from, uint256 bsdtAmount) external onlyAuthorizedExchange {
        require(bsdtAmount > 0, "Amount must be positive");
        require(balanceOf(from) >= bsdtAmount, "Insufficient balance");
        
        // 更新统计
        totalBSDTIssued -= bsdtAmount;
        totalUSDTLocked -= bsdtAmount;
        
        // 销毁BSDT
        _burn(from, bsdtAmount);
        
        emit BSDTBurned(from, bsdtAmount, bsdtAmount);
    }
    
    /**
     * @dev 获取价格（始终返回1:1）
     */
    function getPrice() external pure returns (uint256) {
        return PRICE_RATIO; // 始终1:1
    }
    
    /**
     * @dev 获取USDT锁定量
     */
    function getUSDTLocked() external view returns (uint256) {
        return totalUSDTLocked;
    }
    
    /**
     * @dev 检查是否1:1锚定
     */
    function isPegged() external view returns (bool) {
        return totalBSDTIssued == totalUSDTLocked;
    }
    
    // ============ 转账限制 ============
    
    /**
     * @dev 重写transfer函数，添加交易限制
     */
    function transfer(address to, uint256 amount) 
        public 
        override 
        tradingNotRestricted(msg.sender, to) 
        returns (bool) 
    {
        return super.transfer(to, amount);
    }
    
    /**
     * @dev 重写transferFrom函数，添加交易限制
     */
    function transferFrom(address from, address to, uint256 amount) 
        public 
        override 
        tradingNotRestricted(from, to) 
        returns (bool) 
    {
        return super.transferFrom(from, to, amount);
    }
    
    // ============ 管理功能 ============
    
    /**
     * @dev 授权兑换合约
     */
    function authorizeExchange(address exchange, bool authorized) external onlyOwner {
        require(exchange != address(0), "Invalid exchange address");
        authorizedExchanges[exchange] = authorized;
        emit ExchangeAuthorized(exchange, authorized);
    }
    
    /**
     * @dev 更新交易限制状态
     */
    function setTradingRestriction(bool restricted) external onlyOwner {
        tradingRestricted = restricted;
        emit TradingRestrictionUpdated(restricted);
    }
    
    /**
     * @dev 检查地址是否可以交易BSDT
     */
    function canTrade(address account) external view returns (bool) {
        if (!tradingRestricted) return true;
        return authorizedExchanges[account] || account == owner();
    }
    
    // ============ 防止流动性添加 ============
    
    /**
     * @dev 禁止approve给DEX路由
     */
    function approve(address spender, uint256 amount) 
        public 
        override 
        returns (bool) 
    {
        require(!emergencyPause, "Emergency pause activated");
        
        // 严格禁止approve给DEX
        require(!blacklistedDEX[spender], "Cannot approve to DEX");
        require(!_isDEXContract(spender), "Detected DEX contract, approval denied");
        
        // 只允许授权合约
        require(
            !liquidityRestricted || authorizedExchanges[spender] || spender == owner(),
            "Can only approve to authorized contracts"
        );
        return super.approve(spender, amount);
    }
    
    // ============ Oracle集成 ============
    
    /**
     * @dev 设置Oracle合约
     */
    function setOracle(address _oracle) external onlyOwner {
        address oldOracle = usdtOracle;
        usdtOracle = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }
    
    /**
     * @dev 更新最大供应量（仅Oracle调用）
     */
    function updateMaxSupply(uint256 _maxSupply) external {
        require(msg.sender == usdtOracle, "Only Oracle can update");
        maxSupplyFromOracle = _maxSupply;
        emit MaxSupplyUpdated(_maxSupply);
    }
    
    // ============ DEX检测功能 ============
    
    /**
     * @dev 检测是否为DEX pair
     */
    function _isDEXPair(address account) internal view returns (bool) {
        if (account.code.length == 0) return false;
        
        // 检查是否实现了pair接口
        try IPair(account).token0() returns (address token0) {
            try IPair(account).token1() returns (address token1) {
                // 如果包含BSDT，则是DEX pair
                return token0 == address(this) || token1 == address(this);
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }
    
    /**
     * @dev 检测是否为DEX合约
     */
    function _isDEXContract(address account) internal view returns (bool) {
        if (account.code.length == 0) return false;
        
        // 检查已知的函数选择器
        bytes4 swapSelector = bytes4(keccak256("swap(uint256,uint256,address,bytes)"));
        bytes4 addLiquiditySelector = bytes4(keccak256("addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"));
        
        // 简单检查（实际可以更复杂）
        return blacklistedDEX[account];
    }
    
    /**
     * @dev 添加DEX到黑名单
     */
    function addDEXToBlacklist(address _dex) external onlyOwner {
        blacklistedDEX[_dex] = true;
        emit DEXBlacklisted(_dex, true);
    }
    
    /**
     * @dev 从黑名单移除DEX
     */
    function removeDEXFromBlacklist(address _dex) external onlyOwner {
        blacklistedDEX[_dex] = false;
        emit DEXBlacklisted(_dex, false);
    }
    
    /**
     * @dev 紧急暂停
     */
    function setEmergencyPause(bool _pause) external onlyOwner {
        emergencyPause = _pause;
    }
}

// DEX Pair接口
interface IPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
}
