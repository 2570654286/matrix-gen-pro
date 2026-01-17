import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css'; // 记得引入样式！
import { ErrorBoundary } from './components/ErrorBoundary';
import { logger } from './services/logger';

// Global Console Interceptor Setup
// Save original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Override console methods to capture logs
console.log = (...args: any[]) => {
  originalConsoleLog(...args); // Keep original behavior for DevTools
  logger.info(...args);
};

console.warn = (...args: any[]) => {
  originalConsoleWarn(...args);
  logger.warn(...args);
};

console.error = (...args: any[]) => {
  originalConsoleError(...args);
  logger.error(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <BrowserRouter>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
);