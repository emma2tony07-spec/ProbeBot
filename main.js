// Main entry point for the trading bot application

import { App } from './app.js';

// Initialize the application
const app = new App();

// Make app available globally for debugging (optional)
window.tradingBot = app;

console.log('Trading Bot initialized');
console.log('Available commands:');
console.log('- window.tradingBot.getState() - Get current bot state');
console.log('- window.tradingBot.start() - Start the bot');
console.log('- window.tradingBot.stop() - Stop the bot');
console.log('- window.tradingBot.pause() - Pause the bot');
console.log('- window.tradingBot.resume() - Resume the bot');


