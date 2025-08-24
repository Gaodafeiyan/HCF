const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 开始完整部署HCF DeFi生态系统...");
  
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("账户余额:", ethers.utils.formatEther(await deployer.getBalance()), "BNB");

  // 🔧 钱包地址配置 (使用部署者地址作为默认值)
  const marketingWallet = deployer.address;
  const lpWallet = deployer.address;  
  const nodeWallet = deployer.address;

  console.log("\n📋 钱包配置:");
  console.log("营销钱包:", marketingWallet);
  console.log("LP钱包:", lpWallet);
  console.log("节点钱包:", nodeWallet);

  try {
    // 1️⃣ 部署BSDT模拟合约
    console.log("\n1️⃣ 部署BSDT合约...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bsdtToken = await MockERC20.deploy(
      "BSDT Token",
      "BSDT", 
      ethers.utils.parseEther("1000000000") // 10亿BSDT
    );
    await bsdtToken.deployed();
    console.log("✅ BSDT Token 部署成功:", bsdtToken.address);

    // 2️⃣ 部署USDC模拟合约  
    console.log("\n2️⃣ 部署USDC合约...");
    const usdcToken = await MockERC20.deploy(
      "USD Coin",
      "USDC",
      ethers.utils.parseUnits("1000000000", 6) // 10亿USDC (6位小数)
    );
    await usdcToken.deployed();
    console.log("✅ USDC Token 部署成功:", usdcToken.address);

    // 3️⃣ 部署HCF Token
    console.log("\n3️⃣ 部署HCF Token...");
    const HCFToken = await ethers.getContractFactory("HCFToken");
    const hcfToken = await HCFToken.deploy(
      bsdtToken.address,
      marketingWallet,
      lpWallet,
      nodeWallet
    );
    await hcfToken.deployed();
    console.log("✅ HCF Token 部署成功:", hcfToken.address);

    // 4️⃣ 部署HCF Staking
    console.log("\n4️⃣ 部署HCF Staking...");
    const HCFStaking = await ethers.getContractFactory("HCFStaking");
    const hcfStaking = await HCFStaking.deploy(
      hcfToken.address,
      bsdtToken.address,
      usdcToken.address
    );
    await hcfStaking.deployed();
    console.log("✅ HCF Staking 部署成功:", hcfStaking.address);

    // 5️⃣ 部署HCF Referral
    console.log("\n5️⃣ 部署HCF Referral...");
    const HCFReferral = await ethers.getContractFactory("HCFReferral");
    const hcfReferral = await HCFReferral.deploy(
      hcfToken.address,
      hcfStaking.address
    );
    await hcfReferral.deployed();
    console.log("✅ HCF Referral 部署成功:", hcfReferral.address);

    // 6️⃣ 部署HCF NodeNFT
    console.log("\n6️⃣ 部署HCF NodeNFT...");
    const HCFNodeNFT = await ethers.getContractFactory("HCFNodeNFT");
    const hcfNodeNFT = await HCFNodeNFT.deploy(
      hcfToken.address,
      bsdtToken.address,
      ethers.constants.AddressZero // 暂时使用零地址，后续设置
    );
    await hcfNodeNFT.deployed();
    console.log("✅ HCF NodeNFT 部署成功:", hcfNodeNFT.address);

    // 7️⃣ 部署HCF MarketControl
    console.log("\n7️⃣ 部署HCF MarketControl...");
    const HCFMarketControl = await ethers.getContractFactory("HCFMarketControl");
    const hcfMarketControl = await HCFMarketControl.deploy(
      hcfToken.address,
      ethers.constants.AddressZero, // 价格预言机地址
      hcfStaking.address,
      hcfNodeNFT.address
    );
    await hcfMarketControl.deployed();
    console.log("✅ HCF MarketControl 部署成功:", hcfMarketControl.address);

    // 8️⃣ 部署HCF BSDTExchange
    console.log("\n8️⃣ 部署HCF BSDTExchange...");
    const HCFBSDTExchange = await ethers.getContractFactory("HCFBSDTExchange");
    const hcfBsdtExchange = await HCFBSDTExchange.deploy(
      hcfToken.address,
      bsdtToken.address,
      usdcToken.address,
      marketingWallet // 费用收集者
    );
    await hcfBsdtExchange.deployed();
    console.log("✅ HCF BSDTExchange 部署成功:", hcfBsdtExchange.address);

    // 9️⃣ 部署HCF LPMining
    console.log("\n9️⃣ 部署HCF LPMining...");
    const HCFLPMining = await ethers.getContractFactory("HCFLPMining");
    const hcfLpMining = await HCFLPMining.deploy(
      hcfToken.address,
      await ethers.provider.getBlockNumber()
    );
    await hcfLpMining.deployed();
    console.log("✅ HCF LPMining 部署成功:", hcfLpMining.address);

    // 🔟 部署HCF ImpermanentLossProtection
    console.log("\n🔟 部署HCF ImpermanentLossProtection...");
    const HCFImpermanentLossProtection = await ethers.getContractFactory("HCFImpermanentLossProtection");
    const hcfImpermanentLossProtection = await HCFImpermanentLossProtection.deploy(
      hcfToken.address,
      hcfBsdtExchange.address,
      ethers.constants.AddressZero // 价格预言机地址
    );
    await hcfImpermanentLossProtection.deployed();
    console.log("✅ HCF ImpermanentLossProtection 部署成功:", hcfImpermanentLossProtection.address);

    // 1️⃣1️⃣ 部署HCF BurnMechanism
    console.log("\n1️⃣1️⃣ 部署HCF BurnMechanism...");
    const HCFBurnMechanism = await ethers.getContractFactory("HCFBurnMechanism");
    const hcfBurnMechanism = await HCFBurnMechanism.deploy(
      hcfToken.address,
      hcfStaking.address,
      hcfReferral.address
    );
    await hcfBurnMechanism.deployed();
    console.log("✅ HCF BurnMechanism 部署成功:", hcfBurnMechanism.address);

    // 1️⃣2️⃣ 部署HCF Ranking
    console.log("\n1️⃣2️⃣ 部署HCF Ranking...");
    const HCFRanking = await ethers.getContractFactory("HCFRanking");
    const hcfRanking = await HCFRanking.deploy(
      hcfStaking.address,
      hcfReferral.address
    );
    await hcfRanking.deployed();
    console.log("✅ HCF Ranking 部署成功:", hcfRanking.address);

    // 🔧 初始化设置
    console.log("\n🔧 执行初始化设置...");
    
    // 启用HCF交易
    await hcfToken.enableTrading();
    console.log("✅ HCF交易已启用");

    // 设置LP挖矿合约
    await hcfToken.setLPMiningContract(hcfLpMining.address);
    console.log("✅ LP挖矿合约已设置");

    // 设置推荐合约
    await hcfStaking.setReferralContract(hcfReferral.address);
    console.log("✅ 推荐合约已设置");

    // 为质押合约提供USDC流动性
    await usdcToken.transfer(hcfStaking.address, ethers.utils.parseUnits("1000000", 6)); // 100万USDC
    console.log("✅ 质押合约USDC流动性已注入");

    // 为HCF合约提供BSDT流动性用于兑换
    await bsdtToken.transfer(hcfToken.address, ethers.utils.parseEther("5000000")); // 500万BSDT
    console.log("✅ HCF合约BSDT流动性已注入");

    // 设置BSDT交易所的LP挖矿合约
    await hcfBsdtExchange.setLPMiningContract(hcfLpMining.address);
    console.log("✅ BSDT交易所LP挖矿合约已设置");

    // 设置BSDT交易所的无常损失保护合约
    await hcfBsdtExchange.setLossProtectionContract(hcfImpermanentLossProtection.address);
    console.log("✅ BSDT交易所无常损失保护合约已设置");

    // 设置NodeNFT的BSDT交易所地址
    await hcfNodeNFT.setBSDTExchange(hcfBsdtExchange.address);
    console.log("✅ NodeNFT BSDT交易所地址已设置");

    // 设置ImpermanentLossProtection的BSDT交易所地址
    await hcfImpermanentLossProtection.setBSDTExchange(hcfBsdtExchange.address);
    console.log("✅ 无常损失保护BSDT交易所地址已设置");

    // 🔍 验证部署
    console.log("\n🔍 验证部署结果...");
    
    const hcfSupply = await hcfToken.totalSupply();
    const hcfName = await hcfToken.name();
    const hcfSymbol = await hcfToken.symbol();
    
    console.log("HCF Token信息:");
    console.log("  名称:", hcfName);
    console.log("  符号:", hcfSymbol); 
    console.log("  总供应量:", ethers.utils.formatEther(hcfSupply), "HCF");

    // 获取质押池信息
    try {
      const levelInfo = await hcfStaking.getLevelInfo(0);
      console.log("质押池0信息:");
      console.log("  日化收益率:", levelInfo.baseRate.toString(), "基点 (0.4%)");
      console.log("  最小金额:", ethers.utils.formatEther(levelInfo.minAmount), "HCF");
    } catch (error) {
      console.log("⚠️  无法获取质押池信息，可能需要先质押");
    }

    // 🎉 生成部署总结
    console.log("\n🎉 ===================");
    console.log("   部署成功总结");  
    console.log("===================");
    console.log("网络: hardhat");
    console.log("部署者:", deployer.address);
    console.log("");
    console.log("📋 合约地址:");
    console.log("BSDT Token:   ", bsdtToken.address);
    console.log("USDC Token:   ", usdcToken.address);  
    console.log("HCF Token:    ", hcfToken.address);
    console.log("HCF Staking:  ", hcfStaking.address);
    console.log("HCF Referral: ", hcfReferral.address);
    console.log("HCF NodeNFT:  ", hcfNodeNFT.address);
    console.log("HCF MarketControl:", hcfMarketControl.address);
    console.log("HCF BSDTExchange:", hcfBsdtExchange.address);
    console.log("HCF LPMining: ", hcfLpMining.address);
    console.log("HCF ImpermanentLossProtection:", hcfImpermanentLossProtection.address);
    console.log("HCF BurnMechanism:", hcfBurnMechanism.address);
    console.log("HCF Ranking:  ", hcfRanking.address);
    console.log("");
    console.log("🔧 配置信息:");
    console.log("营销钱包:      ", marketingWallet);
    console.log("LP钱包:       ", lpWallet);
    console.log("节点钱包:      ", nodeWallet);
    console.log("");
    console.log("💰 初始状态:");
    console.log("HCF总供应:     ", ethers.utils.formatEther(hcfSupply), "HCF");
    console.log("质押池流动性:   1,000,000 USDC");
    console.log("兑换池流动性:   5,000,000 BSDT");
    console.log("");
    console.log("⚠️  重要提醒:");
    console.log("1. 请将以上地址信息安全保存");
    console.log("2. 在BSCScan上验证合约代码"); 
    console.log("3. 测试基础功能后再开放给用户");
    console.log("4. 定期监控合约资金安全");
    console.log("");
    console.log("🎯 下一步:");
    console.log("1. 运行测试: npx hardhat test");
    console.log("2. 配置前端环境变量");
    console.log("3. 进行用户验收测试");

    // 📄 生成环境配置文件
    const envConfig = `
# 🚀 HCF DeFi 生产环境配置
# 生成时间: ${new Date().toISOString()}
# 网络: hardhat

# 合约地址
BSDT_CONTRACT_ADDRESS=${bsdtToken.address}
USDC_CONTRACT_ADDRESS=${usdcToken.address}
HCF_CONTRACT_ADDRESS=${hcfToken.address}
HCF_STAKING_ADDRESS=${hcfStaking.address}
HCF_REFERRAL_ADDRESS=${hcfReferral.address}
HCF_NODE_NFT_ADDRESS=${hcfNodeNFT.address}
HCF_MARKET_CONTROL_ADDRESS=${hcfMarketControl.address}
HCF_BSDT_EXCHANGE_ADDRESS=${hcfBsdtExchange.address}
HCF_LP_MINING_ADDRESS=${hcfLpMining.address}
HCF_IMPERMANENT_LOSS_PROTECTION_ADDRESS=${hcfImpermanentLossProtection.address}
HCF_BURN_MECHANISM_ADDRESS=${hcfBurnMechanism.address}
HCF_RANKING_ADDRESS=${hcfRanking.address}

# 钱包地址
MARKETING_WALLET=${marketingWallet}
LP_WALLET=${lpWallet}
NODE_WALLET=${nodeWallet}
DEPLOYER_ADDRESS=${deployer.address}

# 网络配置
NETWORK_NAME=hardhat
CHAIN_ID=31337

# 前端配置
REACT_APP_HCF_CONTRACT=${hcfToken.address}
REACT_APP_STAKING_CONTRACT=${hcfStaking.address}
REACT_APP_NETWORK_ID=31337
`;

    console.log("\n📄 环境配置已生成，请保存以下内容到 .env:");
    console.log(envConfig);

  } catch (error) {
    console.error("❌ 部署过程中出现错误:");
    console.error(error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
