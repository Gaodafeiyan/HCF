const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HCF Token Advanced Tests", function () {
  let hcfToken;
  let mockBSDT;
  let owner, marketing, lp, node, user1, user2, dexPair;

  beforeEach(async function () {
    [owner, marketing, lp, node, user1, user2, dexPair] = await ethers.getSigners();

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

  describe("Tax Fee Advanced Testing", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      await hcfToken.setDEXPair(dexPair.address, true);
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    });

    it("Should apply different tax rates for buy/sell/transfer", async function () {
      const amount = ethers.utils.parseEther("1000");

      // Test transfer tax (1%)
      const user2BalanceBefore = await hcfToken.balanceOf(user2.address);
      await hcfToken.connect(user1).transfer(user2.address, amount);
      const user2BalanceAfter = await hcfToken.balanceOf(user2.address);
      const transferReceived = user2BalanceAfter.sub(user2BalanceBefore);
      expect(transferReceived).to.equal(amount.mul(99).div(100)); // 1% tax

      // Test sell tax (5%) - transfer to DEX
      const dexBalanceBefore = await hcfToken.balanceOf(dexPair.address);
      await hcfToken.connect(user1).transfer(dexPair.address, amount);
      const dexBalanceAfter = await hcfToken.balanceOf(dexPair.address);
      const sellReceived = dexBalanceAfter.sub(dexBalanceBefore);
      expect(sellReceived).to.equal(amount.mul(95).div(100)); // 5% tax

      // Test buy tax (2%) - transfer from DEX
      await hcfToken.transfer(dexPair.address, amount);
      const user1BalanceBefore = await hcfToken.balanceOf(user1.address);
      await hcfToken.connect(dexPair).transfer(user1.address, amount);
      const user1BalanceAfter = await hcfToken.balanceOf(user1.address);
      const buyReceived = user1BalanceAfter.sub(user1BalanceBefore);
      expect(buyReceived).to.equal(amount.mul(98).div(100)); // 2% tax
    });

    it("Should properly distribute taxes to all recipients", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      
      // Get initial balances
      const deadBalanceBefore = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const marketingBalanceBefore = await hcfToken.balanceOf(marketing.address);
      const lpBalanceBefore = await hcfToken.balanceOf(lp.address);
      const nodeBalanceBefore = await hcfToken.balanceOf(node.address);

      // Execute transfer with 1% tax
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);

      // Get final balances
      const deadBalanceAfter = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const marketingBalanceAfter = await hcfToken.balanceOf(marketing.address);
      const lpBalanceAfter = await hcfToken.balanceOf(lp.address);
      const nodeBalanceAfter = await hcfToken.balanceOf(node.address);

      // Calculate expected distributions
      const totalTax = transferAmount.mul(1).div(100); // 1%
      const expectedBurn = totalTax.mul(40).div(100);  // 40%
      const expectedMarketing = totalTax.mul(30).div(100); // 30%
      const expectedLp = totalTax.mul(20).div(100);    // 20%
      const expectedNode = totalTax.mul(10).div(100);  // 10%

      expect(deadBalanceAfter.sub(deadBalanceBefore)).to.equal(expectedBurn);
      expect(marketingBalanceAfter.sub(marketingBalanceBefore)).to.equal(expectedMarketing);
      expect(lpBalanceAfter.sub(lpBalanceBefore)).to.equal(expectedLp);
      expect(nodeBalanceAfter.sub(nodeBalanceBefore)).to.equal(expectedNode);
    });

    it("Should handle tax distribution changes correctly", async function () {
      // Change tax distribution to 50% burn, 30% marketing, 20% LP, 0% node
      await hcfToken.setTaxDistribution(5000, 3000, 2000, 0);
      
      const transferAmount = ethers.utils.parseEther("1000");
      const deadBalanceBefore = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const marketingBalanceBefore = await hcfToken.balanceOf(marketing.address);
      
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);
      
      const deadBalanceAfter = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const marketingBalanceAfter = await hcfToken.balanceOf(marketing.address);
      
      const totalTax = transferAmount.mul(1).div(100);
      const expectedBurn = totalTax.mul(50).div(100);
      const expectedMarketing = totalTax.mul(30).div(100);
      
      expect(deadBalanceAfter.sub(deadBalanceBefore)).to.equal(expectedBurn);
      expect(marketingBalanceAfter.sub(marketingBalanceBefore)).to.equal(expectedMarketing);
    });
  });

  describe("Token Burn and Supply Monitoring", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    });

    it("Should track total burned tokens through transfers", async function () {
      const initialSupply = await hcfToken.totalSupply();
      const transferAmount = ethers.utils.parseEther("1000");
      
      // Multiple transfers to accumulate burns
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);
      await hcfToken.connect(user1).transfer(user2.address, transferAmount);
      
      // Total tax across 3 transfers: 3000 * 1% = 30 HCF
      // Total burn: 30 * 40% = 12 HCF
      const deadBalance = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const expectedBurn = transferAmount.mul(3).mul(1).div(100).mul(40).div(100);
      
      expect(deadBalance).to.equal(expectedBurn);
      
      // Verify circulating supply reduction
      const finalSupply = await hcfToken.totalSupply();
      expect(finalSupply).to.equal(initialSupply); // Total supply unchanged, tokens in dead wallet
    });

    it("Should handle large burn amounts correctly", async function () {
      // Transfer large amount to test precision
      const largeAmount = ethers.utils.parseEther("5000");
      const deadBalanceBefore = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      
      await hcfToken.connect(user1).transfer(user2.address, largeAmount);
      
      const deadBalanceAfter = await hcfToken.balanceOf("0x000000000000000000000000000000000000dead");
      const actualBurn = deadBalanceAfter.sub(deadBalanceBefore);
      const expectedBurn = largeAmount.mul(1).div(100).mul(40).div(100); // 1% tax * 40% burn
      
      expect(actualBurn).to.equal(expectedBurn);
    });
  });

  describe("Mining Pool Monitoring", function () {
    it("Should accurately track mining pool depletion", async function () {
      const initialPool = await hcfToken.getRemainingMiningPool();
      const rewardAmount = ethers.utils.parseEther("1000000"); // 1M HCF
      
      // Release mining rewards
      await hcfToken.releaseMiningRewards(user1.address, rewardAmount);
      
      const finalPool = await hcfToken.getRemainingMiningPool();
      expect(finalPool).to.equal(initialPool.sub(rewardAmount));
      
      // Verify total supply increased
      const totalSupply = await hcfToken.totalSupply();
      const expectedSupply = ethers.utils.parseEther("11000000"); // 10M initial + 1M mining
      expect(totalSupply).to.equal(expectedSupply);
    });

    it("Should prevent mining pool overdraw precisely", async function () {
      const remainingPool = await hcfToken.getRemainingMiningPool();
      const overAmount = remainingPool.add(ethers.utils.parseEther("1"));
      
      await expect(
        hcfToken.releaseMiningRewards(user1.address, overAmount)
      ).to.be.revertedWith("Exceeds mining pool");
      
      // Verify pool unchanged after failed attempt
      const poolAfterFail = await hcfToken.getRemainingMiningPool();
      expect(poolAfterFail).to.equal(remainingPool);
    });

    it("Should allow exact mining pool depletion", async function () {
      const remainingPool = await hcfToken.getRemainingMiningPool();
      
      // Should succeed with exact amount
      await expect(
        hcfToken.releaseMiningRewards(user1.address, remainingPool)
      ).to.not.be.reverted;
      
      // Pool should be empty
      const finalPool = await hcfToken.getRemainingMiningPool();
      expect(finalPool).to.equal(0);
    });
  });

  describe("BSDT Integration Monitoring", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      await hcfToken.transfer(hcfToken.address, ethers.utils.parseEther("10000"));
      await mockBSDT.transfer(hcfToken.address, ethers.utils.parseEther("10000"));
      await mockBSDT.transfer(user1.address, ethers.utils.parseEther("5000"));
    });

    it("Should maintain 1:1 swap ratio accurately", async function () {
      const swapAmount = ethers.utils.parseEther("1000");
      
      // Approve and swap BSDT for HCF
      await mockBSDT.connect(user1).approve(hcfToken.address, swapAmount);
      
      const user1HCFBefore = await hcfToken.balanceOf(user1.address);
      const user1BSDTBefore = await mockBSDT.balanceOf(user1.address);
      
      await hcfToken.connect(user1).swapBSDTForHCF(swapAmount);
      
      const user1HCFAfter = await hcfToken.balanceOf(user1.address);
      const user1BSDTAfter = await mockBSDT.balanceOf(user1.address);
      
      // Verify 1:1 ratio maintained
      expect(user1HCFAfter.sub(user1HCFBefore)).to.equal(swapAmount);
      expect(user1BSDTBefore.sub(user1BSDTAfter)).to.equal(swapAmount);
    });

    it("Should handle insufficient liquidity gracefully", async function () {
      const contractHCF = await hcfToken.balanceOf(hcfToken.address);
      const excessAmount = contractHCF.add(ethers.utils.parseEther("1"));
      
      await mockBSDT.connect(user1).approve(hcfToken.address, excessAmount);
      
      await expect(
        hcfToken.connect(user1).swapBSDTForHCF(excessAmount)
      ).to.be.revertedWith("Insufficient HCF in contract");
    });

    it("Should track swap volumes accurately", async function () {
      const swapAmount1 = ethers.utils.parseEther("500");
      const swapAmount2 = ethers.utils.parseEther("300");
      
      // First swap
      await mockBSDT.connect(user1).approve(hcfToken.address, swapAmount1);
      await hcfToken.connect(user1).swapBSDTForHCF(swapAmount1);
      
      // Second swap
      await mockBSDT.connect(user1).approve(hcfToken.address, swapAmount2);
      await hcfToken.connect(user1).swapBSDTForHCF(swapAmount2);
      
      // Verify total HCF received
      const user1HCF = await hcfToken.balanceOf(user1.address);
      const expectedHCF = swapAmount1.add(swapAmount2);
      expect(user1HCF).to.equal(expectedHCF);
    });
  });

  describe("Security and Edge Cases", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("1000"));
    });

    it("Should prevent tax manipulation through multiple small transfers", async function () {
      const smallAmount = ethers.utils.parseEther("1");
      const iterations = 100;
      
      const marketingBalanceBefore = await hcfToken.balanceOf(marketing.address);
      
      // Execute many small transfers
      for (let i = 0; i < iterations; i++) {
        await hcfToken.connect(user1).transfer(user2.address, smallAmount);
      }
      
      const marketingBalanceAfter = await hcfToken.balanceOf(marketing.address);
      const totalTax = smallAmount.mul(iterations).mul(1).div(100); // 1% tax total
      const expectedMarketing = totalTax.mul(30).div(100); // 30% of tax
      
      expect(marketingBalanceAfter.sub(marketingBalanceBefore)).to.equal(expectedMarketing);
    });

    it("Should handle zero amount transfers correctly", async function () {
      await expect(
        hcfToken.connect(user1).transfer(user2.address, 0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should prevent self-transfers", async function () {
      // Self-transfer should still apply tax if not excluded
      const amount = ethers.utils.parseEther("100");
      const balanceBefore = await hcfToken.balanceOf(user1.address);
      
      await hcfToken.connect(user1).transfer(user1.address, amount);
      
      const balanceAfter = await hcfToken.balanceOf(user1.address);
      const expectedBalance = balanceBefore.sub(amount.mul(1).div(100)); // 1% tax deducted
      
      expect(balanceAfter).to.equal(expectedBalance);
    });
  });

  describe("Gas Optimization Tests", function () {
    beforeEach(async function () {
      await hcfToken.enableTrading();
      await hcfToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    });

    it("Should maintain reasonable gas costs for transfers", async function () {
      const amount = ethers.utils.parseEther("1000");
      
      const tx = await hcfToken.connect(user1).transfer(user2.address, amount);
      const receipt = await tx.wait();
      
      // Gas should be reasonable for complex transfer logic
      expect(receipt.gasUsed.toNumber()).to.be.lessThan(150000);
      console.log(`Transfer gas used: ${receipt.gasUsed.toString()}`);
    });

    it("Should optimize gas for exempt transfers", async function () {
      // Exempt transfers should use less gas
      const amount = ethers.utils.parseEther("1000");
      
      const tx = await hcfToken.transfer(user1.address, amount); // Owner is exempt
      const receipt = await tx.wait();
      
      expect(receipt.gasUsed.toNumber()).to.be.lessThan(100000);
      console.log(`Exempt transfer gas used: ${receipt.gasUsed.toString()}`);
    });
  });
});