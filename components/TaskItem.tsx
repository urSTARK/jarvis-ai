
import React from 'react';
import type { Task } from '../types';
import { TaskStatus } from '../types';

interface TaskItemProps {
  task: Task;
}

const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const getStatusIndicator = () => {
    switch (task.status) {
      case TaskStatus.InProgress:
        return (
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-400 animate-spin"></div>
            <span className="text-red-400 text-sm">Running...</span>
          </div>
        );
      case TaskStatus.Completed:
        return (
            <div className="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400 text-sm">Done</span>
            </div>
        );
      case TaskStatus.Failed:
        return (
             <div className="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-red-400 text-sm">Failed</span>
            </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-3 bg-slate-700/70 rounded-md flex justify-between items-center">
      <p className="text-slate-200">{task.description}</p>
      {getStatusIndicator()}
    </div>
  );
};

export default TaskItem;