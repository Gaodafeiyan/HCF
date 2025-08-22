const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 开始完整部署HCF DeFi生态系统...");
  
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  console.log("账户余额:", ethers.utils.formatEther(await deployer.getBalance()), "BNB");

  // 🔧 钱包地址配置 (使用新的安全钱包)
  const marketingWallet = process.env.MARKETING_WALLET || deployer.address;
  const lpWallet = process.env.LP_WALLET || deployer.address;  
  const nodeWallet = process.env.NODE_WALLET || deployer.address;

  console.log("\\n📋 钱包配置:");
  console.log("营销钱包:", marketingWallet);
  console.log("LP钱包:", lpWallet);
  console.log("节点钱包:", nodeWallet);

  // 1️⃣ 部署BSDT模拟合约
  console.log("\\n1️⃣ 部署BSDT合约...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const bsdtToken = await MockERC20.deploy(
    "BSDT Token",
    "BSDT", 
    ethers.utils.parseEther("1000000000") // 10亿BSDT
  );
  await bsdtToken.deployed();
  console.log("✅ BSDT Token 部署成功:", bsdtToken.address);

  // 2️⃣ 部署USDC模拟合约  
  console.log("\\n2️⃣ 部署USDC合约...");
  const usdcToken = await MockERC20.deploy(
    "USD Coin",
    "USDC",
    ethers.utils.parseUnits("1000000000", 6) // 10亿USDC (6位小数)
  );
  await usdcToken.deployed();
  console.log("✅ USDC Token 部署成功:", usdcToken.address);

  // 3️⃣ 部署HCF Token
  console.log("\\n3️⃣ 部署HCF Token...");
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
  console.log("\\n4️⃣ 部署HCF Staking...");
  const HCFStaking = await ethers.getContractFactory("HCFStaking");
  const hcfStaking = await HCFStaking.deploy(
    hcfToken.address,
    bsdtToken.address,
    usdcToken.address
  );
  await hcfStaking.deployed();
  console.log("✅ HCF Staking 部署成功:", hcfStaking.address);

  // 5️⃣ 初始化设置
  console.log("\\n5️⃣ 执行初始化设置...");
  
  // 启用HCF交易
  await hcfToken.enableTrading();
  console.log("✅ HCF交易已启用");

  // 为质押合约提供USDC流动性
  await usdcToken.transfer(hcfStaking.address, ethers.utils.parseUnits("1000000", 6)); // 100万USDC
  console.log("✅ 质押合约USDC流动性已注入");

  // 为HCF合约提供BSDT流动性用于兑换
  await bsdtToken.transfer(hcfToken.address, ethers.utils.parseEther("5000000")); // 500万BSDT
  console.log("✅ HCF合约BSDT流动性已注入");

  // 6️⃣ 验证部署
  console.log("\\n6️⃣ 验证部署结果...");
  
  const hcfSupply = await hcfToken.totalSupply();
  const hcfName = await hcfToken.name();
  const hcfSymbol = await hcfToken.symbol();
  
  console.log("HCF Token信息:");
  console.log("  名称:", hcfName);
  console.log("  符号:", hcfSymbol); 
  console.log("  总供应量:", ethers.utils.formatEther(hcfSupply), "HCF");

  const poolInfo = await hcfStaking.getPoolInfo(0);
  console.log("质押池0信息:");
  console.log("  日化收益率:", poolInfo.dailyRate.toString(), "基点 (0.4%)");
  console.log("  最小金额:", ethers.utils.formatEther(poolInfo.minAmount), "HCF");

  // 7️⃣ 生成部署总结
  console.log("\\n🎉 ===================");
  console.log("   部署成功总结");  
  console.log("===================");
  console.log("网络:", network.name);
  console.log("部署者:", deployer.address);
  console.log("");
  console.log("📋 合约地址:");
  console.log("BSDT Token:   ", bsdtToken.address);
  console.log("USDC Token:   ", usdcToken.address);  
  console.log("HCF Token:    ", hcfToken.address);
  console.log("HCF Staking:  ", hcfStaking.address);
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
  console.log("1. 验证合约: npx hardhat verify --network", network.name, hcfToken.address);
  console.log("2. 配置前端环境变量");
  console.log("3. 进行用户验收测试");

  // 8️⃣ 生成环境配置文件
  const envConfig = `
# 🚀 HCF DeFi 生产环境配置
# 生成时间: ${new Date().toISOString()}
# 网络: ${network.name}

# 合约地址
BSDT_CONTRACT_ADDRESS=${bsdtToken.address}
USDC_CONTRACT_ADDRESS=${usdcToken.address}
HCF_CONTRACT_ADDRESS=${hcfToken.address}
HCF_STAKING_ADDRESS=${hcfStaking.address}

# 钱包地址
MARKETING_WALLET=${marketingWallet}
LP_WALLET=${lpWallet}
NODE_WALLET=${nodeWallet}
DEPLOYER_ADDRESS=${deployer.address}

# 网络配置
NETWORK_NAME=${network.name}
CHAIN_ID=${network.config.chainId || 'unknown'}

# 前端配置
REACT_APP_HCF_CONTRACT=${hcfToken.address}
REACT_APP_STAKING_CONTRACT=${hcfStaking.address}
REACT_APP_NETWORK_ID=${network.config.chainId || 56}
`;

  console.log("\\n📄 环境配置已生成，请保存以下内容到 .env.production:");
  console.log(envConfig);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });