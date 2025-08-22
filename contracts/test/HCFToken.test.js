const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Token", function () {
  let hcfToken;
  let mockBSDT;
  let owner, marketing, lp, node, user1, user2;

  const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000"); // 10亿
  const INITIAL_RELEASE = ethers.utils.parseEther("10000000");  // 1000万
  const FINAL_SUPPLY = ethers.utils.parseEther("990000");       // 99万

  beforeEach(async function () {
    [owner, marketing, lp, node, user1, user2] = await ethers.getSigners();

    // Deploy Mock BSDT Token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockERC20.deploy("BSDT Token", "BSDT", ethers.utils.parseEther("1000000"));

    // Deploy HCF Token
    const HCFToken = await ethers.getContractFactory("HCFToken");
    hcfToken = await HCFToken.deploy(
      mockBSDT.address,
      marketing.address,
      lp.address,
      node.address
    );
  });

  describe("Deployment", function () {
    it("Should have correct name and symbol", async function () {
      expect(await hcfToken.name()).to.equal("HCF Token");
      expect(await hcfToken.symbol()).to.equal("HCF");
    });

    it("Should mint initial supply to owner", async function () {
      const ownerBalance = await hcfToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(INITIAL_RELEASE);
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
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("1000"));
    });

    it("Should apply transfer tax", async function () {
      const transferAmount = ethers.utils.parseEther("100");
      const expectedTax = transferAmount * BigInt(100) / BigInt(10000); // 1%
      const expectedReceived = transferAmount - expectedTax;

      await hcfToken.connect(user1).transfer(user2.address, transferAmount);

      const user2Balance = await hcfToken.balanceOf(user2.address);
      expect(user2Balance).to.equal(expectedReceived);
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
      const expectedMarketingIncrease = transferAmount * BigInt(100) * BigInt(3000) / (BigInt(10000) * BigInt(10000));
      
      expect(marketingBalanceAfter - marketingBalanceBefore).to.equal(expectedMarketingIncrease);
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
      ).to.be.revertedWithCustomError(hcfToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mining System", function () {
    it("Should have correct initial mining pool", async function () {
      const remainingPool = await hcfToken.getRemainingMiningPool();
      const expectedPool = TOTAL_SUPPLY - INITIAL_RELEASE;
      expect(remainingPool).to.equal(expectedPool);
    });

    it("Should allow owner to release mining rewards", async function () {
      const rewardAmount = ethers.utils.parseEther("1000");
      
      await expect(hcfToken.releaseMiningRewards(user1.address, rewardAmount))
        .to.emit(hcfToken, "MiningReward")
        .withArgs(user1.address, rewardAmount);

      const user1Balance = await hcfToken.balanceOf(user1.address);
      expect(user1Balance).to.equal(rewardAmount);
    });

    it("Should prevent exceeding mining pool", async function () {
      const totalPool = await hcfToken.getRemainingMiningPool();
      const excessAmount = totalPool + BigInt(1);

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
      expect(user1HCFAfter - user1HCFBefore).to.equal(swapAmount);
    });

    it("Should allow swapping HCF for BSDT", async function () {
      const swapAmount = ethers.utils.parseEther("50");
      
      // Give user some HCF first
      await hcfToken.transfer(user1.address, swapAmount);
      
      const user1BSDTBefore = await mockBSDT.balanceOf(user1.address);
      
      await hcfToken.connect(user1).swapHCFForBSDT(swapAmount);
      
      const user1BSDTAfter = await mockBSDT.balanceOf(user1.address);
      expect(user1BSDTAfter - user1BSDTBefore).to.equal(swapAmount);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to enable trading", async function () {
      expect(await hcfToken.tradingEnabled()).to.be.false;
      
      await expect(hcfToken.enableTrading())
        .to.emit(hcfToken, "TradingEnabled");
        
      expect(await hcfToken.tradingEnabled()).to.be.true;
    });

    it("Should prevent transfers when trading is disabled", async function () {
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("100"));
      
      await expect(
        hcfToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("50"))
      ).to.be.revertedWith("Trading not enabled");
    });
  });
});