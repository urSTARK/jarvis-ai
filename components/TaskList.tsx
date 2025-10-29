
import React from 'react';
import type { Task } from '../types';
import { TaskStatus } from '../types';
import TaskItem from './TaskItem';

interface TaskListProps {
  tasks: Task[];
}

const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  if (tasks.length === 0) {
    return null;
  }
  
  const inProgressTasks = tasks.filter(t => t.status === TaskStatus.InProgress);
  const completedTasks = tasks.filter(t => t.status !== TaskStatus.InProgress);

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-slate-800/50 rounded-lg shadow-lg backdrop-blur-sm mt-4">
      <h2 className="text-lg font-bold text-cyan-300 mb-3 border-b border-slate-600 pb-2">Task Monitor</h2>
      {inProgressTasks.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-slate-300 mb-2">In Progress</h3>
          <div className="space-y-2">
            {inProgressTasks.map(task => <TaskItem key={task.id} task={task} />)}
          </div>
        </div>
      )}
      {completedTasks.length > 0 && inProgressTasks.length > 0 && <div className="my-4 border-t border-slate-700"></div>}
      {completedTasks.length > 0 && (
        <div>
           <h3 className="text-md font-semibold text-slate-300 mb-2">Completed</h3>
           <div className="space-y-2">
            {completedTasks.map(task => <TaskItem key={task.id} task={task} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskList;
