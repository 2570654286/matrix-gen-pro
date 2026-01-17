import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { soundManager } from '../utils/soundManager';

const SoundToggle = () => {
  const [muted, setMuted] = useState(soundManager.isMuted());

  const handleToggle = () => {
    soundManager.toggleMute();
    setMuted(soundManager.isMuted());
  };

  return (
    <button
      onClick={handleToggle}
      className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
      title={muted ? "开启 完成提示音" : "关闭 完成提示音"}
    >
      {muted ? <BellOff className="w-5 h-5 text-gray-400" /> : <Bell className="w-5 h-5 text-gray-400" />}
    </button>
  );
};

export default SoundToggle;