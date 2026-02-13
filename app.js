// Main App Controller - Orchestrates the entire trading bot

import { CONFIG } from './config.js';
import { BybitAPI } from './bybitAPI.js';
import { TradingBot } from './tradingBot.js';
import { MarketData } from './marketData.js';
import { OrderExecutor } from './orderExecutor.js';
import { UI } from './ui.js';

export class App {
    constructor() {
        this.bybitAPI = new BybitAPI();
        this.tradingBot = new TradingBot(CONFIG.TRADING);
        this.marketData = new MarketData(this.bybitAPI);
        this.orderExecutor = new OrderExecutor(this.bybitAPI, this.tradingBot);
        this.ui = new UI(this);
        
        this.isRunning = false;
        this.isPaused = false;
        this.updateInterval = null;
        this.topGainersInterval = null;
    }

    // Initialize the application
    async initialize(apiKey, apiSecret) {
        try {
            this.ui.showStatus('Initializing...', 'info');
            
            // Set API credentials
            this.bybitAPI.setCredentials(apiKey, apiSecret);
            CONFIG.BYBIT.API_KEY = apiKey;
            CONFIG.BYBIT.API_SECRET = apiSecret;

            // Test API connection by getting balance
            this.ui.showStatus('Testing API connection...', 'info');
            const balance = await this.bybitAPI.getBalance();
            
            if (balance.total === 0 && balance.available === 0) {
                throw new Error('Could not retrieve balance. Check API credentials.');
            }

            // Update bot with actual balance
            this.tradingBot.config.initialBalance = balance.available;
            this.tradingBot.balance = balance.available;
            this.tradingBot.initialBalance = balance.available;

            // Initialize market data
            this.ui.showStatus('Fetching market data...', 'info');
            await this.marketData.initialize();

            // Initialize WebSocket for real-time prices
            this.ui.showStatus('Connecting to price feed...', 'info');
            const symbols = this.marketData.getMonitoredSymbols();
            this.bybitAPI.initWebSocket(symbols, (symbol, price) => {
                this.marketData.updatePrice(symbol, price);
            });

            this.ui.showStatus('Bot initialized successfully!', 'success');
            this.ui.updateBalance(balance.available);
            
            return true;
        } catch (error) {
            this.ui.showStatus(`Initialization failed: ${error.message}`, 'error');
            console.error('Initialization error:', error);
            return false;
        }
    }

    // Start the trading bot
    async start() {
        if (this.isRunning) {
            console.log('Bot is already running');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.ui.updateBotStatus('running');
        this.ui.showStatus('Bot started', 'success');

        // Start main update loop
        this.updateInterval = setInterval(() => {
            if (!this.isPaused) {
                this.update();
            }
        }, CONFIG.INTERVALS.PRICE_UPDATE);

        // Start top gainers refresh loop
        this.topGainersInterval = setInterval(async () => {
            if (!this.isPaused && this.marketData.shouldRefreshTopGainers()) {
                await this.marketData.refreshTopGainers();
                this.ui.showStatus('Top gainers refreshed', 'info');
            }
        }, CONFIG.TOP_GAINERS.REFRESH_INTERVAL);
    }

    // Pause the trading bot
    pause() {
        this.isPaused = true;
        this.ui.updateBotStatus('paused');
        this.ui.showStatus('Bot paused', 'warning');
    }

    // Resume the trading bot
    resume() {
        this.isPaused = false;
        this.ui.updateBotStatus('running');
        this.ui.showStatus('Bot resumed', 'success');
    }

    // Stop the trading bot
    stop() {
        this.isRunning = false;
        this.isPaused = false;
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.topGainersInterval) {
            clearInterval(this.topGainersInterval);
            this.topGainersInterval = null;
        }

        this.ui.updateBotStatus('stopped');
        this.ui.showStatus('Bot stopped', 'info');
    }

    // Main update loop
    async update() {
        try {
            // Get all monitored tokens with current prices
            const tokensData = this.marketData.getAllTokensData();
            
            // Update monitoring and get trade signals
            const signals = this.tradingBot.updateMonitoring(tokensData);

            // Execute trade signals
            if (signals.length > 0) {
                for (const signal of signals) {
                    console.log(`Signal detected: ${signal.type.toUpperCase()} ${signal.token.symbol} - ${signal.reason}`);
                    await this.orderExecutor.executeSignal(signal);
                }
            }

            // Update UI
            this.ui.updatePositions(this.tradingBot.getPositionsWithValue(tokensData));
            this.ui.updateTokensList(this.marketData.getFormattedTokenList());
            this.ui.updateStats(this.tradingBot, tokensData);
            this.ui.updateTradeHistory(this.tradingBot.tradeHistory);
            
        } catch (error) {
            console.error('Update error:', error);
        }
    }

    // Update trading configuration
    updateConfig(config) {
        this.tradingBot.updateConfig(config);
        this.ui.showStatus('Configuration updated', 'success');
    }

    // Emergency stop - close all positions
    async emergencyStop() {
        this.ui.showStatus('Emergency stop initiated!', 'warning');
        this.pause();
        
        const tokensData = this.marketData.getAllTokensData();
        await this.orderExecutor.closeAllPositions(tokensData);
        
        this.stop();
        this.ui.showStatus('All positions closed', 'success');
    }

    // Reset the bot
    reset() {
        this.stop();
        this.tradingBot.reset();
        this.ui.reset();
        this.ui.showStatus('Bot reset', 'info');
    }

    // Get current bot state
    getState() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            balance: this.tradingBot.balance,
            positions: this.tradingBot.positions.size,
            totalTrades: this.tradingBot.stats.totalTrades,
        };
    }
}
