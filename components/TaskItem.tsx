import React from 'react';
import { Task, TaskStatus } from '../types';

const StatusIcon: React.FC<{ status: TaskStatus }> = ({ status }) => {
  switch (status) {
    case TaskStatus.InProgress:
      return (
        <svg className="h-5 w-5 text-blue-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    case TaskStatus.Completed:
      return (
        <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case TaskStatus.Failed:
      return (
        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
};


const TaskItem: React.FC<{ task: Task }> = ({ task }) => {
  return (
    <div className="flex items-start space-x-3 p-3 border-b border-slate-700/50 last:border-b-0">
      <div className="flex-shrink-0 pt-1">
        <StatusIcon status={task.status} />
      </div>
      <div className="flex-1">
        <p className="text-sm text-slate-200">{task.description}</p>
        {task.result && task.status !== TaskStatus.InProgress && (
            <p className="text-xs text-slate-400 mt-1 truncate">
                Result: {task.result}
            </p>
        )}
      </div>
    </div>
  );
};

export default TaskItem;