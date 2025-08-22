const { ethers } = require("hardhat");
require('dotenv').config({ path: '../.env' });

async function main() {
  console.log("Deploying HCF Token Contract...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "BNB\n");

  // Contract parameters
  const BSDT_ADDRESS = process.env.BSDT_CONTRACT_ADDRESS;
  const MARKETING_WALLET = deployer.address; // Use deployer as marketing wallet for now
  const LP_WALLET = deployer.address;        // Use deployer as LP wallet for now  
  const NODE_WALLET = deployer.address;      // Use deployer as node wallet for now

  console.log("Deployment Parameters:");
  console.log("BSDT Token:", BSDT_ADDRESS);
  console.log("Marketing Wallet:", MARKETING_WALLET);
  console.log("LP Wallet:", LP_WALLET);
  console.log("Node Wallet:", NODE_WALLET);
  console.log("");

  // Deploy HCF Token
  const HCFToken = await ethers.getContractFactory("HCFToken");
  const hcfToken = await HCFToken.deploy(
    BSDT_ADDRESS,
    MARKETING_WALLET,
    LP_WALLET,
    NODE_WALLET
  );

  await hcfToken.deployed();

  console.log("✅ HCF Token deployed to:", hcfToken.address);
  console.log("📄 Transaction hash:", hcfToken.deployTransaction.hash);
  
  // Verify contract info
  console.log("\n📊 Contract Information:");
  console.log("Name:", await hcfToken.name());
  console.log("Symbol:", await hcfToken.symbol());
  console.log("Total Supply:", ethers.utils.formatEther(await hcfToken.totalSupply()), "HCF");
  console.log("Initial Supply:", ethers.utils.formatEther(await hcfToken.balanceOf(deployer.address)), "HCF");
  console.log("Mining Pool Remaining:", ethers.utils.formatEther(await hcfToken.getRemainingMiningPool()), "HCF");
  console.log("Trading Enabled:", await hcfToken.tradingEnabled());

  // Update .env file with deployed address
  console.log("\n📝 Add this to your .env file:");
  console.log(`HCF_CONTRACT_ADDRESS=${hcfToken.address}`);
  console.log(`REACT_APP_CONTRACT_ADDRESS=${hcfToken.address}`);

  console.log("\n🎯 Next steps:");
  console.log("1. Verify contract on BSCScan");
  console.log("2. Enable trading: await hcfToken.enableTrading()");
  console.log("3. Add liquidity to DEX");
  console.log("4. Configure DEX pair: await hcfToken.setDEXPair(pairAddress, true)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });