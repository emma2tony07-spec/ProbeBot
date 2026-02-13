// Trading Bot - Updated with peak-based profit taking logic

export class TradingBot {
    constructor(config = {}) {
        this.config = {
            initialBalance: config.initialBalance || 10000,
            buyThreshold: config.buyThreshold || 2, // Buy after 2% increase
            sellThreshold: config.sellThreshold || 3, // Sell after 3% drop from peak
            tradeAmountPercent: config.tradeAmountPercent || 25, // 25% of balance per trade
            minTradeAmount: config.minTradeAmount || 1, // Minimum $1 trade
            maxPositions: config.maxPositions || 4, // Maximum concurrent positions
        };
        
        this.balance = this.config.initialBalance;
        this.initialBalance = this.config.initialBalance;
        this.positions = new Map(); // Active positions
        this.monitoredTokens = new Map(); // Tokens being monitored
        this.tradeHistory = [];
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
        };
    }

    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }

    // Start monitoring a token
    monitorToken(token) {
        if (!this.monitoredTokens.has(token.symbol)) {
            this.monitoredTokens.set(token.symbol, {
                symbol: token.symbol,
                monitorStartPrice: token.currentPrice,
                highestPrice: token.currentPrice,
                lowestPrice: token.currentPrice,
            });
        }
    }

    // Update monitored token prices and check for buy/sell signals
    updateMonitoring(tokens) {
        const signals = [];

        tokens.forEach(token => {
            // Ensure token is being monitored
            this.monitorToken(token);
            
            const monitored = this.monitoredTokens.get(token.symbol);
            
            // Update highest and lowest prices
            if (token.currentPrice > monitored.highestPrice) {
                monitored.highestPrice = token.currentPrice;
            }
            if (token.currentPrice < monitored.lowestPrice) {
                monitored.lowestPrice = token.currentPrice;
            }

            // Check if we already have a position
            if (this.positions.has(token.symbol)) {
                // Check for sell signal - sell when price drops from peak
                const position = this.positions.get(token.symbol);
                
                // Update position peak if current price is higher
                if (token.currentPrice > position.peakPrice) {
                    position.peakPrice = token.currentPrice;
                }
                
                // Calculate drop from peak
                const dropFromPeak = ((position.peakPrice - token.currentPrice) / position.peakPrice) * 100;
                
                // Sell if dropped by sellThreshold % from peak
                if (dropFromPeak >= this.config.sellThreshold) {
                    signals.push({
                        type: 'sell',
                        token: token,
                        reason: `Price dropped ${dropFromPeak.toFixed(2)}% from peak $${position.peakPrice.toFixed(2)}`,
                    });
                }
            } else {
                // Check for buy signal (price increased from lowest)
                const increaseFromLowest = ((token.currentPrice - monitored.lowestPrice) / monitored.lowestPrice) * 100;
                
                // Only buy if we haven't reached max positions
                if (increaseFromLowest >= this.config.buyThreshold && 
                    this.positions.size < this.config.maxPositions) {
                    signals.push({
                        type: 'buy',
                        token: token,
                        reason: `Price increased ${increaseFromLowest.toFixed(2)}% from low`,
                    });
                }
            }
        });

        return signals;
    }

    // Execute buy order
    buy(token, reason) {
        // Check if max positions reached
        if (this.positions.size >= this.config.maxPositions) {
            return { success: false, message: 'Maximum positions reached' };
        }

        const tradeAmount = this.balance * (this.config.tradeAmountPercent / 100);
        
        if (this.balance < tradeAmount || tradeAmount < this.config.minTradeAmount) {
            return { success: false, message: 'Insufficient balance' };
        }

        const amount = tradeAmount / token.currentPrice;
        
        this.positions.set(token.symbol, {
            symbol: token.symbol,
            amount: amount,
            buyPrice: token.currentPrice,
            peakPrice: token.currentPrice, // Initialize peak at buy price
            buyTime: new Date(),
        });

        this.balance -= tradeAmount;
        
        const trade = {
            id: Date.now(),
            type: 'buy',
            symbol: token.symbol,
            price: token.currentPrice,
            amount: amount,
            total: tradeAmount,
            time: new Date(),
            reason: reason,
        };

        this.tradeHistory.unshift(trade);
        this.stats.totalTrades++;

        // Reset monitoring for this token
        const monitored = this.monitoredTokens.get(token.symbol);
        if (monitored) {
            monitored.lowestPrice = token.currentPrice;
            monitored.highestPrice = token.currentPrice;
        }

        return { success: true, trade };
    }

    // Execute sell order
    sell(token, reason) {
        const position = this.positions.get(token.symbol);
        
        if (!position) {
            return { success: false, message: 'No position found' };
        }

        const sellValue = position.amount * token.currentPrice;
        const profit = sellValue - (position.amount * position.buyPrice);
        const profitPercent = (profit / (position.amount * position.buyPrice)) * 100;

        this.balance += sellValue;
        this.positions.delete(token.symbol);

        const trade = {
            id: Date.now(),
            type: 'sell',
            symbol: token.symbol,
            price: token.currentPrice,
            amount: position.amount,
            total: sellValue,
            buyPrice: position.buyPrice,
            peakPrice: position.peakPrice,
            profit: profit,
            profitPercent: profitPercent,
            time: new Date(),
            reason: reason,
        };

        this.tradeHistory.unshift(trade);
        this.stats.totalTrades++;
        
        if (profit > 0) {
            this.stats.winningTrades++;
        } else {
            this.stats.losingTrades++;
        }

        // Reset monitoring for this token
        const monitored = this.monitoredTokens.get(token.symbol);
        if (monitored) {
            monitored.lowestPrice = token.currentPrice;
            monitored.highestPrice = token.currentPrice;
        }

        return { success: true, trade };
    }

    // Get current portfolio value
    getTotalValue(tokens) {
        let positionsValue = 0;
        
        this.positions.forEach(position => {
            const token = tokens.find(t => t.symbol === position.symbol);
            if (token) {
                positionsValue += position.amount * token.currentPrice;
            }
        });

        return this.balance + positionsValue;
    }

    // Get profit/loss
    getProfitLoss(tokens) {
        return this.getTotalValue(tokens) - this.initialBalance;
    }

    // Get ROI
    getROI(tokens) {
        return ((this.getTotalValue(tokens) - this.initialBalance) / this.initialBalance) * 100;
    }

    // Get win rate
    getWinRate() {
        if (this.stats.totalTrades === 0) return 0;
        return (this.stats.winningTrades / this.stats.totalTrades) * 100;
    }

    // Reset bot
    reset() {
        this.balance = this.config.initialBalance;
        this.initialBalance = this.config.initialBalance;
        this.positions.clear();
        this.monitoredTokens.clear();
        this.tradeHistory = [];
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
        };
    }

    // Get all positions with current values
    getPositionsWithValue(tokens) {
        const positions = [];
        
        this.positions.forEach(position => {
            const token = tokens.find(t => t.symbol === position.symbol);
            if (token) {
                const currentValue = position.amount * token.currentPrice;
                const profit = currentValue - (position.amount * position.buyPrice);
                const profitPercent = (profit / (position.amount * position.buyPrice)) * 100;
                const dropFromPeak = ((position.peakPrice - token.currentPrice) / position.peakPrice) * 100;
                
                positions.push({
                    ...position,
                    currentPrice: token.currentPrice,
                    currentValue: currentValue,
                    profit: profit,
                    profitPercent: profitPercent,
                    dropFromPeak: dropFromPeak,
                });
            }
        });

        return positions;
    }

    // Get available balance for trading
    getAvailableBalance() {
        return this.balance;
    }

    // Check if can open new position
    canOpenPosition() {
        return this.positions.size < this.config.maxPositions;
    }
}


