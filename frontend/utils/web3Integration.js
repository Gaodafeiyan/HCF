// Web3 Wallet Integration Module
import { ethers } from 'ethers';
import Web3Modal from 'web3modal';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { InjectedConnector } from '@web3-react/injected-connector';
import EventEmitter from 'events';

// Contract ABIs
import HCFTokenABI from '../abis/HCFToken.json';
import HCFStakingABI from '../abis/HCFStaking.json';
import HCFReferralABI from '../abis/HCFReferral.json';
import HCFBSDTExchangeABI from '../abis/HCFBSDTExchange.json';
import HCFNodeNFTABI from '../abis/HCFNodeNFT.json';
import HCFRankingABI from '../abis/HCFRanking.json';

// BSC Network Configuration
const BSC_MAINNET = {
    chainId: '0x38', // 56 in hex
    chainName: 'Binance Smart Chain',
    nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18
    },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com/']
};

class Web3Integration extends EventEmitter {
    constructor() {
        super();
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.contracts = {};
        this.web3Modal = null;
        this.subscriptions = new Map();
    }

    // 初始化Web3Modal
    initWeb3Modal() {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider,
                options: {
                    rpc: {
                        56: BSC_MAINNET.rpcUrls[0]
                    },
                    network: 'binance',
                    chainId: 56
                }
            },
            'custom-binancechainwallet': {
                display: {
                    logo: 'https://github.com/binance-chain.png',
                    name: 'Binance Chain Wallet',
                    description: 'Connect to your Binance Chain Wallet'
                },
                package: true,
                connector: async () => {
                    if (typeof window.BinanceChain !== 'undefined') {
                        const provider = window.BinanceChain;
                        await provider.enable();
                        return provider;
                    } else {
                        throw new Error('Binance Chain Wallet not installed');
                    }
                }
            },
            'custom-trustwallet': {
                display: {
                    logo: 'https://trustwallet.com/assets/images/media/assets/trust_platform.svg',
                    name: 'Trust Wallet',
                    description: 'Connect to your Trust Wallet'
                },
                package: true,
                connector: async () => {
                    if (window.ethereum?.isTrust) {
                        await window.ethereum.request({ method: 'eth_requestAccounts' });
                        return window.ethereum;
                    } else {
                        throw new Error('Trust Wallet not installed');
                    }
                }
            }
        };

        this.web3Modal = new Web3Modal({
            network: 'binance',
            cacheProvider: true,
            providerOptions,
            theme: {
                background: '#1a1a2e',
                main: '#f4f4f4',
                secondary: '#888888',
                border: '#2e2e3e',
                hover: '#252536'
            }
        });
    }

    // 连接钱包
    async connect() {
        try {
            if (!this.web3Modal) {
                this.initWeb3Modal();
            }

            const instance = await this.web3Modal.connect();
            const provider = new ethers.providers.Web3Provider(instance);
            const network = await provider.getNetwork();

            // 检查网络
            if (network.chainId !== 56) {
                await this.switchToBSC(instance);
            }

            this.provider = provider;
            this.signer = provider.getSigner();
            this.address = await this.signer.getAddress();

            // 初始化合约
            await this.initContracts();

            // 设置事件监听
            this.setupEventListeners(instance);

            // 触发连接成功事件
            this.emit('connected', {
                address: this.address,
                chainId: network.chainId
            });

            return {
                provider: this.provider,
                signer: this.signer,
                address: this.address
            };
        } catch (error) {
            console.error('Connection error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    // 切换到BSC网络
    async switchToBSC(provider) {
        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: BSC_MAINNET.chainId }]
            });
        } catch (error) {
            // 如果网络未添加，则添加网络
            if (error.code === 4902) {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [BSC_MAINNET]
                });
            } else {
                throw error;
            }
        }
    }

    // 初始化合约实例
    async initContracts() {
        const contractAddresses = {
            token: process.env.NEXT_PUBLIC_HCF_TOKEN_ADDRESS,
            staking: process.env.NEXT_PUBLIC_STAKING_ADDRESS,
            referral: process.env.NEXT_PUBLIC_REFERRAL_ADDRESS,
            exchange: process.env.NEXT_PUBLIC_EXCHANGE_ADDRESS,
            nodeNFT: process.env.NEXT_PUBLIC_NODE_NFT_ADDRESS,
            ranking: process.env.NEXT_PUBLIC_RANKING_ADDRESS
        };

        this.contracts = {
            token: new ethers.Contract(
                contractAddresses.token,
                HCFTokenABI,
                this.signer
            ),
            staking: new ethers.Contract(
                contractAddresses.staking,
                HCFStakingABI,
                this.signer
            ),
            referral: new ethers.Contract(
                contractAddresses.referral,
                HCFReferralABI,
                this.signer
            ),
            exchange: new ethers.Contract(
                contractAddresses.exchange,
                HCFBSDTExchangeABI,
                this.signer
            ),
            nodeNFT: new ethers.Contract(
                contractAddresses.nodeNFT,
                HCFNodeNFTABI,
                this.signer
            ),
            ranking: new ethers.Contract(
                contractAddresses.ranking,
                HCFRankingABI,
                this.signer
            )
        };
    }

    // 设置事件监听器
    setupEventListeners(provider) {
        // 账户变更
        provider.on('accountsChanged', async (accounts) => {
            if (accounts.length === 0) {
                await this.disconnect();
            } else {
                this.address = accounts[0];
                await this.initContracts();
                this.emit('accountChanged', accounts[0]);
            }
        });

        // 链变更
        provider.on('chainChanged', (chainId) => {
            this.emit('chainChanged', chainId);
            if (parseInt(chainId) !== 56) {
                this.emit('wrongNetwork', chainId);
            }
        });

        // 断开连接
        provider.on('disconnect', () => {
            this.disconnect();
        });
    }

    // 断开连接
    async disconnect() {
        if (this.web3Modal) {
            await this.web3Modal.clearCachedProvider();
        }
        
        // 取消所有订阅
        this.subscriptions.forEach(sub => sub.unsubscribe());
        this.subscriptions.clear();

        this.provider = null;
        this.signer = null;
        this.address = null;
        this.contracts = {};

        this.emit('disconnected');
    }

    // ========== 合约交互方法 ==========

    // 质押HCF
    async stake(levelId, amount, isLP = false) {
        try {
            const amountWei = ethers.utils.parseEther(amount.toString());
            
            // 检查余额
            const balance = await this.contracts.token.balanceOf(this.address);
            if (balance.lt(amountWei)) {
                throw new Error('Insufficient balance');
            }

            // 检查授权
            const allowance = await this.contracts.token.allowance(
                this.address,
                this.contracts.staking.address
            );
            
            if (allowance.lt(amountWei)) {
                // 先授权
                const approveTx = await this.contracts.token.approve(
                    this.contracts.staking.address,
                    ethers.constants.MaxUint256
                );
                await approveTx.wait();
            }

            // 执行质押
            const tx = await this.contracts.staking.stake(
                levelId,
                amountWei,
                isLP,
                0 // bsdtAmount
            );

            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // 提取质押
    async withdraw(amount) {
        try {
            const amountWei = ethers.utils.parseEther(amount.toString());
            
            const tx = await this.contracts.staking.withdraw(amountWei);
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // 领取奖励
    async claimRewards() {
        try {
            const tx = await this.contracts.staking.claimRewards();
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // 复投
    async compound() {
        try {
            const tx = await this.contracts.staking.compound();
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // USDT兑换HCF
    async swapUSDTToHCF(usdtAmount) {
        try {
            const amountWei = ethers.utils.parseUnits(usdtAmount.toString(), 18);
            
            // 检查USDT授权
            const usdtContract = new ethers.Contract(
                process.env.NEXT_PUBLIC_USDT_ADDRESS,
                ['function approve(address,uint256)', 'function allowance(address,address) view returns(uint256)'],
                this.signer
            );
            
            const allowance = await usdtContract.allowance(
                this.address,
                this.contracts.exchange.address
            );
            
            if (allowance.lt(amountWei)) {
                const approveTx = await usdtContract.approve(
                    this.contracts.exchange.address,
                    ethers.constants.MaxUint256
                );
                await approveTx.wait();
            }

            // 执行兑换
            const tx = await this.contracts.exchange.swapUSDTToHCF(amountWei);
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // HCF兑换USDT
    async swapHCFToUSDT(hcfAmount) {
        try {
            const amountWei = ethers.utils.parseEther(hcfAmount.toString());
            
            // 检查授权
            const allowance = await this.contracts.token.allowance(
                this.address,
                this.contracts.exchange.address
            );
            
            if (allowance.lt(amountWei)) {
                const approveTx = await this.contracts.token.approve(
                    this.contracts.exchange.address,
                    ethers.constants.MaxUint256
                );
                await approveTx.wait();
            }

            // 执行兑换
            const tx = await this.contracts.exchange.swapHCFToUSDT(amountWei);
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // 激活节点
    async activateNode(tokenId) {
        try {
            const tx = await this.contracts.nodeNFT.activateNode(tokenId);
            this.emit('transactionSent', tx);

            const receipt = await tx.wait();
            this.emit('transactionConfirmed', receipt);

            return receipt;
        } catch (error) {
            this.emit('transactionError', error);
            throw error;
        }
    }

    // ========== 查询方法 ==========

    // 获取用户信息
    async getUserInfo() {
        try {
            const [
                balance,
                stakingInfo,
                referralData,
                nodeCount,
                ranking
            ] = await Promise.all([
                this.contracts.token.balanceOf(this.address),
                this.contracts.staking.getUserInfo(this.address),
                this.contracts.referral.getUserData(this.address),
                this.contracts.nodeNFT.balanceOf(this.address),
                this.contracts.ranking.getUserRanking(this.address)
            ]);

            return {
                balance: ethers.utils.formatEther(balance),
                staking: {
                    amount: ethers.utils.formatEther(stakingInfo.amount),
                    levelId: stakingInfo.levelId.toNumber(),
                    pendingRewards: ethers.utils.formatEther(stakingInfo.pendingRewards),
                    totalClaimed: ethers.utils.formatEther(stakingInfo.totalClaimed),
                    isLP: stakingInfo.isLP
                },
                referral: {
                    referrer: referralData.referrer,
                    teamLevel: referralData.teamLevel,
                    totalReferralReward: ethers.utils.formatEther(referralData.totalReferralReward),
                    totalTeamReward: ethers.utils.formatEther(referralData.totalTeamReward)
                },
                nodes: nodeCount.toNumber(),
                ranking: ranking.toNumber()
            };
        } catch (error) {
            console.error('Error fetching user info:', error);
            throw error;
        }
    }

    // 获取静态收益比例
    async getStaticRatio() {
        try {
            const ratio = await this.contracts.staking.calculateStaticRatio(this.address);
            return ratio.toNumber() / 100; // 转换为百分比
        } catch (error) {
            console.error('Error fetching static ratio:', error);
            return 50; // 默认50%
        }
    }

    // 获取动态收益比例
    async getDynamicRatio() {
        try {
            const ratio = await this.contracts.referral.getDynamicRatio(this.address);
            return ratio.toNumber() / 100; // 转换为百分比
        } catch (error) {
            console.error('Error fetching dynamic ratio:', error);
            return 50; // 默认50%
        }
    }

    // 获取价格信息
    async getPriceInfo() {
        try {
            const price = await this.contracts.exchange.getHCFPrice();
            return ethers.utils.formatEther(price);
        } catch (error) {
            console.error('Error fetching price:', error);
            return '0';
        }
    }

    // ========== 实时订阅 ==========

    // 订阅质押事件
    subscribeToStakingEvents(callback) {
        const filter = this.contracts.staking.filters.Staked(this.address);
        const subscription = this.contracts.staking.on(filter, (user, amount, levelId, isLP, event) => {
            callback({
                user,
                amount: ethers.utils.formatEther(amount),
                levelId: levelId.toNumber(),
                isLP,
                txHash: event.transactionHash
            });
        });
        
        this.subscriptions.set('staking', subscription);
        return subscription;
    }

    // 订阅奖励事件
    subscribeToRewardEvents(callback) {
        const filter = this.contracts.staking.filters.RewardsClaimed(this.address);
        const subscription = this.contracts.staking.on(filter, (user, amount, event) => {
            callback({
                user,
                amount: ethers.utils.formatEther(amount),
                txHash: event.transactionHash
            });
        });
        
        this.subscriptions.set('rewards', subscription);
        return subscription;
    }

    // 订阅价格更新
    subscribeToPriceUpdates(callback) {
        const filter = this.contracts.exchange.filters.SwapExecuted();
        const subscription = this.contracts.exchange.on(filter, async () => {
            const price = await this.getPriceInfo();
            callback(price);
        });
        
        this.subscriptions.set('price', subscription);
        return subscription;
    }

    // 取消订阅
    unsubscribe(eventName) {
        const subscription = this.subscriptions.get(eventName);
        if (subscription) {
            subscription.removeAllListeners();
            this.subscriptions.delete(eventName);
        }
    }
}

// 创建单例实例
const web3Integration = new Web3Integration();

export default web3Integration;
export { Web3Integration };