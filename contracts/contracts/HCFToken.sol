// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBSDT {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMultiSigWallet {
    function submitTransaction(address _to, uint256 _value, bytes memory _data) external returns (uint256);
}

contract HCFToken is ERC20, Ownable, ReentrancyGuard {
    // Token Economics
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 10亿
    uint256 public constant INITIAL_RELEASE = 10_000_000 * 10**18;  // 首发1000万
    uint256 public constant RESERVE_FUND = 9_000_000 * 10**18;      // 底池900万(多签控制)
    uint256 public constant MINING_REWARDS = 990_000_000 * 10**18;  // LP挖矿奖励9.9亿 (总量10亿 - 首发1000万)
    uint256 public constant MIN_BALANCE = 1e14; // 0.0001 HCF 不可转账余额
    
    // Tax Rates (basis points: 100 = 1%)
    uint256 public buyTaxRate = 200;    // 2%
    uint256 public sellTaxRate = 500;   // 5%  
    uint256 public transferTaxRate = 100; // 1%
    
    // 真实需求税费分配:
    // 买入 2%: 0.5%烧 + 0.5%营销 + 0.5%LP + 0.5%节点 (0.5%×4)
    // 卖出 5%: 2%烧 + 1%营销 + 1%LP + 1%节点 (2%+1%×3)
    // 转账 1%: 纯销毁
    
    // 买入税分配 (2% = 0.5%×4)
    uint256 public buyBurnRate = 2500;      // 25% of 2% = 0.5%
    uint256 public buyMarketingRate = 2500; // 25% of 2% = 0.5%
    uint256 public buyLPRate = 2500;        // 25% of 2% = 0.5%
    uint256 public buyNodeRate = 2500;      // 25% of 2% = 0.5%
    
    // 卖出税分配 (5% = 2%+1%+1%+1%)
    uint256 public sellBurnRate = 4000;     // 40% of 5% = 2%
    uint256 public sellMarketingRate = 2000; // 20% of 5% = 1%
    uint256 public sellLPRate = 2000;       // 20% of 5% = 1%
    uint256 public sellNodeRate = 2000;     // 20% of 5% = 1%
    
    // Addresses
    address public bsdtToken;
    address public marketingWallet;
    address public lpWallet;
    address public nodeWallet;
    address public reserveWallet; // 储备金钱包（多签控制）
    address public multiSigWallet; // 多签钱包地址
    
    // LP Mining (9.9亿奖励LP提供者)
    uint256 public miningPool = MINING_REWARDS; // 9.9亿LP挖矿奖励
    uint256 public miningReleased;
    uint256 public reserveFund = RESERVE_FUND; // 900万储备金
    address public lpMiningContract; // LP挖矿合约地址
    
    // Trading
    mapping(address => bool) public isExcludedFromTax;
    mapping(address => bool) public isDEXPair;
    bool public tradingEnabled = false;
    
    // Burn tracking
    uint256 public totalBurned;
    uint256 public constant BURN_STOP_SUPPLY = 990_000 * 10**18; // 销毁停止在99万
    
    // Events
    event TaxDistribution(uint256 burned, uint256 marketing, uint256 lp, uint256 nodes);
    event LPMiningReward(address indexed user, uint256 amount);
    event TradingEnabled();
    event LPMiningContractSet(address indexed oldContract, address indexed newContract);
    event TokensBurned(uint256 amount, uint256 totalBurned);
    event BurningStopped(uint256 totalSupply);
    
    constructor(
        address _bsdtToken,
        address _marketingWallet,
        address _lpWallet,
        address _nodeWallet,
        address _reserveWallet
    ) ERC20("HCF Token", "HCF") Ownable(msg.sender) {
        bsdtToken = _bsdtToken;
        marketingWallet = _marketingWallet;
        lpWallet = _lpWallet;
        nodeWallet = _nodeWallet;
        reserveWallet = _reserveWallet;
        
        // Mint initial supply to owner (1% = 1000万)
        _mint(owner(), INITIAL_RELEASE);
        
        // Mint reserve fund to reserve wallet (0.9% = 900万)
        _mint(reserveWallet, RESERVE_FUND);
        
        // Exclude system addresses from tax
        isExcludedFromTax[owner()] = true;
        isExcludedFromTax[address(this)] = true;
        isExcludedFromTax[marketingWallet] = true;
        isExcludedFromTax[lpWallet] = true;
        isExcludedFromTax[nodeWallet] = true;
        isExcludedFromTax[reserveWallet] = true;
    }
    
    // Tax Management (需要多签批准)
    function setTaxRates(uint256 _buyTax, uint256 _sellTax, uint256 _transferTax) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_buyTax <= 1000 && _sellTax <= 1000 && _transferTax <= 1000, "Tax too high");
        buyTaxRate = _buyTax;
        sellTaxRate = _sellTax;
        transferTaxRate = _transferTax;
    }
    
    function setBuyTaxDistribution(uint256 _burn, uint256 _marketing, uint256 _lp, uint256 _node) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_burn + _marketing + _lp + _node == 10000, "Must equal 100%");
        buyBurnRate = _burn;
        buyMarketingRate = _marketing;
        buyLPRate = _lp;
        buyNodeRate = _node;
    }
    
    function setSellTaxDistribution(uint256 _burn, uint256 _marketing, uint256 _lp, uint256 _node) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        require(_burn + _marketing + _lp + _node == 10000, "Must equal 100%");
        sellBurnRate = _burn;
        sellMarketingRate = _marketing;
        sellLPRate = _lp;
        sellNodeRate = _node;
    }
    
    function setExcludedFromTax(address account, bool excluded) external onlyOwner {
        isExcludedFromTax[account] = excluded;
    }
    
    function setDEXPair(address pair, bool isDEX) external onlyOwner {
        isDEXPair[pair] = isDEX;
    }
    
    function enableTrading() external onlyOwner {
        tradingEnabled = true;
        emit TradingEnabled();
    }
    
    function setLPMiningContract(address _lpMiningContract) external onlyOwner {
        require(_lpMiningContract != address(0), "Invalid contract address");
        address oldContract = lpMiningContract;
        lpMiningContract = _lpMiningContract;
        
        // Exclude LP mining contract from tax
        isExcludedFromTax[_lpMiningContract] = true;
        
        emit LPMiningContractSet(oldContract, _lpMiningContract);
    }
    
    // LP Mining Functions  
    function releaseMiningRewards(address to, uint256 amount) external {
        require(msg.sender == lpMiningContract, "Only LP mining contract");
        require(miningReleased + amount <= miningPool, "Exceeds mining pool");
        require(totalSupply() + amount <= TOTAL_SUPPLY, "Exceeds total supply");
        
        miningReleased += amount;
        _mint(to, amount);
        
        emit LPMiningReward(to, amount);
    }
    
    // Legacy mining function for owner (emergency use)
    function releaseMiningRewardsOwner(address to, uint256 amount) external onlyOwner {
        require(miningReleased + amount <= miningPool, "Exceeds mining pool");
        require(totalSupply() + amount <= TOTAL_SUPPLY, "Exceeds total supply");
        
        miningReleased += amount;
        _mint(to, amount);
        
        emit LPMiningReward(to, amount);
    }
    
    // Transfer Override
    function _update(address from, address to, uint256 amount) internal override {
        // Skip tax logic for mint/burn operations
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }
        
        require(amount > 0, "Amount must be positive");
        
        // Check minimum balance requirement (0.0001 HCF must remain)
        if (balanceOf(from) >= MIN_BALANCE) {
            require(balanceOf(from) - amount >= MIN_BALANCE, "Must keep minimum 0.0001 HCF balance");
        }
        
        // Check trading enabled
        if (!tradingEnabled && !isExcludedFromTax[from] && !isExcludedFromTax[to]) {
            require(false, "Trading not enabled");
        }
        
        // Calculate tax
        uint256 taxAmount = 0;
        if (!isExcludedFromTax[from] && !isExcludedFromTax[to]) {
            if (isDEXPair[to]) {
                // Selling
                taxAmount = (amount * sellTaxRate) / 10000;
            } else if (isDEXPair[from]) {
                // Buying
                taxAmount = (amount * buyTaxRate) / 10000;
            } else {
                // Regular transfer
                taxAmount = (amount * transferTaxRate) / 10000;
            }
        }
        
        // Process tax by transferring to tax wallets
        if (taxAmount > 0) {
            uint256 burnAmount;
            uint256 marketingAmount;
            uint256 lpAmount;
            uint256 nodeAmount;
            
            if (isDEXPair[to]) {
                // 卖出税: 2%烧 + 1%营销 + 1%LP + 1%节点
                burnAmount = (taxAmount * sellBurnRate) / 10000;
                marketingAmount = (taxAmount * sellMarketingRate) / 10000;
                lpAmount = (taxAmount * sellLPRate) / 10000;
                nodeAmount = (taxAmount * sellNodeRate) / 10000;
            } else if (isDEXPair[from]) {
                // 买入税: 0.5%×4均等分配
                burnAmount = (taxAmount * buyBurnRate) / 10000;
                marketingAmount = (taxAmount * buyMarketingRate) / 10000;
                lpAmount = (taxAmount * buyLPRate) / 10000;
                nodeAmount = (taxAmount * buyNodeRate) / 10000;
            } else {
                // 转账税: 纯销毁
                burnAmount = taxAmount;
                marketingAmount = 0;
                lpAmount = 0;
                nodeAmount = 0;
            }
            
            // Update balances for tax distribution
            if (burnAmount > 0) {
                // Check if burning should stop (total supply <= 99万)
                uint256 currentSupply = totalSupply();
                if (currentSupply > BURN_STOP_SUPPLY) {
                    // Only burn if above threshold
                    uint256 actualBurnAmount = burnAmount;
                    
                    // If this burn would push supply below threshold, adjust
                    if (currentSupply - burnAmount < BURN_STOP_SUPPLY) {
                        actualBurnAmount = currentSupply - BURN_STOP_SUPPLY;
                        // Redirect excess to marketing wallet instead of burning
                        uint256 redirectAmount = burnAmount - actualBurnAmount;
                        if (redirectAmount > 0) {
                            marketingAmount += redirectAmount;
                        }
                        emit BurningStopped(BURN_STOP_SUPPLY);
                    }
                    
                    if (actualBurnAmount > 0) {
                        super._update(from, address(0xdead), actualBurnAmount);
                        totalBurned += actualBurnAmount;
                        emit TokensBurned(actualBurnAmount, totalBurned);
                    }
                } else {
                    // Already at minimum supply, redirect to marketing
                    marketingAmount += burnAmount;
                }
            }
            if (marketingAmount > 0) {
                super._update(from, marketingWallet, marketingAmount);
            }
            if (lpAmount > 0) {
                super._update(from, lpWallet, lpAmount);
            }
            if (nodeAmount > 0) {
                super._update(from, nodeWallet, nodeAmount);
            }
            
            emit TaxDistribution(burnAmount, marketingAmount, lpAmount, nodeAmount);
            amount -= taxAmount;
        }
        
        super._update(from, to, amount);
    }
    
    
    // BSDT Integration Functions
    function swapBSDTForHCF(uint256 bsdtAmount) external nonReentrant {
        require(tradingEnabled, "Trading not enabled");
        require(bsdtAmount > 0, "Amount must be positive");
        
        // Calculate HCF amount (1:1 ratio for now, can be modified)
        uint256 hcfAmount = bsdtAmount;
        require(balanceOf(address(this)) >= hcfAmount, "Insufficient HCF in contract");
        
        // Transfer BSDT from user to contract
        IBSDT(bsdtToken).transferFrom(msg.sender, address(this), bsdtAmount);
        
        // Transfer HCF to user
        _update(address(this), msg.sender, hcfAmount);
    }
    
    function swapHCFForBSDT(uint256 hcfAmount) external nonReentrant {
        require(tradingEnabled, "Trading not enabled");
        require(hcfAmount > 0, "Amount must be positive");
        require(balanceOf(msg.sender) >= hcfAmount, "Insufficient HCF balance");
        
        // Calculate BSDT amount (1:1 ratio for now, can be modified)  
        uint256 bsdtAmount = hcfAmount;
        require(IBSDT(bsdtToken).balanceOf(address(this)) >= bsdtAmount, "Insufficient BSDT in contract");
        
        // Transfer HCF from user to contract
        _update(msg.sender, address(this), hcfAmount);
        
        // Transfer BSDT to user
        IBSDT(bsdtToken).transfer(msg.sender, bsdtAmount);
    }
    
    // Admin Functions (多签控制储备金)
    function withdrawBSDT(uint256 amount) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        IBSDT(bsdtToken).transfer(msg.sender, amount);
    }
    
    function withdrawHCF(uint256 amount) external {
        require(msg.sender == multiSigWallet || msg.sender == owner(), "Only multisig or owner");
        _update(address(this), msg.sender, amount);
    }
    
    // 设置多签钱包
    function setMultiSigWallet(address _multiSig) external onlyOwner {
        require(_multiSig != address(0), "Invalid multisig address");
        multiSigWallet = _multiSig;
        
        // 将储备金钱包改为多签控制
        if (reserveWallet != _multiSig) {
            // 转移储备金到多签
            uint256 reserveBalance = balanceOf(reserveWallet);
            if (reserveBalance > 0) {
                _update(reserveWallet, _multiSig, reserveBalance);
            }
            reserveWallet = _multiSig;
            isExcludedFromTax[_multiSig] = true;
        }
    }
    
    // View Functions
    function getRemainingMiningPool() external view returns (uint256) {
        return miningPool - miningReleased;
    }
    
    function calculateTax(uint256 amount, bool isBuy, bool isSell) external view returns (uint256) {
        if (isSell) {
            return (amount * sellTaxRate) / 10000;
        } else if (isBuy) {
            return (amount * buyTaxRate) / 10000;
        } else {
            return (amount * transferTaxRate) / 10000;
        }
    }
}