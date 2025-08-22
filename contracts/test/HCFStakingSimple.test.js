const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Staking Contract - Core Functions", function () {
  let hcfToken;
  let mockBSDT;
  let mockUSDC;
  let hcfStaking;
  let owner, marketing, lp, node, user1, user2;

  const SECONDS_PER_DAY = 86400;

  beforeEach(async function () {
    [owner, marketing, lp, node, user1, user2] = await ethers.getSigners();

    // Deploy Mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockERC20.deploy("BSDT Token", "BSDT", ethers.utils.parseEther("1000000"));
    await mockBSDT.deployed();
    
    mockUSDC = await MockERC20.deploy("USDC Token", "USDC", ethers.utils.parseEther("1000000"));
    await mockUSDC.deployed();

    // Deploy HCF Token
    const HCFToken = await ethers.getContractFactory("HCFToken");
    hcfToken = await HCFToken.deploy(
      mockBSDT.address,
      marketing.address,
      lp.address,
      node.address
    );
    await hcfToken.deployed();

    // Deploy HCF Staking
    const HCFStaking = await ethers.getContractFactory("HCFStaking");
    hcfStaking = await HCFStaking.deploy(
      hcfToken.address,
      mockBSDT.address,
      mockUSDC.address
    );
    await hcfStaking.deployed();

    // Setup
    await hcfToken.enableTrading();
    await hcfToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    await hcfToken.transfer(user2.address, ethers.utils.parseEther("10000"));
    
    await mockUSDC.transfer(hcfStaking.address, ethers.utils.parseEther("100000"));

    await hcfToken.connect(user1).approve(hcfStaking.address, ethers.utils.parseEther("10000"));
    await hcfToken.connect(user2).approve(hcfStaking.address, ethers.utils.parseEther("10000"));
  });

  describe("Pool Configuration", function () {
    it("Should initialize 5 pools correctly", async function () {
      const expectedRates = [40, 80, 120, 140, 160];
      for (let i = 0; i < 5; i++) {
        const poolInfo = await hcfStaking.getPoolInfo(i);
        expect(poolInfo.active).to.be.true;
        expect(poolInfo.dailyRate).to.equal(expectedRates[i]);
      }
    });
  });

  describe("Basic Staking", function () {
    it("Should allow staking within daily limits", async function () {
      const stakeAmount = ethers.utils.parseEther("400"); // Within 500 daily limit
      const poolId = 0;

      await expect(hcfStaking.connect(user1).stake(poolId, stakeAmount, false))
        .to.emit(hcfStaking, "Staked");

      const userInfo = await hcfStaking.getUserInfo(user1.address);
      expect(userInfo.amount).to.equal(stakeAmount);
    });

    it("Should prevent staking below minimum", async function () {
      const stakeAmount = ethers.utils.parseEther("50");
      
      await expect(hcfStaking.connect(user1).stake(0, stakeAmount, false))
        .to.be.revertedWith("Below minimum amount");
    });
  });

  describe("Rewards System", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.utils.parseEther("400");
      await hcfStaking.connect(user1).stake(0, stakeAmount, false);
    });

    it("Should calculate daily rewards correctly", async function () {
      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const pending = await hcfStaking.calculatePendingRewards(user1.address);
      const expected = ethers.utils.parseEther("400").mul(40).div(10000); // 400 * 0.4%
      
      expect(pending.toString()).to.equal(expected.toString());
    });

    it("Should apply LP multiplier", async function () {
      const stakeAmount = ethers.utils.parseEther("400");
      await hcfStaking.connect(user2).stake(0, stakeAmount, true);
      
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const pendingNormal = await hcfStaking.calculatePendingRewards(user1.address);
      const pendingLP = await hcfStaking.calculatePendingRewards(user2.address);
      
      expect(pendingLP).to.equal(pendingNormal.mul(2));
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update pool rates", async function () {
      const newMultiplier = 12000; // 120%
      
      await expect(hcfStaking.updatePoolRate(0, newMultiplier))
        .to.emit(hcfStaking, "PoolRateUpdated");

      const poolInfo = await hcfStaking.getPoolInfo(0);
      const expectedAdjusted = poolInfo.dailyRate.mul(newMultiplier).div(10000);
      expect(poolInfo.adjustedRate).to.equal(expectedAdjusted);
    });

    it("Should prevent non-owner admin actions", async function () {
      await expect(
        hcfStaking.connect(user1).updatePoolRate(0, 12000)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("Withdrawal Functions", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.utils.parseEther("400");
      await hcfStaking.connect(user1).stake(0, stakeAmount, false);
    });

    it("Should handle emergency withdrawal", async function () {
      const balanceBefore = await hcfToken.balanceOf(user1.address);
      
      await hcfStaking.connect(user1).emergencyWithdraw();
      
      const balanceAfter = await hcfToken.balanceOf(user1.address);
      const received = balanceAfter.sub(balanceBefore);
      
      // Emergency withdrawal: 50% penalty
      const expected = ethers.utils.parseEther("200");
      expect(received).to.equal(expected);
    });
  });

  describe("View Functions", function () {
    it("Should return correct total staked", async function () {
      await hcfStaking.connect(user1).stake(0, ethers.utils.parseEther("400"), false);
      await hcfStaking.connect(user2).stake(1, ethers.utils.parseEther("500"), false);
      
      const totalStaked = await hcfStaking.getTotalStaked();
      const expected = ethers.utils.parseEther("900");
      expect(totalStaked).to.equal(expected);
    });
  });
});