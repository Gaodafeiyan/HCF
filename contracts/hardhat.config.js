require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require('dotenv').config({ path: '../.env' });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "6b6619ed32433c2ffab77bd750d7af6cf46e648254954eab1ab84721c3b151aa";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY],
      gasPrice: 10000000000 // 10 gwei
    },
    bsc_mainnet: {
      url: "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: [PRIVATE_KEY],
      gasPrice: 5000000000 // 5 gwei
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 20000
  }
};