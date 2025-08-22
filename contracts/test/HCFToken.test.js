const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Token", function () {
  let hcfToken;
  let mockBSDT;
  let owner, marketing, lp, node, user1, user2;

  // Use strings for large numbers to avoid overflow
  const TOTAL_SUPPLY = "1000000000"; // 10亿
  const INITIAL_RELEASE = "10000000";  // 1000万
  const FINAL_SUPPLY = "990000";       // 99万

  beforeEach(async function () {
    [owner, marketing, lp, node, user1, user2] = await ethers.getSigners();

    // Deploy Mock BSDT Token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockERC20.deploy("BSDT Token", "BSDT", ethers.utils.parseEther("1000000"));
    await mockBSDT.deployed();

    // Deploy HCF Token
    const HCFToken = await ethers.getContractFactory("HCFToken");
    hcfToken = await HCFToken.deploy(
      mockBSDT.address,
      marketing.address,
      lp.address,
      node.address
    );
    await hcfToken.deployed();
  });

  describe("Deployment", function () {
    it("Should have correct name and symbol", async function () {
      expect(await hcfToken.name()).to.equal("HCF Token");
      expect(await hcfToken.symbol()).to.equal("HCF");
    });

    it("Should mint initial supply to owner", async function () {
      const ownerBalance = await hcfToken.balanceOf(owner.address);
      const expectedBalance = ethers.utils.parseEther(INITIAL_RELEASE);
      expect(ownerBalance.toString()).to.equal(expectedBalance.toString());
    });

    it("Should set correct addresses", async function () {
      expect(await hcfToken.bsdtToken()).to.equal(mockBSDT.address);
      expect(await hcfToken.marketingWallet()).to.equal(marketing.address);
      expect(await hcfToken.lpWallet()).to.equal(lp.address);
      expect(await hcfToken.nodeWallet()).to.equal(node.address);
    });

    it("Should exclude system addresses from tax", async function () {
      expect(await hcfToken.isExcludedFromTax(owner.address)).to.be.true;
      expect(await hcfToken.isExcludedFromTax(hcfToken.address)).to.be.true;
      expect(await hcfToken.isExcludedFromTax(marketing.address)).to.be.true;
    });
  });

  describe("Tax System", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      // Give user1 some tokens for testing
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("1000"));
    });

    it("Should apply transfer tax", async function () {
      const transferAmount = ethers.utils.parseEther("100");
      const user2BalanceBefore = await hcfToken.balanceOf(user2.address);
      
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);
      
      const user2BalanceAfter = await hcfToken.balanceOf(user2.address);
      const received = user2BalanceAfter.sub(user2BalanceBefore);
      
      // Calculate expected: 100 - (100 * 1% tax) = 99
      const expectedReceived = transferAmount.mul(99).div(100);
      expect(received.toString()).to.equal(expectedReceived.toString());
    });

    it("Should distribute tax correctly", async function () {
      const transferAmount = ethers.utils.parseEther("100");
      
      const marketingBalanceBefore = await hcfToken.balanceOf(marketing.address);
      const lpBalanceBefore = await hcfToken.balanceOf(lp.address);
      const nodeBalanceBefore = await hcfToken.balanceOf(node.address);

      await hcfToken.connect(user1).transfer(user2.address, transferAmount);

      const marketingBalanceAfter = await hcfToken.balanceOf(marketing.address);
      const lpBalanceAfter = await hcfToken.balanceOf(lp.address);
      const nodeBalanceAfter = await hcfToken.balanceOf(node.address);

      // Tax is 1% of 100 = 1 HCF
      // Marketing gets 30% of 1 = 0.3 HCF
      const totalTax = transferAmount.mul(1).div(100); // 1%
      const expectedMarketingIncrease = totalTax.mul(30).div(100); // 30%
      const expectedLpIncrease = totalTax.mul(20).div(100); // 20%  
      const expectedNodeIncrease = totalTax.mul(10).div(100); // 10%
      
      expect(marketingBalanceAfter.sub(marketingBalanceBefore).toString()).to.equal(expectedMarketingIncrease.toString());
      expect(lpBalanceAfter.sub(lpBalanceBefore).toString()).to.equal(expectedLpIncrease.toString());
      expect(nodeBalanceAfter.sub(nodeBalanceBefore).toString()).to.equal(expectedNodeIncrease.toString());
    });

    it("Should allow owner to update tax rates", async function () {
      await hcfToken.setTaxRates(300, 600, 150); // 3%, 6%, 1.5%
      
      expect(await hcfToken.buyTaxRate()).to.equal(300);
      expect(await hcfToken.sellTaxRate()).to.equal(600);
      expect(await hcfToken.transferTaxRate()).to.equal(150);
    });

    it("Should prevent non-owner from updating tax rates", async function () {
      await expect(
        hcfToken.connect(user1).setTaxRates(300, 600, 150)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("Mining System", function () {
    it("Should have correct initial mining pool", async function () {
      const remainingPool = await hcfToken.getRemainingMiningPool();
      
      // Calculate expected pool: TOTAL_SUPPLY - INITIAL_RELEASE
      const totalSupply = ethers.utils.parseEther(TOTAL_SUPPLY);
      const initialRelease = ethers.utils.parseEther(INITIAL_RELEASE);
      const expectedPool = totalSupply.sub(initialRelease);
      
      expect(remainingPool.toString()).to.equal(expectedPool.toString());
    });

    it("Should allow owner to release mining rewards", async function () {
      const rewardAmount = ethers.utils.parseEther("1000");
      const user1BalanceBefore = await hcfToken.balanceOf(user1.address);
      
      await expect(hcfToken.releaseMiningRewards(user1.address, rewardAmount))
        .to.emit(hcfToken, "MiningReward")
        .withArgs(user1.address, rewardAmount);

      const user1BalanceAfter = await hcfToken.balanceOf(user1.address);
      expect(user1BalanceAfter.sub(user1BalanceBefore).toString()).to.equal(rewardAmount.toString());
    });

    it("Should prevent exceeding mining pool", async function () {
      const totalPool = await hcfToken.getRemainingMiningPool();
      const excessAmount = totalPool.add(ethers.utils.parseEther("1"));

      await expect(
        hcfToken.releaseMiningRewards(user1.address, excessAmount)
      ).to.be.revertedWith("Exceeds mining pool");
    });
  });

  describe("BSDT Integration", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      
      // Give contract some HCF for swaps
      await hcfToken.transfer(hcfToken.address, ethers.utils.parseEther("1000"));
      
      // Give contract and user some BSDT
      await mockBSDT.transfer(hcfToken.address, ethers.utils.parseEther("1000"));
      await mockBSDT.transfer(user1.address, ethers.utils.parseEther("1000"));
    });

    it("Should allow swapping BSDT for HCF", async function () {
      const swapAmount = ethers.utils.parseEther("100");
      
      // Approve spending
      await mockBSDT.connect(user1).approve(hcfToken.address, swapAmount);
      
      const user1HCFBefore = await hcfToken.balanceOf(user1.address);
      
      await hcfToken.connect(user1).swapBSDTForHCF(swapAmount);
      
      const user1HCFAfter = await hcfToken.balanceOf(user1.address);
      expect(user1HCFAfter.sub(user1HCFBefore).toString()).to.equal(swapAmount.toString());
    });

    it("Should allow swapping HCF for BSDT", async function () {
      const swapAmount = ethers.utils.parseEther("50");
      
      // Give user some HCF first
      await hcfToken.transfer(user1.address, swapAmount);
      
      const user1BSDTBefore = await mockBSDT.balanceOf(user1.address);
      
      await hcfToken.connect(user1).swapHCFForBSDT(swapAmount);
      
      const user1BSDTAfter = await mockBSDT.balanceOf(user1.address);
      expect(user1BSDTAfter.sub(user1BSDTBefore).toString()).to.equal(swapAmount.toString());
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to enable trading", async function () {
      // First check it's disabled
      expect(await hcfToken.tradingEnabled()).to.be.false;
      
      await expect(hcfToken.enableTrading())
        .to.emit(hcfToken, "TradingEnabled");
        
      expect(await hcfToken.tradingEnabled()).to.be.true;
    });

    it("Should prevent transfers when trading is disabled", async function () {
      // Give user1 some tokens
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("100"));
      
      // Try to transfer without enabling trading
      await expect(
        hcfToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("50"))
      ).to.be.revertedWith("Trading not enabled");
    });

    it("Should allow setting DEX pairs", async function () {
      const dexPair = user2.address; // Use user2 as mock DEX pair
      
      await hcfToken.setDEXPair(dexPair, true);
      expect(await hcfToken.isDEXPair(dexPair)).to.be.true;
      
      await hcfToken.setDEXPair(dexPair, false);
      expect(await hcfToken.isDEXPair(dexPair)).to.be.false;
    });

    it("Should allow excluding addresses from tax", async function () {
      expect(await hcfToken.isExcludedFromTax(user1.address)).to.be.false;
      
      await hcfToken.setExcludedFromTax(user1.address, true);
      expect(await hcfToken.isExcludedFromTax(user1.address)).to.be.true;
      
      await hcfToken.setExcludedFromTax(user1.address, false);
      expect(await hcfToken.isExcludedFromTax(user1.address)).to.be.false;
    });

    it("Should prevent setting tax rates too high", async function () {
      await expect(
        hcfToken.setTaxRates(1100, 600, 150) // 11% > 10% limit
      ).to.be.revertedWith("Tax too high");
    });

    it("Should allow owner to withdraw BSDT and HCF", async function () {
      // Give contract some tokens first
      await hcfToken.transfer(hcfToken.address, ethers.utils.parseEther("100"));
      await mockBSDT.transfer(hcfToken.address, ethers.utils.parseEther("100"));
      
      const ownerHCFBefore = await hcfToken.balanceOf(owner.address);
      const ownerBSDTBefore = await mockBSDT.balanceOf(owner.address);
      
      await hcfToken.withdrawHCF(ethers.utils.parseEther("50"));
      await hcfToken.withdrawBSDT(ethers.utils.parseEther("50"));
      
      const ownerHCFAfter = await hcfToken.balanceOf(owner.address);
      const ownerBSDTAfter = await mockBSDT.balanceOf(owner.address);
      
      expect(ownerHCFAfter.sub(ownerHCFBefore).toString()).to.equal(ethers.utils.parseEther("50").toString());
      expect(ownerBSDTAfter.sub(ownerBSDTBefore).toString()).to.equal(ethers.utils.parseEther("50").toString());
    });
  });
});