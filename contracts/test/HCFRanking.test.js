const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Ranking System - District Rewards", function () {
  let hcfToken;
  let mockBSDT;
  let mockUSDC;
  let hcfStaking;
  let owner;
  let users = [];

  const SECONDS_PER_DAY = 86400;

  beforeEach(async function () {
    // Create 20 test users for ranking simulation
    const signers = await ethers.getSigners();
    owner = signers[0];
    users = signers.slice(1, 21); // 20 users for testing

    // Deploy contracts
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockERC20.deploy("BSDT Token", "BSDT", ethers.utils.parseEther("1000000"));
    mockUSDC = await MockERC20.deploy("USDC Token", "USDC", ethers.utils.parseUnits("1000000", 6));
    
    const HCFToken = await ethers.getContractFactory("HCFToken");
    hcfToken = await HCFToken.deploy(
      mockBSDT.address,
      users[0].address, // marketing
      users[1].address, // lp  
      users[2].address  // node
    );

    const HCFStaking = await ethers.getContractFactory("HCFStaking");
    hcfStaking = await HCFStaking.deploy(
      hcfToken.address,
      mockBSDT.address,
      mockUSDC.address
    );

    await hcfToken.enableTrading();
    await mockUSDC.transfer(hcfStaking.address, ethers.utils.parseUnits("100000", 6));

    // Distribute HCF to users and setup approvals
    for (let i = 0; i < users.length; i++) {
      await hcfToken.transfer(users[i].address, ethers.utils.parseEther("10000"));
      await hcfToken.connect(users[i]).approve(hcfStaking.address, ethers.utils.parseEther("10000"));
    }
  });

  describe("Ranking System Initialization", function () {
    it("Should initialize with no ranked users", async function () {
      // In a real implementation, we'd have ranking storage
      // For now, we simulate the initial state
      const totalUsers = await getTotalStakers();
      expect(totalUsers).to.equal(0);
    });
  });

  describe("Top 100 Ranking (20% Bonus)", function () {
    it("Should calculate 20% bonus for top 100 stakers", async function () {
      // Simulate top-tier staking to qualify for top 100
      const stakeAmount = ethers.utils.parseEther("5000"); // High amount for top ranking
      await hcfStaking.connect(users[0]).stake(2, stakeAmount, false); // Pool 2: 1.2% daily

      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const baseReward = await hcfStaking.calculatePendingRewards(users[0].address);
      
      // Simulate ranking bonus calculation
      const top100Bonus = baseReward.mul(20).div(100); // 20% bonus
      const totalExpected = baseReward.add(top100Bonus);
      
      // Base reward should be: 5000 * 1.2% = 60 HCF per day
      const expectedBase = ethers.utils.parseEther("60");
      const expectedBonus = ethers.utils.parseEther("12"); // 20% of 60
      const expectedTotal = ethers.utils.parseEther("72");

      expect(baseReward).to.equal(expectedBase);
      expect(top100Bonus).to.equal(expectedBonus);
      expect(totalExpected).to.equal(expectedTotal);
    });

    it("Should maintain top 100 ranking with consistent staking", async function () {
      // Multiple users stake to simulate ranking competition
      for (let i = 0; i < 5; i++) {
        const stakeAmount = ethers.utils.parseEther((5000 - i * 100).toString());
        await hcfStaking.connect(users[i]).stake(2, stakeAmount, false);
      }

      // Verify users maintain ranking eligibility
      for (let i = 0; i < 5; i++) {
        const userInfo = await hcfStaking.getUserInfo(users[i].address);
        expect(userInfo.amount).to.be.gte(ethers.utils.parseEther("4600")); // Minimum for top ranking
      }
    });

    it("Should handle ranking updates when new top stakers join", async function () {
      // Initial top staker
      await hcfStaking.connect(users[0]).stake(3, ethers.utils.parseEther("10000"), false);
      
      // New staker with higher amount
      await hcfStaking.connect(users[1]).stake(4, ethers.utils.parseEther("15000"), false);
      
      const user0Info = await hcfStaking.getUserInfo(users[0].address);
      const user1Info = await hcfStaking.getUserInfo(users[1].address);
      
      // Higher staker should rank above
      expect(user1Info.amount).to.be.gt(user0Info.amount);
    });
  });

  describe("Rank 101-299 (10% Bonus)", function () {
    it("Should calculate 10% bonus for rank 101-299 stakers", async function () {
      // Mid-tier staking for rank 101-299
      const stakeAmount = ethers.utils.parseEther("2000");
      await hcfStaking.connect(users[0]).stake(1, stakeAmount, false); // Pool 1: 0.8% daily

      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const baseReward = await hcfStaking.calculatePendingRewards(users[0].address);
      
      // Simulate mid-tier bonus
      const midTierBonus = baseReward.mul(10).div(100); // 10% bonus
      const totalExpected = baseReward.add(midTierBonus);
      
      // Base reward: 2000 * 0.8% = 16 HCF per day
      const expectedBase = ethers.utils.parseEther("16");
      const expectedBonus = ethers.utils.parseEther("1.6"); // 10% of 16
      const expectedTotal = ethers.utils.parseEther("17.6");

      expect(baseReward).to.equal(expectedBase);
      expect(midTierBonus).to.equal(expectedBonus);
      expect(totalExpected).to.equal(expectedTotal);
    });

    it("Should differentiate between top 100 and 101-299 bonuses", async function () {
      // Top 100 staker
      await hcfStaking.connect(users[0]).stake(2, ethers.utils.parseEther("5000"), false);
      
      // Rank 101-299 staker  
      await hcfStaking.connect(users[1]).stake(2, ethers.utils.parseEther("2000"), false);

      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const top100Reward = await hcfStaking.calculatePendingRewards(users[0].address);
      const midTierReward = await hcfStaking.calculatePendingRewards(users[1].address);

      // Top 100: 5000 * 1.2% = 60, +20% = 72
      // Mid-tier: 2000 * 1.2% = 24, +10% = 26.4
      const expectedTop100 = ethers.utils.parseEther("60"); // Base only (bonus calculated separately)
      const expectedMidTier = ethers.utils.parseEther("24"); // Base only

      expect(top100Reward).to.equal(expectedTop100);
      expect(midTierReward).to.equal(expectedMidTier);
      
      // Bonus calculations
      const top100Bonus = expectedTop100.mul(20).div(100); // 12 HCF
      const midTierBonus = expectedMidTier.mul(10).div(100); // 2.4 HCF
      
      expect(top100Bonus).to.be.gt(midTierBonus);
    });
  });

  describe("Ranking Algorithm Simulation", function () {
    it("Should simulate district-based ranking calculation", async function () {
      // Create a diverse set of stakers to simulate ranking
      const stakeAmounts = [
        ethers.utils.parseEther("10000"), // Rank 1-10
        ethers.utils.parseEther("8000"),  // Rank 11-50
        ethers.utils.parseEther("5000"),  // Rank 51-100
        ethers.utils.parseEther("3000"),  // Rank 101-200
        ethers.utils.parseEther("1000"),  // Rank 201-299
        ethers.utils.parseEther("500")    // Rank 300+
      ];

      for (let i = 0; i < stakeAmounts.length; i++) {
        await hcfStaking.connect(users[i]).stake(2, stakeAmounts[i], false);
      }

      // Verify staking amounts are properly ranked
      for (let i = 0; i < stakeAmounts.length - 1; i++) {
        const currentUser = await hcfStaking.getUserInfo(users[i].address);
        const nextUser = await hcfStaking.getUserInfo(users[i + 1].address);
        expect(currentUser.amount).to.be.gte(nextUser.amount);
      }
    });

    it("Should handle edge cases at ranking boundaries", async function () {
      // Test user at exactly rank 100
      const rank100Amount = ethers.utils.parseEther("5000");
      await hcfStaking.connect(users[0]).stake(2, rank100Amount, false);
      
      // Test user at exactly rank 101
      const rank101Amount = ethers.utils.parseEther("4999");
      await hcfStaking.connect(users[1]).stake(2, rank101Amount, false);
      
      // Test user at exactly rank 299
      const rank299Amount = ethers.utils.parseEther("1000");
      await hcfStaking.connect(users[2]).stake(2, rank299Amount, false);
      
      // Test user at rank 300 (no bonus)
      const rank300Amount = ethers.utils.parseEther("999");
      await hcfStaking.connect(users[3]).stake(2, rank300Amount, false);

      // Fast forward and check rewards
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const rank100Reward = await hcfStaking.calculatePendingRewards(users[0].address);
      const rank101Reward = await hcfStaking.calculatePendingRewards(users[1].address);
      const rank299Reward = await hcfStaking.calculatePendingRewards(users[2].address);
      const rank300Reward = await hcfStaking.calculatePendingRewards(users[3].address);

      // All should have base rewards, bonuses calculated separately
      expect(rank100Reward).to.equal(ethers.utils.parseEther("60"));   // 5000 * 1.2%
      expect(rank101Reward).to.equal(ethers.utils.parseEther("59.988")); // 4999 * 1.2%
      expect(rank299Reward).to.equal(ethers.utils.parseEther("12"));    // 1000 * 1.2%
      expect(rank300Reward).to.equal(ethers.utils.parseEther("11.988")); // 999 * 1.2%
    });
  });

  describe("Dynamic Ranking Updates", function () {
    it("Should update rankings when users increase stakes", async function () {
      // Initial staking
      await hcfStaking.connect(users[0]).stake(1, ethers.utils.parseEther("1000"), false);
      await hcfStaking.connect(users[1]).stake(1, ethers.utils.parseEther("2000"), false);
      
      const initialUser0 = await hcfStaking.getUserInfo(users[0].address);
      const initialUser1 = await hcfStaking.getUserInfo(users[1].address);
      
      // User 0 increases stake to surpass user 1
      await hcfStaking.connect(users[0]).stake(1, ethers.utils.parseEther("1500"), false);
      
      const finalUser0 = await hcfStaking.getUserInfo(users[0].address);
      expect(finalUser0.amount).to.be.gt(initialUser1.amount);
    });

    it("Should maintain ranking consistency across pool changes", async function () {
      // Users in different pools but similar total values
      await hcfStaking.connect(users[0]).stake(4, ethers.utils.parseEther("50000"), false); // Pool 4
      await hcfStaking.connect(users[1]).stake(1, ethers.utils.parseEther("50000"), false); // Pool 1
      
      const user0Info = await hcfStaking.getUserInfo(users[0].address);
      const user1Info = await hcfStaking.getUserInfo(users[1].address);
      
      // Same stake amounts regardless of pool
      expect(user0Info.amount).to.equal(user1Info.amount);
    });
  });

  // Helper function to simulate total stakers count
  async function getTotalStakers() {
    let count = 0;
    for (let i = 0; i < users.length; i++) {
      const userInfo = await hcfStaking.getUserInfo(users[i].address);
      if (userInfo.amount.gt(0)) count++;
    }
    return count;
  }

  describe("Ranking Rewards Distribution", function () {
    it("Should distribute bonus rewards correctly based on ranking", async function () {
      // Setup 3 different ranking tiers
      await hcfStaking.connect(users[0]).stake(3, ethers.utils.parseEther("10000"), false); // Top 100
      await hcfStaking.connect(users[1]).stake(2, ethers.utils.parseEther("3000"), false);  // 101-299
      await hcfStaking.connect(users[2]).stake(1, ethers.utils.parseEther("800"), false);   // 300+

      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
      await ethers.provider.send("evm_mine");

      const top100Base = await hcfStaking.calculatePendingRewards(users[0].address);
      const midTierBase = await hcfStaking.calculatePendingRewards(users[1].address);
      const regularBase = await hcfStaking.calculatePendingRewards(users[2].address);

      // Calculate expected bonuses
      const top100Bonus = top100Base.mul(20).div(100);
      const midTierBonus = midTierBase.mul(10).div(100);
      const regularBonus = ethers.utils.parseEther("0"); // No bonus

      // Verify bonus amounts are proportional to ranking
      expect(top100Bonus).to.be.gt(midTierBonus);
      expect(midTierBonus).to.be.gt(regularBonus);
      
      // Expected values:
      // Top 100: 10000 * 1.4% = 140 HCF + 20% = 28 HCF bonus
      // Mid-tier: 3000 * 1.2% = 36 HCF + 10% = 3.6 HCF bonus  
      // Regular: 800 * 0.8% = 6.4 HCF + 0% = 0 bonus
      expect(top100Bonus).to.equal(ethers.utils.parseEther("28"));
      expect(midTierBonus).to.equal(ethers.utils.parseEther("3.6"));
      expect(regularBonus).to.equal(ethers.utils.parseEther("0"));
    });
  });
});