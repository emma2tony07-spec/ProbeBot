// UI Module - Handles all UI rendering and updates

export class UI {
    constructor(app) {
        this.app = app;
        this.initializeEventListeners();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Setup form
        document.getElementById('setupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = document.getElementById('apiKey').value;
            const apiSecret = document.getElementById('apiSecret').value;
            
            const success = await this.app.initialize(apiKey, apiSecret);
            
            if (success) {
                document.getElementById('setupSection').style.display = 'none';
                document.getElementById('mainSection').style.display = 'block';
            }
        });

        // Bot controls
        document.getElementById('startBtn').addEventListener('click', () => this.app.start());
        document.getElementById('pauseBtn').addEventListener('click', () => this.app.pause());
        document.getElementById('resumeBtn').addEventListener('click', () => this.app.resume());
        document.getElementById('stopBtn').addEventListener('click', () => this.app.stop());
        document.getElementById('emergencyBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to close all positions?')) {
                this.app.emergencyStop();
            }
        });
        document.getElementById('resetBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the bot?')) {
                this.app.reset();
            }
        });

        // Config form
        document.getElementById('configForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const config = {
                buyThreshold: parseFloat(document.getElementById('buyThreshold').value),
                sellThreshold: parseFloat(document.getElementById('sellThreshold').value),
                tradeAmountPercent: parseFloat(document.getElementById('tradeAmount').value),
            };
            this.app.updateConfig(config);
        });
    }

    // Show status message
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('statusMessage');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status-message';
        }, 5000);
    }

    // Update bot status indicator
    updateBotStatus(status) {
        const indicator = document.getElementById('botStatus');
        const statusText = document.getElementById('botStatusText');
        
        indicator.className = `status-indicator ${status}`;
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        // Show/hide control buttons based on status
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const resumeBtn = document.getElementById('resumeBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (status === 'stopped') {
            startBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
            stopBtn.style.display = 'none';
        } else if (status === 'running') {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
            resumeBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        } else if (status === 'paused') {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-block';
            stopBtn.style.display = 'inline-block';
        }
    }

    // Update balance display
    updateBalance(balance) {
        document.getElementById('balance').textContent = `$${balance.toFixed(2)}`;
    }

    // Update statistics
    updateStats(bot, tokens) {
        const totalValue = bot.getTotalValue(tokens);
        const profitLoss = bot.getProfitLoss(tokens);
        const roi = bot.getROI(tokens);
        const winRate = bot.getWinRate();

        document.getElementById('totalValue').textContent = `$${totalValue.toFixed(2)}`;
        document.getElementById('profitLoss').textContent = `$${profitLoss.toFixed(2)}`;
        document.getElementById('profitLoss').className = profitLoss >= 0 ? 'profit' : 'loss';
        document.getElementById('roi').textContent = `${roi.toFixed(2)}%`;
        document.getElementById('roi').className = roi >= 0 ? 'profit' : 'loss';
        document.getElementById('openPositions').textContent = bot.positions.size;
        document.getElementById('totalTrades').textContent = bot.stats.totalTrades;
        document.getElementById('winRate').textContent = `${winRate.toFixed(1)}%`;
    }

    // Update positions table
    updatePositions(positions) {
        const tbody = document.getElementById('positionsBody');
        
        if (positions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">No open positions</td></tr>';
            return;
        }

        tbody.innerHTML = positions.map(pos => `
            <tr>
                <td><span class="token-badge">${pos.symbol}</span></td>
                <td>$${pos.buyPrice.toFixed(2)}</td>
                <td>$${pos.currentPrice.toFixed(2)}</td>
                <td>$${pos.peakPrice.toFixed(2)}</td>
                <td class="${pos.profitPercent >= 0 ? 'profit' : 'loss'}">
                    ${pos.profitPercent >= 0 ? '+' : ''}${pos.profitPercent.toFixed(2)}%
                </td>
                <td>${pos.dropFromPeak.toFixed(2)}%</td>
                <td class="${pos.profit >= 0 ? 'profit' : 'loss'}">
                    $${pos.profit.toFixed(2)}
                </td>
            </tr>
        `).join('');
    }

    // Update monitored tokens list
    updateTokensList(tokens) {
        const container = document.getElementById('tokensList');
        
        if (tokens.length === 0) {
            container.innerHTML = '<div class="no-data">No tokens monitored</div>';
            return;
        }

        container.innerHTML = tokens.map(token => `
            <div class="token-card">
                <div class="token-header">
                    <span class="token-symbol">${token.symbol}</span>
                    ${token.isStatic ? '<span class="badge static">Static</span>' : ''}
                    ${token.isTopGainer ? '<span class="badge gainer">Top Gainer</span>' : ''}
                </div>
                <div class="token-price">$${token.price.toFixed(2)}</div>
                <div class="token-change ${parseFloat(token.change) >= 0 ? 'profit' : 'loss'}">
                    ${parseFloat(token.change) >= 0 ? '+' : ''}${token.change}%
                </div>
            </div>
        `).join('');
    }

    // Update trade history
    updateTradeHistory(trades) {
        const tbody = document.getElementById('historyBody');
        
        if (trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">No trade history</td></tr>';
            return;
        }

        // Show only last 10 trades
        const recentTrades = trades.slice(0, 10);

        tbody.innerHTML = recentTrades.map(trade => `
            <tr>
                <td><span class="badge ${trade.type === 'buy' ? 'buy' : 'sell'}">${trade.type.toUpperCase()}</span></td>
                <td><span class="token-badge">${trade.symbol}</span></td>
                <td>$${trade.price.toFixed(2)}</td>
                <td>${trade.amount.toFixed(4)}</td>
                <td>$${trade.total.toFixed(2)}</td>
                <td class="${trade.profit ? (trade.profit >= 0 ? 'profit' : 'loss') : ''}">
                    ${trade.profit ? `$${trade.profit.toFixed(2)}` : '-'}
                </td>
                <td class="trade-time">${this.formatTime(trade.time)}</td>
            </tr>
        `).join('');
    }

    // Format time for display
    formatTime(date) {
        return new Date(date).toLocaleTimeString();
    }

    // Reset UI
    reset() {
        document.getElementById('positionsBody').innerHTML = '<tr><td colspan="7" class="no-data">No open positions</td></tr>';
        document.getElementById('historyBody').innerHTML = '<tr><td colspan="7" class="no-data">No trade history</td></tr>';
        this.updateBotStatus('stopped');
    }
}
