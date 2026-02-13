// Order Executor - Handles order execution on Bybit

import { getFullSymbol } from './config.js';

export class OrderExecutor {
    constructor(bybitAPI, tradingBot) {
        this.bybitAPI = bybitAPI;
        this.tradingBot = tradingBot;
        this.executingOrders = new Set(); // Track orders being executed to prevent duplicates
    }

    // Execute a buy order on Bybit
    async executeBuy(token, reason) {
        const symbol = getFullSymbol(token.symbol);
        
        // Check if already executing order for this symbol
        if (this.executingOrders.has(symbol)) {
            console.log(`Order already executing for ${symbol}`);
            return { success: false, message: 'Order already executing' };
        }

        this.executingOrders.add(symbol);

        try {
            // Calculate trade amount
            const tradeAmount = this.tradingBot.balance * 
                (this.tradingBot.config.tradeAmountPercent / 100);
            
            if (tradeAmount < this.tradingBot.config.minTradeAmount) {
                this.executingOrders.delete(symbol);
                return { success: false, message: 'Trade amount below minimum' };
            }

            // Calculate quantity (amount of token to buy)
            const quantity = (tradeAmount / token.currentPrice).toFixed(4);

            console.log(`Executing BUY order: ${symbol}, Qty: ${quantity}, Price: ~${token.currentPrice}`);

            // Place market buy order on Bybit
            const orderResult = await this.bybitAPI.placeOrder(symbol, 'Buy', quantity);

            if (orderResult.success) {
                // Execute buy in trading bot
                const botResult = this.tradingBot.buy(token, reason);
                
                if (botResult.success) {
                    console.log(`✅ BUY executed: ${symbol} at $${token.currentPrice}`);
                    this.executingOrders.delete(symbol);
                    return {
                        success: true,
                        trade: botResult.trade,
                        orderId: orderResult.orderId,
                    };
                } else {
                    console.error('Bot buy failed:', botResult.message);
                    this.executingOrders.delete(symbol);
                    return botResult;
                }
            } else {
                console.error('Bybit order failed:', orderResult.error);
                this.executingOrders.delete(symbol);
                return {
                    success: false,
                    message: `Bybit order failed: ${orderResult.error}`,
                };
            }
        } catch (error) {
            console.error('Error executing buy order:', error);
            this.executingOrders.delete(symbol);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    // Execute a sell order on Bybit
    async executeSell(token, reason) {
        const symbol = getFullSymbol(token.symbol);
        
        // Check if already executing order for this symbol
        if (this.executingOrders.has(symbol)) {
            console.log(`Order already executing for ${symbol}`);
            return { success: false, message: 'Order already executing' };
        }

        this.executingOrders.add(symbol);

        try {
            // Get position from bot
            const position = this.tradingBot.positions.get(token.symbol);
            
            if (!position) {
                this.executingOrders.delete(symbol);
                return { success: false, message: 'No position found' };
            }

            const quantity = position.amount.toFixed(4);

            console.log(`Executing SELL order: ${symbol}, Qty: ${quantity}, Price: ~${token.currentPrice}`);

            // Place market sell order on Bybit
            const orderResult = await this.bybitAPI.placeOrder(symbol, 'Sell', quantity);

            if (orderResult.success) {
                // Execute sell in trading bot
                const botResult = this.tradingBot.sell(token, reason);
                
                if (botResult.success) {
                    const profit = botResult.trade.profit;
                    const profitSymbol = profit >= 0 ? '📈' : '📉';
                    console.log(`✅ SELL executed: ${symbol} at $${token.currentPrice} ${profitSymbol} P/L: $${profit.toFixed(2)}`);
                    this.executingOrders.delete(symbol);
                    return {
                        success: true,
                        trade: botResult.trade,
                        orderId: orderResult.orderId,
                    };
                } else {
                    console.error('Bot sell failed:', botResult.message);
                    this.executingOrders.delete(symbol);
                    return botResult;
                }
            } else {
                console.error('Bybit order failed:', orderResult.error);
                this.executingOrders.delete(symbol);
                return {
                    success: false,
                    message: `Bybit order failed: ${orderResult.error}`,
                };
            }
        } catch (error) {
            console.error('Error executing sell order:', error);
            this.executingOrders.delete(symbol);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    // Execute a trade signal
    async executeSignal(signal) {
        if (signal.type === 'buy') {
            return await this.executeBuy(signal.token, signal.reason);
        } else if (signal.type === 'sell') {
            return await this.executeSell(signal.token, signal.reason);
        }
        
        return { success: false, message: 'Invalid signal type' };
    }

    // Process multiple signals
    async processSignals(signals) {
        const results = [];
        
        for (const signal of signals) {
            const result = await this.executeSignal(signal);
            results.push({
                signal,
                result,
            });
        }
        
        return results;
    }

    // Emergency close all positions
    async closeAllPositions(tokens) {
        console.log('🚨 Emergency closing all positions...');
        const results = [];
        
        for (const [symbol, position] of this.tradingBot.positions) {
            const token = tokens.find(t => t.symbol === symbol);
            
            if (token) {
                const result = await this.executeSell(token, 'Emergency close');
                results.push({
                    symbol,
                    result,
                });
            }
        }
        
        return results;
    }
}


