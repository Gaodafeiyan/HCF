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

contract HCFToken is ERC20, Ownable, ReentrancyGuard {
    // Token Economics
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 10亿
    uint256 public constant INITIAL_RELEASE = 10_000_000 * 10**18;  // 首发1000万
    uint256 public constant FINAL_SUPPLY = 990_000 * 10**18;       // 最终99万
    
    // Tax Rates (basis points: 100 = 1%)
    uint256 public buyTaxRate = 200;    // 2%
    uint256 public sellTaxRate = 500;   // 5%  
    uint256 public transferTaxRate = 100; // 1%
    
    // Tax Distribution (basis points)
    uint256 public burnRate = 4000;     // 40%
    uint256 public marketingRate = 3000; // 30%
    uint256 public lpRate = 2000;       // 20%
    uint256 public nodeRate = 1000;     // 10%
    
    // Addresses
    address public bsdtToken;
    address public marketingWallet;
    address public lpWallet;
    address public nodeWallet;
    
    // Mining
    uint256 public miningPool = TOTAL_SUPPLY - INITIAL_RELEASE; // 9.9亿挖矿奖励
    uint256 public miningReleased;
    
    // Trading
    mapping(address => bool) public isExcludedFromTax;
    mapping(address => bool) public isDEXPair;
    bool public tradingEnabled = false;
    
    // Events
    event TaxDistribution(uint256 burned, uint256 marketing, uint256 lp, uint256 nodes);
    event MiningReward(address indexed user, uint256 amount);
    event TradingEnabled();
    
    constructor(
        address _bsdtToken,
        address _marketingWallet,
        address _lpWallet,
        address _nodeWallet
    ) ERC20("HCF Token", "HCF") Ownable(msg.sender) {
        bsdtToken = _bsdtToken;
        marketingWallet = _marketingWallet;
        lpWallet = _lpWallet;
        nodeWallet = _nodeWallet;
        
        // Mint initial supply to owner
        _mint(owner(), INITIAL_RELEASE);
        
        // Exclude system addresses from tax
        isExcludedFromTax[owner()] = true;
        isExcludedFromTax[address(this)] = true;
        isExcludedFromTax[marketingWallet] = true;
        isExcludedFromTax[lpWallet] = true;
        isExcludedFromTax[nodeWallet] = true;
    }
    
    // Tax Management
    function setTaxRates(uint256 _buyTax, uint256 _sellTax, uint256 _transferTax) external onlyOwner {
        require(_buyTax <= 1000 && _sellTax <= 1000 && _transferTax <= 1000, "Tax too high");
        buyTaxRate = _buyTax;
        sellTaxRate = _sellTax;
        transferTaxRate = _transferTax;
    }
    
    function setTaxDistribution(uint256 _burn, uint256 _marketing, uint256 _lp, uint256 _node) external onlyOwner {
        require(_burn + _marketing + _lp + _node == 10000, "Must equal 100%");
        burnRate = _burn;
        marketingRate = _marketing;
        lpRate = _lp;
        nodeRate = _node;
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
    
    // Mining Functions
    function releaseMiningRewards(address to, uint256 amount) external onlyOwner {
        require(miningReleased + amount <= miningPool, "Exceeds mining pool");
        require(totalSupply() + amount <= TOTAL_SUPPLY, "Exceeds total supply");
        
        miningReleased += amount;
        _mint(to, amount);
        
        emit MiningReward(to, amount);
    }
    
    // Transfer Override
    function _update(address from, address to, uint256 amount) internal override {
        // Skip tax logic for mint/burn operations
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }
        
        require(amount > 0, "Amount must be positive");
        
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
            uint256 burnAmount = (taxAmount * burnRate) / 10000;
            uint256 marketingAmount = (taxAmount * marketingRate) / 10000;
            uint256 lpAmount = (taxAmount * lpRate) / 10000;
            uint256 nodeAmount = (taxAmount * nodeRate) / 10000;
            
            // Update balances for tax distribution
            if (burnAmount > 0) {
                super._update(from, address(0xdead), burnAmount);
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
    
    // Admin Functions
    function withdrawBSDT(uint256 amount) external onlyOwner {
        IBSDT(bsdtToken).transfer(owner(), amount);
    }
    
    function withdrawHCF(uint256 amount) external onlyOwner {
        _update(address(this), owner(), amount);
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