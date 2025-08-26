// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IHCFToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IHCFLPMining {
    function updateLPBalance(address _lpToken, uint256 _newBalance) external;
    function updateBSDTLPBalance(address _user, uint256 _balance) external;
}

interface IBSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

interface IUSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// PancakeSwap接口
interface IPancakeRouter02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
    
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB);
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
        
    function getAmountsIn(uint amountOut, address[] calldata path)
        external view returns (uint[] memory amounts);
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPancakePair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title HCFBSDTExchange
 * @dev 核心兑换系统 - HCF/USDT直接兑换（通过BSDT桥接）
 * 
 * 兑换机制：
 * - USDT → HCF: 无手续费（鼓励买入）
 * - HCF → USDT: 扣3%手续费（限制卖出）
 * - HCF/BSDT池: 用户可自由添加流动性，参与LP挖矿
 * - BSDT/USDT池: 仅owner控制，1:1锚定价格
 */
contract HCFBSDTExchange is Ownable, ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    IHCFToken public hcfToken;
    IBSDT public bsdtToken;
    IUSDT public usdtToken;
    IHCFLPMining public lpMiningContract;
    
    // PancakeSwap
    IPancakeRouter02 public pancakeRouter;
    address public hcfBsdtPair;  // HCF/BSDT交易对（开放）
    address public bsdtUsdtPair;  // BSDT/USDT交易对（仅价格）
    
    // 兑换参数
    uint256 public constant SELL_FEE_RATE = 300;  // 3%卖出手续费
    uint256 public constant FEE_DENOMINATOR = 10000;
    
    // 手续费管理
    address public feeCollector;
    uint256 public totalFeesCollected;
    
    // 监控地址（用于自动转账）
    mapping(address => bool) public monitoredWallets;
    address public monitoringOperator;
    
    // 交易限制
    uint256 public minSwapAmount = 1 * 10**18;      // 最小1个代币
    uint256 public maxSwapAmount = 1000000 * 10**18; // 最大100万
    
    // LP管理（仅HCF/BSDT池）
    mapping(address => uint256) public userLPBalance;
    uint256 public totalLPSupply;
    
    // ============ 事件 ============
    
    event SwapUSDTToHCF(address indexed user, uint256 usdtIn, uint256 hcfOut);
    event SwapHCFToUSDT(address indexed user, uint256 hcfIn, uint256 usdtOut, uint256 fee);
    event SwapHCFToBSDT(address indexed user, uint256 hcfIn, uint256 bsdtOut);
    event SwapBSDTToHCF(address indexed user, uint256 bsdtIn, uint256 hcfOut);
    
    event LiquidityAdded(address indexed provider, uint256 hcfAmount, uint256 bsdtAmount, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, uint256 lpTokens, uint256 hcfAmount, uint256 bsdtAmount);
    
    event AutoBSDTMinted(address indexed user, uint256 usdtAmount, uint256 bsdtAmount);
    event AutoUSDTTransferred(address indexed user, uint256 bsdtAmount, uint256 usdtAmount);
    
    event FeeCollected(uint256 amount);
    event MonitoredWalletUpdated(address wallet, bool status);
    
    // ============ 构造函数 ============
    
    constructor(
        address _hcfToken,
        address _bsdtToken,
        address _usdtToken,
        address _pancakeRouter,
        address _feeCollector
    ) Ownable(msg.sender) {
        hcfToken = IHCFToken(_hcfToken);
        bsdtToken = IBSDT(_bsdtToken);
        usdtToken = IUSDT(_usdtToken);
        pancakeRouter = IPancakeRouter02(_pancakeRouter);
        feeCollector = _feeCollector;
        monitoringOperator = msg.sender;
        
        // 授权路由器
        hcfToken.approve(_pancakeRouter, type(uint256).max);
        bsdtToken.approve(_pancakeRouter, type(uint256).max);
        usdtToken.approve(_pancakeRouter, type(uint256).max);
    }
    
    // ============ 初始化流动性池 ============
    
    /**
     * @dev 创建BSDT/USDT池（仅owner，1:1锚定）
     */
    function createBSDTUSDTPool(uint256 _amount) external onlyOwner {
        require(bsdtUsdtPair == address(0), "Pool already exists");
        require(_amount > 0, "Amount must be positive");
        
        // 转入代币
        require(bsdtToken.transferFrom(msg.sender, address(this), _amount), "BSDT transfer failed");
        require(usdtToken.transferFrom(msg.sender, address(this), _amount), "USDT transfer failed");
        
        // 添加流动性（1:1）
        (,, uint256 liquidity) = pancakeRouter.addLiquidity(
            address(bsdtToken),
            address(usdtToken),
            _amount,
            _amount,
            _amount,
            _amount,
            address(this), // LP代币锁定在合约
            block.timestamp + 300
        );
        
        // 获取配对地址
        IPancakeFactory factory = IPancakeFactory(pancakeRouter.factory());
        bsdtUsdtPair = factory.getPair(address(bsdtToken), address(usdtToken));
        
        require(liquidity > 0, "Failed to add liquidity");
    }
    
    /**
     * @dev 创建HCF/BSDT池（初始流动性）
     */
    function createHCFBSDTPool(uint256 _hcfAmount, uint256 _bsdtAmount) external onlyOwner {
        require(hcfBsdtPair == address(0), "Pool already exists");
        require(_hcfAmount > 0 && _bsdtAmount > 0, "Amounts must be positive");
        
        // 转入代币
        require(hcfToken.transferFrom(msg.sender, address(this), _hcfAmount), "HCF transfer failed");
        require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        
        // 添加初始流动性
        (,, uint256 liquidity) = pancakeRouter.addLiquidity(
            address(hcfToken),
            address(bsdtToken),
            _hcfAmount,
            _bsdtAmount,
            0,
            0,
            msg.sender, // LP代币给owner
            block.timestamp + 300
        );
        
        // 获取配对地址
        IPancakeFactory factory = IPancakeFactory(pancakeRouter.factory());
        hcfBsdtPair = factory.getPair(address(hcfToken), address(bsdtToken));
        
        require(liquidity > 0, "Failed to add liquidity");
    }
    
    // ============ 核心兑换功能 ============
    
    /**
     * @dev USDT → HCF（买入，无手续费）
     */
    function swapUSDTToHCF(uint256 _usdtAmount) external nonReentrant {
        require(_usdtAmount >= minSwapAmount && _usdtAmount <= maxSwapAmount, "Amount out of range");
        require(hcfBsdtPair != address(0), "HCF/BSDT pool not initialized");
        
        // 1. 转入USDT
        require(usdtToken.transferFrom(msg.sender, address(this), _usdtAmount), "USDT transfer failed");
        
        // 2. 铸造等量BSDT（1:1）
        bsdtToken.mint(address(this), _usdtAmount);
        
        // 3. BSDT → HCF（通过PancakeSwap）
        address[] memory path = new address[](2);
        path[0] = address(bsdtToken);
        path[1] = address(hcfToken);
        
        uint256 hcfBalanceBefore = hcfToken.balanceOf(msg.sender);
        
        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            _usdtAmount,  // 全额BSDT兑换
            0,  // 接受任何数量的HCF
            path,
            msg.sender,
            block.timestamp + 300
        );
        
        uint256 hcfReceived = amounts[amounts.length - 1];
        
        emit SwapUSDTToHCF(msg.sender, _usdtAmount, hcfReceived);
    }
    
    /**
     * @dev HCF → USDT（卖出，扣3%手续费）
     */
    function swapHCFToUSDT(uint256 _hcfAmount) external nonReentrant {
        require(_hcfAmount >= minSwapAmount && _hcfAmount <= maxSwapAmount, "Amount out of range");
        require(hcfBsdtPair != address(0), "HCF/BSDT pool not initialized");
        
        // 1. 转入HCF
        require(hcfToken.transferFrom(msg.sender, address(this), _hcfAmount), "HCF transfer failed");
        
        // 2. HCF → BSDT（通过PancakeSwap）
        address[] memory path = new address[](2);
        path[0] = address(hcfToken);
        path[1] = address(bsdtToken);
        
        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            _hcfAmount,
            0,  // 接受任何数量的BSDT
            path,
            address(this),
            block.timestamp + 300
        );
        
        uint256 bsdtReceived = amounts[amounts.length - 1];
        
        // 3. 扣除3%手续费
        uint256 feeAmount = (bsdtReceived * SELL_FEE_RATE) / FEE_DENOMINATOR;
        uint256 usdtAmount = bsdtReceived - feeAmount;
        
        // 4. 销毁BSDT并发送USDT
        bsdtToken.burn(bsdtReceived);
        require(usdtToken.transfer(msg.sender, usdtAmount), "USDT transfer failed");
        
        // 5. 处理手续费
        if (feeAmount > 0) {
            totalFeesCollected += feeAmount;
            require(usdtToken.transfer(feeCollector, feeAmount), "Fee transfer failed");
            emit FeeCollected(feeAmount);
        }
        
        emit SwapHCFToUSDT(msg.sender, _hcfAmount, usdtAmount, feeAmount);
    }
    
    /**
     * @dev HCF → BSDT 直接兑换
     */
    function swapHCFToBSDT(uint256 _hcfAmount) external nonReentrant {
        require(_hcfAmount >= minSwapAmount && _hcfAmount <= maxSwapAmount, "Amount out of range");
        require(hcfBsdtPair != address(0), "HCF/BSDT pool not initialized");
        
        // 转入HCF
        require(hcfToken.transferFrom(msg.sender, address(this), _hcfAmount), "HCF transfer failed");
        
        // HCF → BSDT
        address[] memory path = new address[](2);
        path[0] = address(hcfToken);
        path[1] = address(bsdtToken);
        
        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            _hcfAmount,
            0,
            path,
            msg.sender,
            block.timestamp + 300
        );
        
        emit SwapHCFToBSDT(msg.sender, _hcfAmount, amounts[1]);
    }
    
    /**
     * @dev BSDT → HCF 直接兑换
     */
    function swapBSDTToHCF(uint256 _bsdtAmount) external nonReentrant {
        require(_bsdtAmount >= minSwapAmount && _bsdtAmount <= maxSwapAmount, "Amount out of range");
        require(hcfBsdtPair != address(0), "HCF/BSDT pool not initialized");
        
        // 转入BSDT
        require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        
        // BSDT → HCF
        address[] memory path = new address[](2);
        path[0] = address(bsdtToken);
        path[1] = address(hcfToken);
        
        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            _bsdtAmount,
            0,
            path,
            msg.sender,
            block.timestamp + 300
        );
        
        emit SwapBSDTToHCF(msg.sender, _bsdtAmount, amounts[1]);
    }
    
    // ============ LP流动性功能（仅HCF/BSDT池） ============
    
    /**
     * @dev 用户添加HCF/BSDT流动性
     */
    function addLiquidity(uint256 _hcfAmount, uint256 _bsdtAmount) external nonReentrant {
        require(hcfBsdtPair != address(0), "HCF/BSDT pool not initialized");
        require(_hcfAmount > 0 && _bsdtAmount > 0, "Amounts must be positive");
        
        // 转入代币
        require(hcfToken.transferFrom(msg.sender, address(this), _hcfAmount), "HCF transfer failed");
        require(bsdtToken.transferFrom(msg.sender, address(this), _bsdtAmount), "BSDT transfer failed");
        
        // 添加流动性
        (uint256 hcfUsed, uint256 bsdtUsed, uint256 liquidity) = pancakeRouter.addLiquidity(
            address(hcfToken),
            address(bsdtToken),
            _hcfAmount,
            _bsdtAmount,
            0,
            0,
            address(this),  // LP代币发给合约
            block.timestamp + 300
        );
        
        // 退还未使用的代币
        if (_hcfAmount > hcfUsed) {
            hcfToken.transfer(msg.sender, _hcfAmount - hcfUsed);
        }
        if (_bsdtAmount > bsdtUsed) {
            bsdtToken.transfer(msg.sender, _bsdtAmount - bsdtUsed);
        }
        
        // 记录用户LP份额
        userLPBalance[msg.sender] += liquidity;
        totalLPSupply += liquidity;
        
        // 更新LP挖矿（如果已设置）
        if (address(lpMiningContract) != address(0)) {
            lpMiningContract.updateBSDTLPBalance(msg.sender, userLPBalance[msg.sender]);
        }
        
        emit LiquidityAdded(msg.sender, hcfUsed, bsdtUsed, liquidity);
    }
    
    /**
     * @dev 用户移除HCF/BSDT流动性
     */
    function removeLiquidity(uint256 _lpAmount) external nonReentrant {
        require(_lpAmount > 0 && _lpAmount <= userLPBalance[msg.sender], "Invalid LP amount");
        
        // 更新用户余额
        userLPBalance[msg.sender] -= _lpAmount;
        totalLPSupply -= _lpAmount;
        
        // 授权LP代币给路由器
        IPancakePair pair = IPancakePair(hcfBsdtPair);
        pair.approve(address(pancakeRouter), _lpAmount);
        
        // 移除流动性
        (uint256 hcfAmount, uint256 bsdtAmount) = pancakeRouter.removeLiquidity(
            address(hcfToken),
            address(bsdtToken),
            _lpAmount,
            0,
            0,
            msg.sender,
            block.timestamp + 300
        );
        
        // 更新LP挖矿
        if (address(lpMiningContract) != address(0)) {
            lpMiningContract.updateBSDTLPBalance(msg.sender, userLPBalance[msg.sender]);
        }
        
        emit LiquidityRemoved(msg.sender, _lpAmount, hcfAmount, bsdtAmount);
    }
    
    // ============ 监控与自动转账 ============
    
    /**
     * @dev 监控USDT转入，自动铸造BSDT
     */
    function monitorUSDTTransfer(address _user, uint256 _amount) external {
        require(msg.sender == monitoringOperator, "Not operator");
        require(monitoredWallets[_user], "Wallet not monitored");
        
        // 铸造等量BSDT给用户
        bsdtToken.mint(_user, _amount);
        
        emit AutoBSDTMinted(_user, _amount, _amount);
    }
    
    /**
     * @dev 监控BSDT转入，自动转97% USDT
     */
    function monitorBSDTTransfer(address _user, uint256 _amount) external {
        require(msg.sender == monitoringOperator, "Not operator");
        require(monitoredWallets[_user], "Wallet not monitored");
        
        // 计算97% USDT
        uint256 usdtAmount = (_amount * (FEE_DENOMINATOR - SELL_FEE_RATE)) / FEE_DENOMINATOR;
        
        // 销毁BSDT
        require(bsdtToken.transferFrom(_user, address(this), _amount), "BSDT transfer failed");
        bsdtToken.burn(_amount);
        
        // 发送97% USDT
        require(usdtToken.transfer(_user, usdtAmount), "USDT transfer failed");
        
        // 手续费给收集器
        uint256 fee = _amount - usdtAmount;
        if (fee > 0) {
            require(usdtToken.transfer(feeCollector, fee), "Fee transfer failed");
        }
        
        emit AutoUSDTTransferred(_user, _amount, usdtAmount);
    }
    
    // ============ 查询函数 ============
    
    function getHCFPrice() external view returns (uint256) {
        if (hcfBsdtPair == address(0)) return 0;
        
        IPancakePair pair = IPancakePair(hcfBsdtPair);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        
        address token0 = pair.token0();
        if (token0 == address(hcfToken)) {
            return (uint256(reserve1) * 1e18) / reserve0; // BSDT per HCF
        } else {
            return (uint256(reserve0) * 1e18) / reserve1; // BSDT per HCF
        }
    }
    
    function simulateSwap(uint256 _amount, bool _isBuy) external view returns (uint256 output, uint256 fee) {
        if (_isBuy) {
            // USDT → HCF（无手续费）
            address[] memory path = new address[](2);
            path[0] = address(bsdtToken);
            path[1] = address(hcfToken);
            
            uint256[] memory amounts = pancakeRouter.getAmountsOut(_amount, path);
            return (amounts[1], 0);
        } else {
            // HCF → USDT（扣3%）
            address[] memory path = new address[](2);
            path[0] = address(hcfToken);
            path[1] = address(bsdtToken);
            
            uint256[] memory amounts = pancakeRouter.getAmountsOut(_amount, path);
            fee = (amounts[1] * SELL_FEE_RATE) / FEE_DENOMINATOR;
            output = amounts[1] - fee;
        }
    }
    
    function getUserLPInfo(address _user) external view returns (
        uint256 lpBalance,
        uint256 lpShare,
        uint256 hcfValue,
        uint256 bsdtValue
    ) {
        lpBalance = userLPBalance[_user];
        lpShare = totalLPSupply > 0 ? (lpBalance * FEE_DENOMINATOR) / totalLPSupply : 0;
        
        if (hcfBsdtPair != address(0) && lpBalance > 0) {
            IPancakePair pair = IPancakePair(hcfBsdtPair);
            uint256 pairTotalSupply = pair.totalSupply();
            
            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
            address token0 = pair.token0();
            
            if (token0 == address(hcfToken)) {
                hcfValue = (uint256(reserve0) * lpBalance) / pairTotalSupply;
                bsdtValue = (uint256(reserve1) * lpBalance) / pairTotalSupply;
            } else {
                hcfValue = (uint256(reserve1) * lpBalance) / pairTotalSupply;
                bsdtValue = (uint256(reserve0) * lpBalance) / pairTotalSupply;
            }
        }
    }
    
    // ============ 管理函数 ============
    
    function setLPMiningContract(address _lpMiningContract) external onlyOwner {
        lpMiningContract = IHCFLPMining(_lpMiningContract);
    }
    
    function setMonitoredWallet(address _wallet, bool _monitored) external onlyOwner {
        monitoredWallets[_wallet] = _monitored;
        emit MonitoredWalletUpdated(_wallet, _monitored);
    }
    
    function setMonitoringOperator(address _operator) external onlyOwner {
        monitoringOperator = _operator;
    }
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }
    
    function setSwapLimits(uint256 _min, uint256 _max) external onlyOwner {
        minSwapAmount = _min;
        maxSwapAmount = _max;
    }
    
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).transfer(owner(), _amount);
    }
}