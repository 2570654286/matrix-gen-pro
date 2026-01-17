import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { LogEntry, LogLevel } from '../services/logger';

export const LogMonitorPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(new Set(['info', 'warn', 'error', 'success']));
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);


  // Load logs from localStorage on mount
  useEffect(() => {
    try {
      const storedLogs = JSON.parse(localStorage.getItem('matrix-logs') || '[]');
      setLogs(storedLogs);
    } catch (error) {
      console.error('Failed to load logs from localStorage:', error);
    }
  }, []);

  // Listen for storage changes (when logs are added)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'matrix-logs' && e.newValue) {
        try {
          const storedLogs = JSON.parse(e.newValue);
          setLogs(storedLogs);
        } catch (error) {
          console.error('Failed to parse logs from storage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Filter logs based on search and level filters
  useEffect(() => {
    let filtered = logs;

    // Filter by selected levels
    filtered = filtered.filter(log => selectedLevels.has(log.level));

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(term) ||
        log.level.toLowerCase().includes(term)
      );
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, selectedLevels]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  useEffect(() => {
    console.log('[LogMonitorPage] Setting up log listener');
    const unlistenPromise = listen<LogEntry>('log-message', (event) => {
      console.log('[LogMonitorPage] Received log:', event.payload);
      setLogs(prev => [...prev, event.payload]);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const toggleLevel = (level: LogLevel) => {
    const newSelected = new Set(selectedLevels);
    if (newSelected.has(level)) {
      newSelected.delete(level);
    } else {
      newSelected.add(level);
    }
    setSelectedLevels(newSelected);
  };

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem('matrix-logs');
  };

  const copyLogToClipboard = async (log: LogEntry) => {
    const logText = `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${log.details ? '\nDetails: ' + JSON.stringify(log.details, null, 2) : ''}`;
    try {
      await navigator.clipboard.writeText(logText);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy log to clipboard:', error);
    }
  };

  const copyAllFilteredLogs = async () => {
    const allLogsText = filteredLogs.map(log =>
      `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${log.details ? '\nDetails: ' + JSON.stringify(log.details, null, 2) : ''}`
    ).join('\n\n');
    try {
      await navigator.clipboard.writeText(allLogsText);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy logs to clipboard:', error);
    }
  };



  const getLogColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'warn': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'info': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'success': return 'text-green-400 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error': return '🔴';
      case 'warn': return '🟡';
      case 'info': return '🔵';
      case 'success': return '🟢';
      default: return '⚪';
    }
  };



  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-gray-200 font-mono flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0f0f0f] shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white">日志监视器</h2>
          <span className="text-sm text-gray-400">总共 {logs.length} 条日志</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={copyAllFilteredLogs}
            className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded text-sm transition-colors"
          >
            复制所有日志
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded text-sm transition-colors"
          >
            清空日志
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            自动滚动
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-white/5 bg-[#0e0e0e] shrink-0">
        <div className="flex items-center gap-6">
          {/* Level Filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 mr-2">级别:</span>
            {(['info', 'warn', 'error', 'success'] as LogLevel[]).map(level => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                  selectedLevels.has(level)
                    ? getLogColor(level) + ' border-current'
                    : 'text-gray-500 border-gray-600 hover:border-gray-500'
                }`}
              >
                {getLevelIcon(level)} {level.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="搜索日志..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#1a1a1a] border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-4xl mb-4">📄</div>
              <p>暂无日志</p>
              <p className="text-sm mt-1">操作应用时日志会出现在这里</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded border text-sm font-mono leading-relaxed relative group ${getLogColor(log.level)}`}
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => copyLogToClipboard(log)}
                    className="p-1 bg-black/50 hover:bg-black/70 rounded text-xs text-white"
                    title="复制此日志"
                  >
                    📋
                  </button>
                </div>
                <div className="flex items-start gap-3 pr-8">
                  <span className="text-xs text-gray-500 font-mono min-w-[140px] select-none">
                    {log.timestamp}
                  </span>
                  <span className="text-xs font-bold uppercase min-w-[60px] select-none">
                    {log.level}
                  </span>
                  <span className="flex-1 break-all select-text">
                    {log.message}
                  </span>
                </div>
                {log.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300 select-none">
                      显示详情
                    </summary>
                    <pre className="mt-1 p-2 bg-black/30 rounded text-xs overflow-x-auto border border-white/10 select-text whitespace-pre-wrap">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};