import React from 'react';
import type { Task } from '../types';
import TaskItem from './TaskItem';

interface TaskListProps {
  tasks: Task[];
}

const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  return (
    <div 
      className="absolute top-20 right-4 w-80 h-[calc(100vh-10rem)] bg-slate-900/30 border border-slate-700/50 backdrop-blur-sm rounded-lg flex flex-col overflow-hidden transition-all duration-300 z-20"
      aria-labelledby="task-list-heading"
    >
      <div className="p-4 border-b border-slate-700/50">
        <h2 id="task-list-heading" className="text-sm font-light tracking-widest text-slate-300 uppercase text-center">
          Task Queue
        </h2>
      </div>
      {tasks.length > 0 ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {tasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-slate-500 italic">No active tasks.</p>
        </div>
      )}
    </div>
  );
};

export default TaskList;