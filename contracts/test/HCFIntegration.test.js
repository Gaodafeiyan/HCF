const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Complete System Integration Tests", function () {
  let hcfToken, hcfStaking, hcfReferral;
  let owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10;
  let mockBSDT, mockUSDC, mockUSDT;
  let users = [];

  beforeEach(async function () {
    [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10] = await ethers.getSigners();
    users = [user1, user2, user3, user4, user5, user6, user7, user8, user9, user10];

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockBSDT = await MockToken.deploy("Mock BSDT", "BSDT", ethers.utils.parseEther("10000000"));
    mockUSDC = await MockToken.deploy("Mock USDC", "USDC", ethers.utils.parseEther("10000000"));
    mockUSDT = await MockToken.deploy("Mock USDT", "USDT", ethers.utils.parseEther("10000000"));

    // Deploy HCF Token
    const HCFToken = await ethers.getContractFactory("HCFToken");
    hcfToken = await HCFToken.deploy(
      mockBSDT.address,
      owner.address, // marketing wallet
      owner.address, // lp wallet
      owner.address  // node wallet
    );

    // Deploy HCF Staking
    const HCFStaking = await ethers.getContractFactory("HCFStaking");
    hcfStaking = await HCFStaking.deploy(
      hcfToken.address,
      mockBSDT.address,
      mockUSDC.address
    );

    // Deploy HCF Referral
    const HCFReferral = await ethers.getContractFactory("HCFReferral");
    hcfReferral = await HCFReferral.deploy(
      hcfToken.address,
      hcfStaking.address
    );

    // Setup system integration
    await hcfToken.enableTrading();
    await hcfToken.transferOwnership(hcfStaking.address);
    await hcfStaking.setReferralContract(hcfReferral.address);

    // Distribute initial tokens to all users
    const initialAmount = ethers.utils.parseEther("100000");
    for (let user of users) {
      await hcfToken.transfer(user.address, initialAmount);
      await mockBSDT.transfer(user.address, initialAmount);
      await mockUSDC.transfer(user.address, initialAmount);
      await mockUSDT.transfer(user.address, initialAmount);
    }

    // Give referral contract tokens for rewards
    await hcfToken.transfer(hcfReferral.address, ethers.utils.parseEther("500000"));
    await mockUSDC.transfer(hcfStaking.address, ethers.utils.parseEther("1000000"));
    await mockBSDT.transfer(hcfStaking.address, ethers.utils.parseEther("1000000"));
  });

  describe("Complete User Lifecycle Integration", function () {
    it("Should handle complete user journey: register → refer → stake → rank → bridge", async function () {
      console.log("=== Complete User Lifecycle Test ===");
      
      // Phase 1: User Registration and Activation
      console.log("\n📝 Phase 1: User Registration & Activation");
      
      // User1 (Root user) - no referrer
      await hcfToken.connect(user1).approve(hcfStaking.address, ethers.utils.parseEther("500"));
      await hcfStaking.connect(user1).stake(0, ethers.utils.parseEther("500"), false);
      await hcfReferral.connect(user1).activateUser();
      console.log(`✅ User1 activated (root user)`);
      
      // User2 referred by User1
      await hcfReferral.connect(user2).setReferrer(user1.address);
      await hcfToken.connect(user2).approve(hcfStaking.address, ethers.utils.parseEther("500"));
      await hcfStaking.connect(user2).stake(0, ethers.utils.parseEther("500"), false);
      await hcfReferral.connect(user2).activateUser();
      console.log(`✅ User2 activated (referred by User1)`);
      
      // User3 referred by User2
      await hcfReferral.connect(user3).setReferrer(user2.address);
      await hcfToken.connect(user3).approve(hcfStaking.address, ethers.utils.parseEther("500"));
      await hcfStaking.connect(user3).stake(0, ethers.utils.parseEther("500"), false);
      await hcfReferral.connect(user3).activateUser();
      console.log(`✅ User3 activated (referred by User2)`);
      
      // Phase 2: Staking and Rewards Accumulation
      console.log("\n🏊‍♂️ Phase 2: Staking & Rewards Accumulation");
      
      // Fast forward time to accumulate staking rewards
      await ethers.provider.send("evm_increaseTime", [86400 * 3]); // 3 days
      await ethers.provider.send("evm_mine");
      
      // Record initial balances before claiming
      const initialBalance1 = await hcfToken.balanceOf(user1.address);
      const initialBalance2 = await hcfToken.balanceOf(user2.address);
      const initialBalance3 = await hcfToken.balanceOf(user3.address);
      
      // Phase 3: Rewards Claiming (triggers referral distribution)
      console.log("\n💰 Phase 3: Rewards Claiming & Referral Distribution");
      
      await hcfStaking.connect(user3).claimRewards();
      
      const finalBalance1 = await hcfToken.balanceOf(user1.address);
      const finalBalance2 = await hcfToken.balanceOf(user2.address);
      const finalBalance3 = await hcfToken.balanceOf(user3.address);
      
      const reward1 = finalBalance1.sub(initialBalance1);
      const reward2 = finalBalance2.sub(initialBalance2);
      const reward3 = finalBalance3.sub(initialBalance3);
      
      console.log(`User1 referral reward: ${ethers.utils.formatEther(reward1)} HCF`);
      console.log(`User2 referral reward: ${ethers.utils.formatEther(reward2)} HCF`);
      console.log(`User3 staking reward: ${ethers.utils.formatEther(reward3)} HCF`);
      
      // Verify referral rewards were distributed
      expect(reward1).to.be.gt(0); // User1 should get level 2 referral reward
      expect(reward2).to.be.gt(0); // User2 should get level 1 referral reward
      expect(reward3).to.be.gt(0); // User3 should get their staking reward
      
      // Phase 4: Bridge Operations
      console.log("\n🌉 Phase 4: Bridge Operations");
      
      const bridgeAmount = ethers.utils.parseEther("100");
      const minUSDCOut = bridgeAmount.mul(99).div(100);
      
      await hcfToken.connect(user3).approve(hcfStaking.address, bridgeAmount);
      
      const initialUSDC = await mockUSDC.balanceOf(user3.address);
      await hcfStaking.connect(user3).withdrawToUSDC(bridgeAmount, minUSDCOut);
      const finalUSDC = await mockUSDC.balanceOf(user3.address);
      
      const bridgedAmount = finalUSDC.sub(initialUSDC);
      console.log(`Bridged: ${ethers.utils.formatEther(bridgeAmount)} HCF → ${ethers.utils.formatEther(bridgedAmount)} USDC`);
      
      expect(bridgedAmount).to.be.gte(minUSDCOut);
      
      // Phase 5: Verify Complete System State
      console.log("\n✅ Phase 5: System State Verification");
      
      // Check referral system state
      const user1Data = await hcfReferral.getUserData(user1.address);
      const user2Data = await hcfReferral.getUserData(user2.address);
      const user3Data = await hcfReferral.getUserData(user3.address);
      
      console.log(`User1: ${user1Data.directCount} direct referrals, ${ethers.utils.formatEther(user1Data.totalReferralReward)} total referral rewards`);
      console.log(`User2: ${user2Data.directCount} direct referrals, ${ethers.utils.formatEther(user2Data.totalReferralReward)} total referral rewards`);
      console.log(`User3: referrer = ${user3Data.referrer}`);
      
      expect(user1Data.directCount).to.equal(1);
      expect(user2Data.directCount).to.equal(1);
      expect(user3Data.referrer).to.equal(user2.address);
      
      console.log("\n🎉 Complete user lifecycle test successful!");
    });

    it("Should handle multiple users with complex referral network", async function () {
      console.log("=== Complex Referral Network Test ===");
      
      // Create a complex referral tree:
      //       user1
      //      /  |  \
      //   user2 user3 user4
      //    |     |
      //  user5 user6
      
      const stakeAmount = ethers.utils.parseEther("500");
      
      // Setup root user
      await hcfToken.connect(user1).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user1).stake(0, stakeAmount, false);
      await hcfReferral.connect(user1).activateUser();
      
      // Setup level 2 users
      for (let i = 2; i <= 4; i++) {
        const user = users[i-1];
        await hcfReferral.connect(user).setReferrer(user1.address);
        await hcfToken.connect(user).approve(hcfStaking.address, stakeAmount);
        await hcfStaking.connect(user).stake(0, stakeAmount, false);
        await hcfReferral.connect(user).activateUser();
      }
      
      // Setup level 3 users
      await hcfReferral.connect(user5).setReferrer(user2.address);
      await hcfToken.connect(user5).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user5).stake(0, stakeAmount, false);
      await hcfReferral.connect(user5).activateUser();
      
      await hcfReferral.connect(user6).setReferrer(user3.address);
      await hcfToken.connect(user6).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user6).stake(0, stakeAmount, false);
      await hcfReferral.connect(user6).activateUser();
      
      // Verify network structure
      const user1Data = await hcfReferral.getUserData(user1.address);
      const user2Data = await hcfReferral.getUserData(user2.address);
      const user3Data = await hcfReferral.getUserData(user3.address);
      
      expect(user1Data.directCount).to.equal(3); // user2, user3, user4
      expect(user2Data.directCount).to.equal(1); // user5
      expect(user3Data.directCount).to.equal(1); // user6
      
      console.log(`✅ Network structure verified: Root has ${user1Data.directCount} directs`);
      
      // Simulate rewards and verify multi-level distribution
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      const initialBalance1 = await hcfToken.balanceOf(user1.address);
      const initialBalance2 = await hcfToken.balanceOf(user2.address);
      const initialBalance3 = await hcfToken.balanceOf(user3.address);
      
      // User6 claims rewards (should benefit user3, user1)
      await hcfStaking.connect(user6).claimRewards();
      
      const finalBalance1 = await hcfToken.balanceOf(user1.address);
      const finalBalance2 = await hcfToken.balanceOf(user2.address);
      const finalBalance3 = await hcfToken.balanceOf(user3.address);
      
      const reward1 = finalBalance1.sub(initialBalance1);
      const reward2 = finalBalance2.sub(initialBalance2);
      const reward3 = finalBalance3.sub(initialBalance3);
      
      console.log(`User1 (level 2): ${ethers.utils.formatEther(reward1)} HCF`);
      console.log(`User2 (no relation): ${ethers.utils.formatEther(reward2)} HCF`);
      console.log(`User3 (level 1): ${ethers.utils.formatEther(reward3)} HCF`);
      
      expect(reward1).to.be.gt(0); // User1 gets level 2 reward
      expect(reward2).to.equal(0); // User2 has no relation to user6
      expect(reward3).to.be.gt(0); // User3 gets level 1 reward
      expect(reward3).to.be.gt(reward1); // Level 1 > Level 2
      
      console.log("🎯 Complex referral network test successful!");
    });
  });

  describe("Composite Rewards Calculation Integration", function () {
    it("Should apply referral + ranking + cycle bonuses correctly", async function () {
      console.log("=== Composite Rewards Calculation Test ===");
      
      // Setup users with different characteristics
      const stakeAmount = ethers.utils.parseEther("500");
      
      // User1: Root user (will get ranking bonus)
      await hcfToken.connect(user1).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user1).stake(0, stakeAmount, true); // LP staking for bonus
      await hcfReferral.connect(user1).activateUser();
      
      // User2: Referred user (will trigger referral rewards)
      await hcfReferral.connect(user2).setReferrer(user1.address);
      await hcfToken.connect(user2).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user2).stake(0, stakeAmount, false);
      await hcfReferral.connect(user2).activateUser();
      
      console.log("✅ Users setup with referral relationship");
      
      // Accumulate rewards over time to potentially trigger cycle
      let totalUser2Rewards = ethers.BigNumber.from(0);
      
      for (let day = 0; day < 10; day++) {
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
        await ethers.provider.send("evm_mine");
        
        const initialBalance1 = await hcfToken.balanceOf(user1.address);
        const initialBalance2 = await hcfToken.balanceOf(user2.address);
        
        // Claim rewards
        await hcfStaking.connect(user2).claimRewards();
        
        const finalBalance1 = await hcfToken.balanceOf(user1.address);
        const finalBalance2 = await hcfToken.balanceOf(user2.address);
        
        const dailyReward1 = finalBalance1.sub(initialBalance1);
        const dailyReward2 = finalBalance2.sub(initialBalance2);
        
        totalUser2Rewards = totalUser2Rewards.add(dailyReward2);
        
        if (day % 3 === 0) {
          console.log(`Day ${day + 1}: User1 referral reward: ${ethers.utils.formatEther(dailyReward1)} HCF, User2 staking: ${ethers.utils.formatEther(dailyReward2)} HCF`);
        }
        
        // Check if cycle threshold reached
        const user2Info = await hcfStaking.getUserInfo(user2.address);
        if (user2Info.cycleCount > 0) {
          console.log(`🔄 User2 completed cycle on day ${day + 1}!`);
          break;
        }
      }
      
      console.log(`📊 Total User2 rewards over period: ${ethers.utils.formatEther(totalUser2Rewards)} HCF`);
      
      // Verify composite effects
      const user1FinalData = await hcfReferral.getUserData(user1.address);
      const user2FinalInfo = await hcfStaking.getUserInfo(user2.address);
      
      console.log(`User1 total referral rewards: ${ethers.utils.formatEther(user1FinalData.totalReferralReward)} HCF`);
      console.log(`User2 cycle count: ${user2FinalInfo.cycleCount}`);
      console.log(`User2 total claimed: ${ethers.utils.formatEther(user2FinalInfo.totalClaimed)} HCF`);
      
      expect(user1FinalData.totalReferralReward).to.be.gt(0);
      expect(totalUser2Rewards).to.be.gt(0);
      
      console.log("🎯 Composite rewards calculation verified!");
    });

    it("Should demonstrate LP enhancement with referral rewards", async function () {
      console.log("=== LP Enhancement + Referral Integration Test ===");
      
      const stakeAmount = ethers.utils.parseEther("500");
      
      // User1: LP staking (gets 5x multiplier)
      await hcfToken.connect(user1).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user1).stake(0, stakeAmount, true); // LP = true
      await hcfReferral.connect(user1).activateUser();
      
      // User2: Regular staking, referred by LP user
      await hcfReferral.connect(user2).setReferrer(user1.address);
      await hcfToken.connect(user2).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user2).stake(0, stakeAmount, false); // LP = false
      await hcfReferral.connect(user2).activateUser();
      
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      const initialBalance1 = await hcfToken.balanceOf(user1.address);
      const initialBalance2 = await hcfToken.balanceOf(user2.address);
      
      // User1 claims (LP enhanced rewards + auto-compound)
      await hcfStaking.connect(user1).claimRewards();
      
      // User2 claims (triggers referral to User1)
      await hcfStaking.connect(user2).claimRewards();
      
      const finalBalance1 = await hcfToken.balanceOf(user1.address);
      const finalBalance2 = await hcfToken.balanceOf(user2.address);
      
      const reward1 = finalBalance1.sub(initialBalance1);
      const reward2 = finalBalance2.sub(initialBalance2);
      
      console.log(`LP User1 rewards: ${ethers.utils.formatEther(reward1)} HCF (includes LP bonus + referral)`);
      console.log(`Regular User2 rewards: ${ethers.utils.formatEther(reward2)} HCF`);
      
      // Verify LP user gets enhanced rewards plus referral rewards
      expect(reward1).to.be.gt(reward2); // LP user should get more
      
      const user1StakingInfo = await hcfStaking.getUserInfo(user1.address);
      console.log(`User1 is LP: ${user1StakingInfo.isLP}`);
      expect(user1StakingInfo.isLP).to.be.true;
      
      console.log("🎯 LP enhancement with referral integration verified!");
    });
  });

  describe("Cross-Contract Integration", function () {
    it("Should handle all contract interactions seamlessly", async function () {
      console.log("=== Cross-Contract Integration Test ===");
      
      // Test flow: HCFToken ↔ HCFStaking ↔ HCFReferral interactions
      const stakeAmount = ethers.utils.parseEther("500");
      
      // Phase 1: Token → Staking interaction
      console.log("\n📝 Phase 1: HCFToken → HCFStaking");
      
      const initialTokenBalance = await hcfToken.balanceOf(user1.address);
      await hcfToken.connect(user1).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user1).stake(0, stakeAmount, false);
      
      const afterStakeBalance = await hcfToken.balanceOf(user1.address);
      const stakedAmount = initialTokenBalance.sub(afterStakeBalance);
      
      console.log(`✅ Staked: ${ethers.utils.formatEther(stakedAmount)} HCF`);
      expect(stakedAmount).to.equal(stakeAmount);
      
      // Phase 2: Staking → Referral interaction
      console.log("\n🔗 Phase 2: HCFStaking → HCFReferral");
      
      await hcfReferral.connect(user1).activateUser();
      const user1Data = await hcfReferral.getUserData(user1.address);
      
      console.log(`✅ User activated in referral system: ${user1Data.isActive}`);
      expect(user1Data.isActive).to.be.true;
      
      // Phase 3: Setup referral chain for interaction test
      console.log("\n👥 Phase 3: Multi-Contract Interaction Setup");
      
      await hcfReferral.connect(user2).setReferrer(user1.address);
      await hcfToken.connect(user2).approve(hcfStaking.address, stakeAmount);
      await hcfStaking.connect(user2).stake(0, stakeAmount, false);
      await hcfReferral.connect(user2).activateUser();
      
      // Phase 4: Rewards flow across all contracts
      console.log("\n💰 Phase 4: Cross-Contract Rewards Flow");
      
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      const beforeClaimBalance1 = await hcfToken.balanceOf(user1.address);
      const beforeClaimBalance2 = await hcfToken.balanceOf(user2.address);
      
      // This should trigger: HCFStaking → HCFToken (mint) → HCFReferral (distribute)
      await hcfStaking.connect(user2).claimRewards();
      
      const afterClaimBalance1 = await hcfToken.balanceOf(user1.address);
      const afterClaimBalance2 = await hcfToken.balanceOf(user2.address);
      
      const referralReward = afterClaimBalance1.sub(beforeClaimBalance1);
      const stakingReward = afterClaimBalance2.sub(beforeClaimBalance2);
      
      console.log(`User1 referral reward: ${ethers.utils.formatEther(referralReward)} HCF`);
      console.log(`User2 staking reward: ${ethers.utils.formatEther(stakingReward)} HCF`);
      
      expect(referralReward).to.be.gt(0);
      expect(stakingReward).to.be.gt(0);
      
      // Phase 5: Bridge operation (Staking → Token → USDC)
      console.log("\n🌉 Phase 5: Bridge Cross-Contract Operation");
      
      const bridgeAmount = ethers.utils.parseEther("100");
      const minUSDCOut = bridgeAmount.mul(99).div(100);
      
      await hcfToken.connect(user2).approve(hcfStaking.address, bridgeAmount);
      
      const initialHCF = await hcfToken.balanceOf(user2.address);
      const initialUSDC = await mockUSDC.balanceOf(user2.address);
      
      await hcfStaking.connect(user2).withdrawToUSDC(bridgeAmount, minUSDCOut);
      
      const finalHCF = await hcfToken.balanceOf(user2.address);
      const finalUSDC = await mockUSDC.balanceOf(user2.address);
      
      const hcfUsed = initialHCF.sub(finalHCF);
      const usdcReceived = finalUSDC.sub(initialUSDC);
      
      console.log(`Bridge: ${ethers.utils.formatEther(hcfUsed)} HCF → ${ethers.utils.formatEther(usdcReceived)} USDC`);
      
      expect(hcfUsed).to.equal(bridgeAmount);
      expect(usdcReceived).to.be.gte(minUSDCOut);
      
      console.log("✅ All cross-contract interactions working seamlessly!");
    });

    it("Should maintain data consistency across contracts", async function () {
      console.log("=== Cross-Contract Data Consistency Test ===");
      
      const stakeAmount = ethers.utils.parseEther("500");
      
      // Setup multiple users and track data consistency
      for (let i = 0; i < 3; i++) {
        const user = users[i];
        await hcfToken.connect(user).approve(hcfStaking.address, stakeAmount);
        await hcfStaking.connect(user).stake(0, stakeAmount, false);
        await hcfReferral.connect(user).activateUser();
        
        if (i > 0) {
          await hcfReferral.connect(user).setReferrer(users[i-1].address);
        }
      }
      
      // Verify data consistency
      for (let i = 0; i < 3; i++) {
        const user = users[i];
        const stakingInfo = await hcfStaking.getUserInfo(user.address);
        const referralData = await hcfReferral.getUserData(user.address);
        const tokenBalance = await hcfToken.balanceOf(user.address);
        
        console.log(`User${i+1}:`);
        console.log(`  Staked: ${ethers.utils.formatEther(stakingInfo.amount)} HCF`);
        console.log(`  Referral Active: ${referralData.isActive}`);
        console.log(`  Token Balance: ${ethers.utils.formatEther(tokenBalance)} HCF`);
        
        expect(stakingInfo.amount).to.equal(stakeAmount);
        expect(referralData.isActive).to.be.true;
        expect(tokenBalance).to.be.gt(0);
      }
      
      // Test data updates across contracts
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      await hcfStaking.connect(user3).claimRewards();
      
      // Verify updates propagated correctly
      const user1ReferralData = await hcfReferral.getUserData(user1.address);
      const user2ReferralData = await hcfReferral.getUserData(user2.address);
      const user3StakingInfo = await hcfStaking.getUserInfo(user3.address);
      
      console.log("\nAfter reward claim:");
      console.log(`User1 total referral rewards: ${ethers.utils.formatEther(user1ReferralData.totalReferralReward)} HCF`);
      console.log(`User2 total referral rewards: ${ethers.utils.formatEther(user2ReferralData.totalReferralReward)} HCF`);
      console.log(`User3 total claimed: ${ethers.utils.formatEther(user3StakingInfo.totalClaimed)} HCF`);
      
      expect(user1ReferralData.totalReferralReward).to.be.gt(0);
      expect(user2ReferralData.totalReferralReward).to.be.gt(0);
      expect(user3StakingInfo.totalClaimed).to.be.gt(0);
      
      console.log("✅ Data consistency maintained across all contracts!");
    });
  });

  describe("System Stress Tests", function () {
    it("Should handle high-volume concurrent operations", async function () {
      console.log("=== High-Volume Concurrent Operations Test ===");
      
      const stakeAmount = ethers.utils.parseEther("500");
      const promises = [];
      
      console.log("🚀 Setting up 10 users concurrently...");
      
      // Concurrent user setup
      for (let i = 0; i < 10; i++) {
        const user = users[i];
        promises.push(
          hcfToken.connect(user).approve(hcfStaking.address, stakeAmount)
            .then(() => hcfStaking.connect(user).stake(0, stakeAmount, false))
            .then(() => hcfReferral.connect(user).activateUser())
        );
      }
      
      await Promise.all(promises);
      console.log("✅ All users activated concurrently");
      
      // Setup referral relationships
      for (let i = 1; i < 10; i++) {
        await hcfReferral.connect(users[i]).setReferrer(users[i-1].address);
      }
      
      console.log("✅ Referral chain established (10 levels deep)");
      
      // Concurrent reward claims
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      console.log("💰 Testing concurrent reward claims...");
      
      const claimPromises = [];
      for (let i = 0; i < 10; i++) {
        claimPromises.push(hcfStaking.connect(users[i]).claimRewards());
      }
      
      await Promise.all(claimPromises);
      console.log("✅ All concurrent claims processed successfully");
      
      // Verify system state after stress test
      let totalReferralRewards = ethers.BigNumber.from(0);
      let totalStakingRewards = ethers.BigNumber.from(0);
      
      for (let i = 0; i < 10; i++) {
        const referralData = await hcfReferral.getUserData(users[i].address);
        const stakingInfo = await hcfStaking.getUserInfo(users[i].address);
        
        totalReferralRewards = totalReferralRewards.add(referralData.totalReferralReward);
        totalStakingRewards = totalStakingRewards.add(stakingInfo.totalClaimed);
      }
      
      console.log(`📊 Total referral rewards distributed: ${ethers.utils.formatEther(totalReferralRewards)} HCF`);
      console.log(`📊 Total staking rewards claimed: ${ethers.utils.formatEther(totalStakingRewards)} HCF`);
      
      expect(totalReferralRewards).to.be.gt(0);
      expect(totalStakingRewards).to.be.gt(0);
      
      console.log("🎯 High-volume concurrent operations handled successfully!");
    });

    it("Should handle mixed operations under load", async function () {
      console.log("=== Mixed Operations Under Load Test ===");
      
      const stakeAmount = ethers.utils.parseEther("500");
      
      // Setup base users
      for (let i = 0; i < 5; i++) {
        const user = users[i];
        await hcfToken.connect(user).approve(hcfStaking.address, stakeAmount);
        await hcfStaking.connect(user).stake(0, stakeAmount, false);
        await hcfReferral.connect(user).activateUser();
        
        if (i > 0) {
          await hcfReferral.connect(user).setReferrer(users[i-1].address);
        }
      }
      
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine");
      
      console.log("🎭 Testing mixed operations concurrently...");
      
      const mixedOperations = [
        // Setup user6 with proper sequence
        (async () => {
          await hcfReferral.connect(user6).setReferrer(user1.address); // Set referrer first (user1 is already active)
          await hcfToken.connect(user6).approve(hcfStaking.address, stakeAmount);
          await hcfStaking.connect(user6).stake(0, stakeAmount, true); // LP staking
          await hcfReferral.connect(user6).activateUser(); // Activate after staking
        })(),
        
        // Reward claims
        hcfStaking.connect(user1).claimRewards(),
        hcfStaking.connect(user2).claimRewards(),
        hcfStaking.connect(user3).claimRewards(),
        
        // Bridge operations
        hcfToken.connect(user4).approve(hcfStaking.address, ethers.utils.parseEther("100"))
          .then(() => hcfStaking.connect(user4).withdrawToUSDC(
            ethers.utils.parseEther("100"), 
            ethers.utils.parseEther("99")
          )),
        
        // Additional staking
        hcfToken.connect(user5).approve(hcfStaking.address, stakeAmount)
          .then(() => hcfStaking.connect(user5).stake(0, stakeAmount, false))
      ];
      
      await Promise.all(mixedOperations);
      
      console.log("✅ All mixed operations completed successfully");
      
      // Verify system integrity after mixed load
      let totalUsers = 0;
      let totalStaked = ethers.BigNumber.from(0);
      let totalRewards = ethers.BigNumber.from(0);
      
      for (let i = 0; i < 6; i++) {
        const user = users[i];
        const stakingInfo = await hcfStaking.getUserInfo(user.address);
        const referralData = await hcfReferral.getUserData(user.address);
        
        if (stakingInfo.amount.gt(0)) {
          totalUsers++;
          totalStaked = totalStaked.add(stakingInfo.amount);
          totalRewards = totalRewards.add(referralData.totalReferralReward);
        }
      }
      
      console.log(`📊 Total active users: ${totalUsers}`);
      console.log(`📊 Total staked: ${ethers.utils.formatEther(totalStaked)} HCF`);
      console.log(`📊 Total referral rewards: ${ethers.utils.formatEther(totalRewards)} HCF`);
      
      expect(totalUsers).to.be.gte(6);
      expect(totalStaked).to.be.gt(0);
      
      console.log("🎯 Mixed operations under load handled successfully!");
    });
  });

  describe("Economic Model Integration", function () {
    it("Should demonstrate complete economic ecosystem", async function () {
      console.log("=== Complete Economic Ecosystem Test ===");
      
      const stakeAmount = ethers.utils.parseEther("500");
      
      // Setup diverse user ecosystem
      console.log("🏗️ Setting up economic ecosystem...");
      
      // Large staker (potential team leader) - use Pool 0 due to daily limits
      const largeStake = ethers.utils.parseEther("500"); // Reduce to fit daily limit
      await hcfToken.connect(user1).approve(hcfStaking.address, largeStake);
      await hcfStaking.connect(user1).stake(0, largeStake, true); // Pool 0, LP
      await hcfReferral.connect(user1).activateUser();
      
      // Medium stakers (active referrers)
      for (let i = 1; i < 5; i++) {
        const user = users[i];
        await hcfReferral.connect(user).setReferrer(user1.address);
        await hcfToken.connect(user).approve(hcfStaking.address, stakeAmount);
        await hcfStaking.connect(user).stake(0, stakeAmount, false);
        await hcfReferral.connect(user).activateUser();
      }
      
      // Small stakers (end users)
      for (let i = 5; i < 8; i++) {
        const user = users[i];
        await hcfReferral.connect(user).setReferrer(users[2].address); // Refer to user3
        await hcfToken.connect(user).approve(hcfStaking.address, stakeAmount);
        await hcfStaking.connect(user).stake(0, stakeAmount, false);
        await hcfReferral.connect(user).activateUser();
      }
      
      console.log("✅ Economic ecosystem established");
      console.log(`   - 1 LP staker (${ethers.utils.formatEther(largeStake)} HCF, LP)`);
      console.log(`   - 4 Medium stakers (${ethers.utils.formatEther(stakeAmount)} HCF each)`);
      console.log(`   - 3 Small stakers (${ethers.utils.formatEther(stakeAmount)} HCF each)`);
      
      // Run economic simulation
      console.log("\n💰 Running economic simulation over 7 days...");
      
      let totalBurned = ethers.BigNumber.from(0);
      let totalReferralRewards = ethers.BigNumber.from(0);
      let totalStakingRewards = ethers.BigNumber.from(0);
      
      const burnAddress = "0x000000000000000000000000000000000000dEaD";
      const initialBurnBalance = await hcfToken.balanceOf(burnAddress);
      
      for (let day = 1; day <= 7; day++) {
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
        await ethers.provider.send("evm_mine");
        
        // Random user activity simulation
        const activeUsers = users.slice(0, Math.floor(Math.random() * 8) + 3);
        
        for (let user of activeUsers) {
          try {
            await hcfStaking.connect(user).claimRewards();
          } catch (error) {
            // Skip if user has no rewards to claim
          }
        }
        
        if (day % 2 === 0) {
          console.log(`   Day ${day}: ${activeUsers.length} users claimed rewards`);
        }
      }
      
      const finalBurnBalance = await hcfToken.balanceOf(burnAddress);
      totalBurned = finalBurnBalance.sub(initialBurnBalance);
      
      // Calculate final ecosystem metrics
      let teamLeaderRewards = ethers.BigNumber.from(0);
      let mediumStakerRewards = ethers.BigNumber.from(0);
      let smallStakerRewards = ethers.BigNumber.from(0);
      
      const user1Data = await hcfReferral.getUserData(user1.address);
      teamLeaderRewards = user1Data.totalReferralReward.add(user1Data.totalTeamReward);
      
      for (let i = 1; i < 5; i++) {
        const userData = await hcfReferral.getUserData(users[i].address);
        mediumStakerRewards = mediumStakerRewards.add(userData.totalReferralReward);
      }
      
      for (let i = 5; i < 8; i++) {
        const stakingInfo = await hcfStaking.getUserInfo(users[i].address);
        smallStakerRewards = smallStakerRewards.add(stakingInfo.totalClaimed);
      }
      
      console.log("\n📊 Economic Ecosystem Results (7 days):");
      console.log(`Team Leader (User1): ${ethers.utils.formatEther(teamLeaderRewards)} HCF`);
      console.log(`Medium Stakers: ${ethers.utils.formatEther(mediumStakerRewards)} HCF total`);
      console.log(`Small Stakers: ${ethers.utils.formatEther(smallStakerRewards)} HCF total`);
      console.log(`Total Burned: ${ethers.utils.formatEther(totalBurned)} HCF`);
      
      // Economic health checks
      expect(teamLeaderRewards).to.be.gt(mediumStakerRewards.div(4)); // Team leader should earn well
      expect(mediumStakerRewards).to.be.gt(0); // Medium stakers get referral rewards
      expect(smallStakerRewards).to.be.gt(0); // Small stakers get basic staking rewards
      expect(totalBurned).to.be.gt(0); // Burn mechanism working
      
      console.log("✅ Economic ecosystem functioning correctly!");
      
      // Test economic sustainability
      const totalRewardsDistributed = teamLeaderRewards.add(mediumStakerRewards).add(smallStakerRewards);
      const burnRate = totalBurned.mul(10000).div(totalRewardsDistributed);
      
      console.log(`💡 Economic metrics:`);
      console.log(`   Total rewards distributed: ${ethers.utils.formatEther(totalRewardsDistributed)} HCF`);
      console.log(`   Burn rate: ${burnRate.div(100).toString()}% of total rewards`);
      console.log(`   Sustainability: ${totalBurned.gt(totalRewardsDistributed.div(10)) ? 'Good' : 'Monitor'}`);
      
      console.log("🎯 Complete economic ecosystem test successful!");
    });
  });
});