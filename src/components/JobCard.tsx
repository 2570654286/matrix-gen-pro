import React from 'react';
import { Job, JobStatus, MediaType } from '../types';
import { PlayIcon, AlertIcon, CheckIcon, VideoIcon, ImageIcon } from './Icons';
import { cn } from '../lib/utils';

interface JobCardProps {
  job: Job;
  mediaType: MediaType;
  onClick: () => void;
  onRename: (id: string, newName: string) => void;
}

export const JobCard = ({ job, mediaType, onClick, onRename }: JobCardProps) => {
  const isVideo = mediaType === MediaType.VIDEO;

  return (
    <div 
      onClick={onClick}
      className={cn(
        'group relative aspect-square rounded-xl overflow-hidden border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:z-10 bg-[#0a0a0a]',
        {
          'border-white/10 hover:border-primary/50': job.status === JobStatus.COMPLETED,
          'border-primary/50 shadow-[0_0_15px_rgba(109,40,217,0.2)]': job.status === JobStatus.PROCESSING,
          'border-red-500/30 bg-red-500/5': job.status === JobStatus.FAILED,
          'border-white/5 bg-white/5 opacity-70': job.status === JobStatus.PENDING,
        }
      )}
    >
      {/* Thumbnail / Content */}
      {job.status === JobStatus.COMPLETED && job.resultUrl ? (
        isVideo ? (
          <video 
            src={job.resultUrl} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            muted
            loop
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          />
        ) : (
          <img 
            src={job.resultUrl} 
            alt="Result" 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
          />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          {job.status === JobStatus.FAILED ? (
            <AlertIcon className="w-8 h-8 text-red-500 mb-2" />
          ) : job.status === JobStatus.PROCESSING ? (
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2"></div>
          ) : (
            <div className="w-8 h-8 text-gray-700 mb-2 group-hover:text-gray-500 transition-colors">
               {isVideo ? <VideoIcon /> : <ImageIcon />}
            </div>
          )}
          
          <span className="text-[10px] font-mono text-gray-500 truncate w-full px-2">
            {job.status === JobStatus.PROCESSING ? `${job.progress || 0}%` : job.status}
          </span>
        </div>
      )}

      {/* Overlay Info */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end translate-y-2 group-hover:translate-y-0">
        <div className="flex items-center justify-between mb-1">
           <span className="text-[10px] font-bold text-white truncate flex-1 mr-2">
             {job.fileName || `Job ${job.id.slice(0,4)}`}
           </span>
           {job.status === JobStatus.COMPLETED && <CheckIcon className="w-3 h-3 text-green-500" />}
        </div>
        <p className="text-[9px] text-gray-400 line-clamp-2 leading-tight">
          {job.prompt}
        </p>
      </div>

      {/* Status Indicator (Top Right) */}
      <div className="absolute top-2 right-2">
         {job.status === JobStatus.PROCESSING && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
         )}
         {job.status === JobStatus.FAILED && (
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
         )}
      </div>
    </div>
  );
};