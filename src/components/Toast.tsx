import React, { useEffect, useState } from 'react';
import { CheckIcon, AlertIcon, XIcon } from './Icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);
  const duration = toast.duration || 3000;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300); // 等待动画完成
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onRemove]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-400',
          icon: 'text-green-500',
          iconBg: 'bg-green-500/20'
        };
      case 'error':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          icon: 'text-red-500',
          iconBg: 'bg-red-500/20'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          icon: 'text-yellow-500',
          iconBg: 'bg-yellow-500/20'
        };
      case 'info':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          text: 'text-blue-400',
          icon: 'text-blue-500',
          iconBg: 'bg-blue-500/20'
        };
    }
  };

  const styles = getToastStyles();
  
  // 根据类型选择图标
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckIcon className="w-5 h-5" />;
      case 'error':
      case 'warning':
        return <AlertIcon className="w-5 h-5" />;
      case 'info':
        return <AlertIcon className="w-5 h-5" />;
    }
  };

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3 rounded-xl
        ${styles.bg} ${styles.border} border backdrop-blur-xl
        shadow-2xl min-w-[320px] max-w-[420px]
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0 scale-95' : 'translate-x-0 opacity-100 scale-100'}
      `}
      style={{
        animation: !isExiting ? 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
      }}
    >
      {/* Icon */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
        ${styles.iconBg} ${styles.icon}
      `}>
        {getIcon()}
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${styles.text} leading-relaxed`}>
          {toast.message}
        </p>
      </div>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className={`
          flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center
          ${styles.text} hover:bg-white/10 transition-colors
          opacity-60 hover:opacity-100
        `}
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 rounded-b-xl overflow-hidden">
        <div
          className={`h-full ${styles.bg.replace('/10', '/50')}`}
          style={{
            width: isExiting ? '0%' : '100%',
            transition: isExiting ? 'width 0.3s ease-out' : 'none',
            animation: !isExiting ? `shrink ${duration}ms linear forwards` : undefined,
          }}
        />
      </div>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
};
