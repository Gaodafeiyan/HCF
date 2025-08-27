// GraphQL Subscriptions Handler
const { PubSub } = require('graphql-subscriptions');
const { withFilter } = require('graphql-subscriptions');

// 创建PubSub实例
const pubsub = new PubSub();

// 订阅事件类型
const SUBSCRIPTION_EVENTS = {
    PRICE_UPDATE: 'PRICE_UPDATE',
    RANKING_UPDATE: 'RANKING_UPDATE',
    USER_STAKING_UPDATE: 'USER_STAKING_UPDATE',
    REWARD_DISTRIBUTED: 'REWARD_DISTRIBUTED',
    NODE_ACTIVATED: 'NODE_ACTIVATED',
    TEAM_LEVEL_UP: 'TEAM_LEVEL_UP',
    BURN_EVENT: 'BURN_EVENT',
    SWAP_EXECUTED: 'SWAP_EXECUTED',
    TVL_UPDATE: 'TVL_UPDATE',
    ALERT_TRIGGERED: 'ALERT_TRIGGERED'
};

// GraphQL Type Definitions
const typeDefs = `
    type Subscription {
        # 价格更新订阅
        priceUpdate: PriceData!
        
        # 排名更新订阅
        rankingUpdate: RankingUpdate!
        
        # 用户质押更新订阅（需要地址）
        userStakingUpdate(address: String!): UserStakingData!
        
        # 奖励分发订阅
        rewardDistributed(address: String): RewardEvent!
        
        # 节点激活订阅
        nodeActivated: NodeEvent!
        
        # 团队升级订阅
        teamLevelUp(address: String): TeamLevelEvent!
        
        # 燃烧事件订阅
        burnEvent: BurnEvent!
        
        # 交易执行订阅
        swapExecuted: SwapEvent!
        
        # TVL更新订阅
        tvlUpdate: TVLData!
        
        # 系统告警订阅
        alertTriggered(severity: String): AlertEvent!
    }
    
    type PriceData {
        hcfPrice: Float!
        bsdtPrice: Float!
        priceChange1h: Float!
        priceChange24h: Float!
        volume24h: Float!
        timestamp: String!
    }
    
    type RankingUpdate {
        type: String!
        rankings: [UserRanking!]!
        timestamp: String!
    }
    
    type UserRanking {
        rank: Int!
        address: String!
        score: String!
        stakedAmount: String!
        lpAmount: String!
        referralCount: Int!
        teamLevel: Int!
        nodeCount: Int!
    }
    
    type UserStakingData {
        address: String!
        stakedAmount: String!
        levelId: Int!
        pendingRewards: String!
        totalClaimed: String!
        isLP: Boolean!
        staticRatio: Float!
        dynamicRatio: Float!
        lastUpdate: String!
    }
    
    type RewardEvent {
        user: String!
        type: String!
        amount: String!
        txHash: String!
        timestamp: String!
    }
    
    type NodeEvent {
        tokenId: Int!
        owner: String!
        tier: Int!
        computingPower: String!
        txHash: String!
        timestamp: String!
    }
    
    type TeamLevelEvent {
        user: String!
        oldLevel: Int!
        newLevel: Int!
        teamVolume: String!
        directReferrals: Int!
        timestamp: String!
    }
    
    type BurnEvent {
        amount: String!
        source: String!
        totalBurned: String!
        burnRate: Float!
        txHash: String!
        timestamp: String!
    }
    
    type SwapEvent {
        user: String!
        fromToken: String!
        toToken: String!
        fromAmount: String!
        toAmount: String!
        fee: String!
        txHash: String!
        timestamp: String!
    }
    
    type TVLData {
        totalValueLocked: String!
        hcfLocked: String!
        bsdtLocked: String!
        lpTokens: String!
        change24h: Float!
        timestamp: String!
    }
    
    type AlertEvent {
        type: String!
        severity: String!
        message: String!
        data: String!
        timestamp: String!
    }
`;

// GraphQL Resolvers
const resolvers = {
    Subscription: {
        // 价格更新订阅
        priceUpdate: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.PRICE_UPDATE])
        },
        
        // 排名更新订阅
        rankingUpdate: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.RANKING_UPDATE])
        },
        
        // 用户质押更新订阅（过滤特定用户）
        userStakingUpdate: {
            subscribe: withFilter(
                () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.USER_STAKING_UPDATE]),
                (payload, variables) => {
                    return payload.userStakingUpdate.address === variables.address;
                }
            )
        },
        
        // 奖励分发订阅
        rewardDistributed: {
            subscribe: withFilter(
                () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.REWARD_DISTRIBUTED]),
                (payload, variables) => {
                    if (!variables.address) return true;
                    return payload.rewardDistributed.user === variables.address;
                }
            )
        },
        
        // 节点激活订阅
        nodeActivated: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.NODE_ACTIVATED])
        },
        
        // 团队升级订阅
        teamLevelUp: {
            subscribe: withFilter(
                () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.TEAM_LEVEL_UP]),
                (payload, variables) => {
                    if (!variables.address) return true;
                    return payload.teamLevelUp.user === variables.address;
                }
            )
        },
        
        // 燃烧事件订阅
        burnEvent: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.BURN_EVENT])
        },
        
        // 交易执行订阅
        swapExecuted: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.SWAP_EXECUTED])
        },
        
        // TVL更新订阅
        tvlUpdate: {
            subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.TVL_UPDATE])
        },
        
        // 系统告警订阅
        alertTriggered: {
            subscribe: withFilter(
                () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ALERT_TRIGGERED]),
                (payload, variables) => {
                    if (!variables.severity) return true;
                    return payload.alertTriggered.severity === variables.severity;
                }
            )
        }
    }
};

// 发布事件的辅助函数
class SubscriptionPublisher {
    // 发布价格更新
    publishPriceUpdate(data) {
        pubsub.publish(SUBSCRIPTION_EVENTS.PRICE_UPDATE, {
            priceUpdate: {
                hcfPrice: data.hcfPrice,
                bsdtPrice: data.bsdtPrice || 1.0,
                priceChange1h: data.priceChange1h || 0,
                priceChange24h: data.priceChange24h || 0,
                volume24h: data.volume24h || 0,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布排名更新
    publishRankingUpdate(rankings, type = 'update') {
        pubsub.publish(SUBSCRIPTION_EVENTS.RANKING_UPDATE, {
            rankingUpdate: {
                type: type,
                rankings: rankings,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布用户质押更新
    publishUserStakingUpdate(userData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.USER_STAKING_UPDATE, {
            userStakingUpdate: {
                address: userData.address,
                stakedAmount: userData.stakedAmount,
                levelId: userData.levelId,
                pendingRewards: userData.pendingRewards,
                totalClaimed: userData.totalClaimed,
                isLP: userData.isLP,
                staticRatio: userData.staticRatio,
                dynamicRatio: userData.dynamicRatio,
                lastUpdate: new Date().toISOString()
            }
        });
    }
    
    // 发布奖励分发事件
    publishRewardDistributed(rewardData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.REWARD_DISTRIBUTED, {
            rewardDistributed: {
                user: rewardData.user,
                type: rewardData.type,
                amount: rewardData.amount,
                txHash: rewardData.txHash,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布节点激活事件
    publishNodeActivated(nodeData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.NODE_ACTIVATED, {
            nodeActivated: {
                tokenId: nodeData.tokenId,
                owner: nodeData.owner,
                tier: nodeData.tier,
                computingPower: nodeData.computingPower || '1000',
                txHash: nodeData.txHash,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布团队升级事件
    publishTeamLevelUp(teamData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.TEAM_LEVEL_UP, {
            teamLevelUp: {
                user: teamData.user,
                oldLevel: teamData.oldLevel,
                newLevel: teamData.newLevel,
                teamVolume: teamData.teamVolume,
                directReferrals: teamData.directReferrals,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布燃烧事件
    publishBurnEvent(burnData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.BURN_EVENT, {
            burnEvent: {
                amount: burnData.amount,
                source: burnData.source,
                totalBurned: burnData.totalBurned,
                burnRate: burnData.burnRate,
                txHash: burnData.txHash,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布交易事件
    publishSwapExecuted(swapData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.SWAP_EXECUTED, {
            swapExecuted: {
                user: swapData.user,
                fromToken: swapData.fromToken,
                toToken: swapData.toToken,
                fromAmount: swapData.fromAmount,
                toAmount: swapData.toAmount,
                fee: swapData.fee || '0',
                txHash: swapData.txHash,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布TVL更新
    publishTVLUpdate(tvlData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.TVL_UPDATE, {
            tvlUpdate: {
                totalValueLocked: tvlData.totalValueLocked,
                hcfLocked: tvlData.hcfLocked,
                bsdtLocked: tvlData.bsdtLocked,
                lpTokens: tvlData.lpTokens,
                change24h: tvlData.change24h || 0,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    // 发布系统告警
    publishAlert(alertData) {
        pubsub.publish(SUBSCRIPTION_EVENTS.ALERT_TRIGGERED, {
            alertTriggered: {
                type: alertData.type,
                severity: alertData.severity,
                message: alertData.message,
                data: JSON.stringify(alertData.data || {}),
                timestamp: new Date().toISOString()
            }
        });
    }
}

// 创建发布者实例
const publisher = new SubscriptionPublisher();

// 集成到EventBridge
function integrateWithEventBridge(eventBridge) {
    // 监听EventBridge事件并发布到GraphQL订阅
    
    eventBridge.on('price:update', (data) => {
        publisher.publishPriceUpdate(data);
    });
    
    eventBridge.on('ranking:update', (data) => {
        publisher.publishRankingUpdate(data.rankings, data.type);
    });
    
    eventBridge.on('staking:update', (data) => {
        publisher.publishUserStakingUpdate(data);
    });
    
    eventBridge.on('reward:distributed', (data) => {
        publisher.publishRewardDistributed(data);
    });
    
    eventBridge.on('node:activated', (data) => {
        publisher.publishNodeActivated(data);
    });
    
    eventBridge.on('team:levelup', (data) => {
        publisher.publishTeamLevelUp(data);
    });
    
    eventBridge.on('burn:event', (data) => {
        publisher.publishBurnEvent(data);
    });
    
    eventBridge.on('swap:executed', (data) => {
        publisher.publishSwapExecuted(data);
    });
    
    eventBridge.on('tvl:update', (data) => {
        publisher.publishTVLUpdate(data);
    });
    
    eventBridge.on('alert:triggered', (data) => {
        publisher.publishAlert(data);
    });
}

// WebSocket处理器
class WebSocketHandler {
    constructor(io) {
        this.io = io;
        this.setupHandlers();
    }
    
    setupHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`New WebSocket connection: ${socket.id}`);
            
            // 用户认证
            socket.on('authenticate', async (data) => {
                const { address, signature } = data;
                
                // TODO: 验证签名
                const isValid = await this.verifySignature(address, signature);
                
                if (isValid) {
                    // 加入用户房间
                    socket.join(`user:${address}`);
                    socket.emit('authenticated', { success: true });
                    
                    // 发送初始数据
                    await this.sendInitialData(socket, address);
                } else {
                    socket.emit('authenticated', { success: false });
                }
            });
            
            // 订阅特定事件
            socket.on('subscribe', (events) => {
                events.forEach(event => {
                    socket.join(`event:${event}`);
                });
                socket.emit('subscribed', events);
            });
            
            // 取消订阅
            socket.on('unsubscribe', (events) => {
                events.forEach(event => {
                    socket.leave(`event:${event}`);
                });
                socket.emit('unsubscribed', events);
            });
            
            // 请求数据
            socket.on('request', async (data) => {
                const { type, params } = data;
                const response = await this.handleRequest(type, params);
                socket.emit('response', { type, data: response });
            });
            
            // 断开连接
            socket.on('disconnect', () => {
                console.log(`WebSocket disconnected: ${socket.id}`);
            });
        });
    }
    
    async verifySignature(address, signature) {
        // TODO: 实现签名验证
        return true;
    }
    
    async sendInitialData(socket, address) {
        // 发送用户初始数据
        const userData = await this.getUserData(address);
        socket.emit('initialData', userData);
    }
    
    async getUserData(address) {
        // TODO: 从数据库获取用户数据
        return {
            address,
            staking: {},
            referral: {},
            ranking: 0
        };
    }
    
    async handleRequest(type, params) {
        switch (type) {
            case 'getUserStats':
                return await this.getUserStats(params.address);
            case 'getRankings':
                return await this.getRankings(params.limit);
            case 'getPriceHistory':
                return await this.getPriceHistory(params.period);
            case 'getTVL':
                return await this.getTVL();
            default:
                return null;
        }
    }
    
    async getUserStats(address) {
        // TODO: 实现获取用户统计
        return {};
    }
    
    async getRankings(limit = 100) {
        // TODO: 实现获取排名
        return [];
    }
    
    async getPriceHistory(period = '24h') {
        // TODO: 实现获取价格历史
        return [];
    }
    
    async getTVL() {
        // TODO: 实现获取TVL
        return { tvl: '0' };
    }
    
    // 广播事件到特定房间
    broadcast(room, event, data) {
        this.io.to(room).emit(event, data);
    }
    
    // 广播到所有连接
    broadcastAll(event, data) {
        this.io.emit(event, data);
    }
}

module.exports = {
    typeDefs,
    resolvers,
    publisher,
    integrateWithEventBridge,
    WebSocketHandler,
    SUBSCRIPTION_EVENTS
};