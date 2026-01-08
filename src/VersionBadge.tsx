import { useState, useEffect } from 'react';
// 注意：Tauri v2 的引用路径
import { getVersion } from '@tauri-apps/api/app'; 

const VersionBadge = () => {
  const [version, setVersion] = useState<string>('Checking...');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const v = await getVersion();
        setVersion(`v${v}`);
      } catch (err) {
        console.error('Failed to get version:', err);
        // 如果在浏览器调试或者没权限，显示 Dev
        setVersion('v0.1.0 (Dev)'); 
      }
    };

    fetchVersion();
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      color: '#fff',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      pointerEvents: 'none', // 让鼠标穿透，不影响下方点击
      userSelect: 'none',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      {version}
    </div>
  );
};

export default VersionBadge;