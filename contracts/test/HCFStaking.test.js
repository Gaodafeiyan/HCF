const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Staking Contract", function () {
  let hcfToken;
  let mockBSDT;
  let mockUSDC;
  let hcfStaking;
  let owner, marketing, lp, node, user1, user2, user3;

  const SECONDS_PER_DAY = 86400;
  const DAILY_LIMIT = ethers.utils.parseEther("500");

  beforeEach(async function () {
    [owner, marketing, lp, node, user1, user2, user3] = await ethers.getSigners();

    // Deploy Mock BSDT and USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockERC20.deploy("BSDT Token", "BSDT", ethers.utils.parseEther("1000000"));
    await mockBSDT.deployed();
    
    mockUSDC = await MockERC20.deploy("USDC Token", "USDC", ethers.utils.parseUnits("1000000", 6));
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

    // Setup: Enable trading, transfer tokens to users, give staking contract some USDC
    await hcfToken.enableTrading();
    await hcfToken.transfer(user1.address, ethers.utils.parseEther("100000"));
    await hcfToken.transfer(user2.address, ethers.utils.parseEther("100000"));
    await hcfToken.transfer(user3.address, ethers.utils.parseEther("100000"));
    
    await mockUSDC.transfer(hcfStaking.address, ethers.utils.parseUnits("100000", 6));

    // Approve staking contract to spend user tokens
    await hcfToken.connect(user1).approve(hcfStaking.address, ethers.utils.parseEther("100000"));
    await hcfToken.connect(user2).approve(hcfStaking.address, ethers.utils.parseEther("100000"));
    await hcfToken.connect(user3).approve(hcfStaking.address, ethers.utils.parseEther("100000"));
  });

  describe("Pool Configuration", function () {
    it("Should initialize 5 pools with correct rates", async function () {
      const expectedRates = [40, 80, 120, 140, 160]; // 0.4%, 0.8%, 1.2%, 1.4%, 1.6%
      for (let i = 0; i < 5; i++) {
        const poolInfo = await hcfStaking.getPoolInfo(i);
        expect(poolInfo.active).to.be.true;
        expect(poolInfo.dailyRate).to.equal(expectedRates[i]);
      }
    });

    it("Should have correct minimum and maximum amounts for each pool", async function () {
      const expectedMins = [100, 1000, 5000, 10000, 50000];
      const expectedMaxs = [1000, 5000, 10000, 50000, ethers.constants.MaxUint256];
      
      for (let i = 0; i < 5; i++) {
        const poolInfo = await hcfStaking.getPoolInfo(i);
        expect(poolInfo.minAmount.toString()).to.equal(ethers.utils.parseEther(expectedMins[i].toString()).toString());
        if (i < 4) {
          expect(poolInfo.maxAmount.toString()).to.equal(ethers.utils.parseEther(expectedMaxs[i].toString()).toString());
        }
      }
    });
  });

  describe("Basic Staking Functions", function () {
    it("Should allow staking in valid pool with correct amount", async function () {
      const stakeAmount = ethers.utils.parseEther("400"); // Under daily limit
      const poolId = 0; // Pool 0: 100-1000 HCF, 0.4% daily

      await expect(hcfStaking.connect(user1).stake(poolId, stakeAmount, false))
        .to.emit(hcfStaking, "Staked")
        .withArgs(user1.address, poolId, stakeAmount, false);

      const userInfo = await hcfStaking.getUserInfo(user1.address);
      expect(userInfo.amount).to.equal(stakeAmount);
      expect(userInfo.poolId).to.equal(poolId);
    });

    it("Should prevent staking below minimum amount", async function () {
      const stakeAmount = ethers.utils.parseEther("50"); // Below pool 0 minimum
      
      await expect(hcfStaking.connect(user1).stake(0, stakeAmount, false))
        .to.be.revertedWith("Below minimum amount");
    });

    it("Should prevent staking above maximum amount", async function () {
      const stakeAmount = ethers.utils.parseEther("2000"); // Above pool 0 maximum
      
      await expect(hcfStaking.connect(user1).stake(0, stakeAmount, false))
        .to.be.revertedWith("Above maximum amount");
    });

    it("Should enforce daily purchase limits", async function () {
      const dailyLimit = ethers.utils.parseEther("500");
      const excessAmount = ethers.utils.parseEther("600");
      
      await expect(hcfStaking.connect(user1).stake(1, excessAmount, false))
        .to.be.revertedWith("Exceeds daily limit");
      
      // Should succeed with amount at limit
      await hcfStaking.connect(user1).stake(1, dailyLimit, false);
    });
  });

  describe("Rewards Calculation", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.utils.parseEther("400");
      await hcfStaking.connect(user1).stake(1, stakeAmount, false); // Pool 1, 0.8% daily
    });

    it("Should calculate correct daily rewards", async function () {
      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const pendingRewards = await hcfStaking.calculatePendingRewards(user1.address);
      const expectedDaily = ethers.utils.parseEther("400").mul(80).div(10000); // 400 * 0.8%
      
      expect(pendingRewards.toString()).to.equal(expectedDaily.toString());
    });

    it("Should apply LP multiplier (2x) correctly", async function () {
      const stakeAmount = ethers.utils.parseEther("400");
      await hcfStaking.connect(user2).stake(1, stakeAmount, true); // LP staking
      
      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const pendingNormal = await hcfStaking.calculatePendingRewards(user1.address);
      const pendingLP = await hcfStaking.calculatePendingRewards(user2.address);
      
      expect(pendingLP).to.equal(pendingNormal.mul(2)); // LP should get 2x rewards
    });

    it("Should apply backend rate adjustments", async function () {
      // Owner adjusts pool 1 rate to 150% (15000 basis points)
      await hcfStaking.updatePoolRate(1, 15000);
      
      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const pendingRewards = await hcfStaking.calculatePendingRewards(user1.address);
      const expectedAdjusted = ethers.utils.parseEther("400").mul(80).mul(15000).div(100000000); // 1.5x multiplier
      
      expect(pendingRewards.toString()).to.equal(expectedAdjusted.toString());
    });
  });

  describe("Dual Cycle System", function () {
    it("Should track cycle completion correctly", async function () {
      const stakeAmount = ethers.utils.parseEther("500"); // Max daily limit
      await hcfStaking.connect(user1).stake(4, stakeAmount, false); // Highest pool
      
      // Fast forward enough time to accumulate 10k+ HCF in rewards
      const daysNeeded = 13; // Approximately 13 days at 1.6% daily on 50k = ~10k
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY * daysNeeded]);
      await ethers.provider.send("evm_mine");

      await expect(hcfStaking.connect(user1).claimRewards())
        .to.emit(hcfStaking, "CycleCompleted");

      const userInfo = await hcfStaking.getUserInfo(user1.address);
      expect(userInfo.cycleCount).to.equal(1);
    });

    it("Should apply 5x multiplier after cycle completion", async function () {
      // Setup user with completed cycle
      const stakeAmount = ethers.utils.parseEther("50000");
      await hcfStaking.connect(user1).stake(4, stakeAmount, false);
      
      // Force cycle completion by directly manipulating (in real scenario, this happens through rewards)
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY * 13]);
      await ethers.provider.send("evm_mine");
      await hcfStaking.connect(user1).claimRewards(); // Complete cycle

      // Reset claim time and calculate new rewards
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");
      
      const pendingWithBonus = await hcfStaking.calculatePendingRewards(user1.address);
      
      // Should be significantly higher due to 5x multiplier
      const baseDaily = stakeAmount.mul(160).div(10000); // 1.6% daily
      const expectedWithBonus = baseDaily.mul(5); // 5x multiplier
      
      expect(pendingWithBonus.toString()).to.equal(expectedWithBonus.toString());
    });
  });

  describe("LP Auto-Compound", function () {
    it("Should auto-compound LP stakes", async function () {
      const stakeAmount = ethers.utils.parseEther("1000");
      await hcfStaking.connect(user1).stake(1, stakeAmount, true); // LP staking
      
      // Fast forward to generate rewards
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const userInfoBefore = await hcfStaking.getUserInfo(user1.address);
      
      // Trigger auto-compound by making another stake (in real scenario, this happens automatically)
      await hcfStaking.connect(user1).stake(1, ethers.utils.parseEther("100"), true);
      
      const userInfoAfter = await hcfStaking.getUserInfo(user1.address);
      
      // Amount should have increased beyond just the new deposit due to compounding
      expect(userInfoAfter.amount.gt(userInfoBefore.amount.add(ethers.utils.parseEther("100")))).to.be.true;
    });
  });

  describe("Withdrawal and Penalties", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.utils.parseEther("1000");
      await hcfStaking.connect(user1).stake(1, stakeAmount, false);
    });

    it("Should apply correct penalties on unstaking", async function () {
      const unstakeAmount = ethers.utils.parseEther("500");
      const user1BalanceBefore = await hcfToken.balanceOf(user1.address);
      
      await expect(hcfStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(hcfStaking, "Unstaked");

      const user1BalanceAfter = await hcfToken.balanceOf(user1.address);
      const received = user1BalanceAfter.sub(user1BalanceBefore);
      
      // Should receive less due to penalties (10% BNB + 30% burn = 40% penalty)
      const expectedReceived = unstakeAmount.mul(60).div(100); // 60% after penalties
      expect(received.toString()).to.equal(expectedReceived.toString());
    });

    it("Should handle emergency withdrawal with higher penalty", async function () {
      const user1BalanceBefore = await hcfToken.balanceOf(user1.address);
      
      await hcfStaking.connect(user1).emergencyWithdraw();
      
      const user1BalanceAfter = await hcfToken.balanceOf(user1.address);
      const received = user1BalanceAfter.sub(user1BalanceBefore);
      
      // Emergency withdrawal has 50% penalty
      const expectedReceived = ethers.utils.parseEther("500"); // 50% of 1000
      expect(received.toString()).to.equal(expectedReceived.toString());
      
      // User should have no more staked amount
      const userInfo = await hcfStaking.getUserInfo(user1.address);
      expect(userInfo.amount).to.equal(0);
    });
  });

  describe("USDC Withdrawal with Slippage", function () {
    beforeEach(async function () {
      await hcfToken.connect(user1).approve(hcfStaking.address, ethers.utils.parseEther("1000"));
    });

    it("Should allow HCF to USDC withdrawal with correct slippage", async function () {
      const hcfAmount = ethers.utils.parseEther("1000");
      const expectedUSDC = hcfAmount.mul(99).div(100); // 0.99 slippage rate
      const minUSDCOut = expectedUSDC.sub(ethers.utils.parseEther("1")); // Allow some tolerance
      
      const user1USDCBefore = await mockUSDC.balanceOf(user1.address);
      
      await hcfStaking.connect(user1).withdrawToUSDC(hcfAmount, minUSDCOut);
      
      const user1USDCAfter = await mockUSDC.balanceOf(user1.address);
      const received = user1USDCAfter.sub(user1USDCBefore);
      
      expect(received).to.be.gte(minUSDCOut);
      expect(received).to.be.lte(expectedUSDC);
    });

    it("Should reject withdrawal if slippage too high", async function () {
      const hcfAmount = ethers.utils.parseEther("1000");
      const tooHighMinOut = hcfAmount; // Expecting 1:1 ratio, but slippage gives 0.99
      
      await expect(
        hcfStaking.connect(user1).withdrawToUSDC(hcfAmount, tooHighMinOut)
      ).to.be.revertedWith("Slippage too high");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update pool rates", async function () {
      const newRateMultiplier = 12000; // 120%
      
      await expect(hcfStaking.updatePoolRate(1, newRateMultiplier))
        .to.emit(hcfStaking, "PoolRateUpdated")
        .withArgs(1, newRateMultiplier);

      const poolInfo = await hcfStaking.getPoolInfo(1);
      expect(poolInfo.adjustedRate).to.equal(poolInfo.dailyRate.mul(newRateMultiplier).div(10000));
    });

    it("Should allow owner to enable/disable pools", async function () {
      await hcfStaking.setPoolActive(2, false);
      
      const poolInfo = await hcfStaking.getPoolInfo(2);
      expect(poolInfo.active).to.be.false;
      
      // Should prevent staking in disabled pool
      await expect(
        hcfStaking.connect(user1).stake(2, ethers.utils.parseEther("5000"), false)
      ).to.be.revertedWith("Pool not active");
    });

    it("Should allow owner to pause staking", async function () {
      await hcfStaking.setStakingEnabled(false);
      
      await expect(
        hcfStaking.connect(user1).stake(1, ethers.utils.parseEther("1000"), false)
      ).to.be.revertedWith("Staking disabled");
    });

    it("Should prevent non-owner from admin functions", async function () {
      await expect(
        hcfStaking.connect(user1).updatePoolRate(1, 12000)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions and Statistics", function () {
    beforeEach(async function () {
      await hcfStaking.connect(user1).stake(1, ethers.utils.parseEther("1000"), false);
      await hcfStaking.connect(user2).stake(2, ethers.utils.parseEther("5000"), true);
    });

    it("Should return correct user info", async function () {
      const userInfo1 = await hcfStaking.getUserInfo(user1.address);
      expect(userInfo1.amount).to.equal(ethers.utils.parseEther("1000"));
      expect(userInfo1.poolId).to.equal(1);
      expect(userInfo1.isLP).to.be.false;

      const userInfo2 = await hcfStaking.getUserInfo(user2.address);
      expect(userInfo2.amount).to.equal(ethers.utils.parseEther("5000"));
      expect(userInfo2.poolId).to.equal(2);
      expect(userInfo2.isLP).to.be.true;
    });

    it("Should calculate total staked across all pools", async function () {
      const totalStaked = await hcfStaking.getTotalStaked();
      const expectedTotal = ethers.utils.parseEther("6000"); // 1000 + 5000
      
      expect(totalStaked).to.equal(expectedTotal);
    });

    it("Should return accurate pool information", async function () {
      const poolInfo = await hcfStaking.getPoolInfo(1);
      expect(poolInfo.dailyRate).to.equal(80); // 0.8%
      expect(poolInfo.totalStaked).to.equal(ethers.utils.parseEther("1000"));
      expect(poolInfo.active).to.be.true;
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should handle zero amount staking rejection", async function () {
      await expect(
        hcfStaking.connect(user1).stake(1, 0, false)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should handle insufficient balance gracefully", async function () {
      const userBalance = await hcfToken.balanceOf(user3.address);
      const excessiveAmount = userBalance.add(ethers.utils.parseEther("1"));
      
      await expect(
        hcfStaking.connect(user3).stake(4, excessiveAmount, false)
      ).to.be.revertedWith("Transfer failed");
    });

    it("Should prevent unstaking more than staked amount", async function () {
      await hcfStaking.connect(user1).stake(1, ethers.utils.parseEther("1000"), false);
      
      await expect(
        hcfStaking.connect(user1).unstake(ethers.utils.parseEther("2000"))
      ).to.be.revertedWith("Insufficient staked amount");
    });
  });
});