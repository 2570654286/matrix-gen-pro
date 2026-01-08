import React, { useState, useRef, useEffect } from 'react';
import { XIcon, CopyIcon, SearchIcon } from './Icons';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface LogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 模拟日志数据
  useEffect(() => {
    if (!isOpen) return;

    const mockLogs: LogEntry[] = [
      { id: '1', timestamp: '2026-01-08 13:32:05', level: 'info', message: '[System] Application started successfully' },
      { id: '2', timestamp: '2026-01-08 13:32:05', level: 'info', message: '[Plugin] Registered provider: Geeknow' },
      { id: '3', timestamp: '2026-01-08 13:32:05', level: 'info', message: '[Plugin] Registered provider: Grsai' },
      { id: '4', timestamp: '2026-01-08 13:32:10', level: 'success', message: '[API] Connection established (45ms)' },
      { id: '5', timestamp: '2026-01-08 13:32:15', level: 'info', message: '[Job] Created new job: 1702031520000-abc123def' },
      { id: '6', timestamp: '2026-01-08 13:32:16', level: 'info', message: '[Job] Job status changed: PENDING -> PROCESSING' },
      { id: '7', timestamp: '2026-01-08 13:32:18', level: 'warn', message: '[Network] Rate limit approaching, consider reducing concurrency' },
      { id: '8', timestamp: '2026-01-08 13:32:20', level: 'success', message: '[Job] Generation complete: Image_20260108_001.png' },
      { id: '9', timestamp: '2026-01-08 13:32:25', level: 'info', message: '[Plugin] Loading sora_2_0 model...' },
      { id: '10', timestamp: '2026-01-08 13:32:26', level: 'info', message: '[API] Request: POST /v1/video/generations' },
      { id: '11', timestamp: '2026-01-08 13:32:45', level: 'error', message: '[API] Request failed: 429 Too Many Requests' },
      { id: '12', timestamp: '2026-01-08 13:32:46', level: 'warn', message: '[Retry] Retrying request (attempt 2/3)...' },
      { id: '13', timestamp: '2026-01-08 13:33:05', level: 'success', message: '[Job] Video generated successfully: Video_20260108_001.mp4' },
    ];

    setLogs(mockLogs);
  }, [isOpen]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // 过滤日志
  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 复制所有日志
  const handleCopyAll = () => {
    const logText = logs.map(log => `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`).join('\n');
    navigator.clipboard.writeText(logText);
  };

  // 获取日志等级样式
  const getLevelStyle = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      default: return 'text-blue-400';
    }
  };

  // 获取日志等级背景色
  const getLevelBgStyle = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-500/10 border-red-500/20';
      case 'warn': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'success': return 'bg-green-500/10 border-green-500/20';
      default: return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-[90%] max-w-5xl h-[80%] bg-[#0a0a0a] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#0f0f0f] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="text-gray-400 font-mono text-xs">$</span>
                System Logs
              </h2>
            </div>
            <span className="text-xs text-gray-500 bg-[#1a1a1a] px-2 py-0.5 rounded border border-white/5">
              {logs.length} entries
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative group">
              <SearchIcon className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ctrl+F to search..."
                className="bg-[#1a1a1a] border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary w-48 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            
            {/* Copy All */}
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-border rounded-lg text-xs text-gray-400 hover:text-white transition-all"
              title="Copy all logs"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              Copy All
            </button>
            
            {/* Close */}
            <button 
              onClick={onClose} 
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors ml-1"
            >
              <XIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2 text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border bg-[#1a1a1a] text-primary cursor-pointer"
              />
              Auto-scroll
            </label>
            <span className="text-gray-700">|</span>
            <button 
              onClick={() => setLogs([])}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
          
          {/* Search result count */}
          {searchQuery && (
            <span className="text-xs text-gray-500">
              Found <span className="text-primary">{filteredLogs.length}</span> matches
            </span>
          )}
        </div>

        {/* Logs Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a]">
          <div className="p-4 font-mono text-xs space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-20 text-gray-600">
                {searchQuery ? 'No matches found' : 'No logs available'}
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div 
                  key={log.id}
                  className={`flex gap-3 p-1.5 rounded border ${getLevelBgStyle(log.level)} ${searchQuery ? 'animate-pulse-once' : ''}`}
                >
                  <span className="text-gray-600 shrink-0 select-none">{log.timestamp}</span>
                  <span className={`uppercase text-[10px] font-bold w-16 shrink-0 ${getLevelStyle(log.level)}`}>
                    [{log.level}]
                  </span>
                  <span className="text-gray-300 break-all whitespace-pre-wrap">
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="h-8 border-t border-white/5 bg-[#0f0f0f] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4 text-[10px] text-gray-600">
            <span>Ctrl+C: Copy selected line</span>
            <span>Ctrl+F: Search</span>
            <span>Esc: Close</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-[10px] text-gray-600">Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogsPanel;
