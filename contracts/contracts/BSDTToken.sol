// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BSDTToken
 * @dev BSDT稳定币 - 只取价，无法买卖，无法加流动性
 * 
 * 核心机制：
 * - 发行量 = USDT总量
 * - 1 BSDT = 1 USDT（1:1锁定底池）
 * - 只能通过合约兑换，不能在DEX交易
 * - 只作为价格锚定工具
 */
contract BSDTToken is ERC20, Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    // USDT合约地址
    address public usdtToken;
    
    // 授权的兑换合约
    mapping(address => bool) public authorizedExchanges;
    
    // 禁止的操作标记
    bool public tradingRestricted = true; // 限制交易
    bool public liquidityRestricted = true; // 限制流动性
    
    // 价格锚定（始终1:1）
    uint256 public constant PRICE_RATIO = 10000; // 1:1 (basis points)
    
    // 底池统计
    uint256 public totalUSDTLocked; // 锁定的USDT总量
    uint256 public totalBSDTIssued; // 发行的BSDT总量
    
    // ============ 事件 ============
    
    event BSDTMinted(address indexed to, uint256 usdtAmount, uint256 bsdtAmount);
    event BSDTBurned(address indexed from, uint256 bsdtAmount, uint256 usdtAmount);
    event ExchangeAuthorized(address indexed exchange, bool authorized);
    event TradingRestrictionUpdated(bool restricted);
    
    // ============ 构造函数 ============
    
    constructor(address _usdtToken) ERC20("BSDT Stable Token", "BSDT") Ownable(msg.sender) {
        usdtToken = _usdtToken;
    }
    
    // ============ 修饰器 ============
    
    modifier onlyAuthorizedExchange() {
        require(authorizedExchanges[msg.sender] || msg.sender == owner(), "Not authorized exchange");
        _;
    }
    
    modifier tradingNotRestricted(address from, address to) {
        // 允许授权合约和owner操作
        if (tradingRestricted) {
            require(
                authorizedExchanges[from] || 
                authorizedExchanges[to] || 
                from == owner() || 
                to == owner() ||
                from == address(0) || // 铸造
                to == address(0), // 销毁
                "Trading restricted: BSDT can only be exchanged through authorized contracts"
            );
        }
        _;
    }
    
    // ============ 核心功能 ============
    
    /**
     * @dev 铸造BSDT（只能通过授权合约）
     * @param to 接收地址
     * @param usdtAmount USDT数量
     */
    function mintBSDT(address to, uint256 usdtAmount) external onlyAuthorizedExchange {
        require(usdtAmount > 0, "Amount must be positive");
        
        // 1:1铸造
        uint256 bsdtAmount = usdtAmount;
        
        // 更新统计
        totalUSDTLocked += usdtAmount;
        totalBSDTIssued += bsdtAmount;
        
        // 铸造BSDT
        _mint(to, bsdtAmount);
        
        emit BSDTMinted(to, usdtAmount, bsdtAmount);
    }
    
    /**
     * @dev 销毁BSDT（只能通过授权合约）
     * @param from 销毁地址
     * @param bsdtAmount BSDT数量
     */
    function burnBSDT(address from, uint256 bsdtAmount) external onlyAuthorizedExchange {
        require(bsdtAmount > 0, "Amount must be positive");
        require(balanceOf(from) >= bsdtAmount, "Insufficient balance");
        
        // 更新统计
        totalBSDTIssued -= bsdtAmount;
        totalUSDTLocked -= bsdtAmount; // 1:1关系
        
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
     * @dev 禁止approve给DEX路由（可选实现）
     */
    function approve(address spender, uint256 amount) 
        public 
        override 
        returns (bool) 
    {
        // 可以添加DEX路由黑名单
        require(
            !liquidityRestricted || authorizedExchanges[spender] || spender == owner(),
            "Cannot approve to add liquidity"
        );
        return super.approve(spender, amount);
    }
}
