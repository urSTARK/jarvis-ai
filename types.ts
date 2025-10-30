
export enum Sender {
  User = 'user',
  AI = 'ai',
  System = 'system',
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: string;
  sources?: { uri: string; title: string }[];
  isPartial?: boolean;
}

// Fix: Add TaskStatus enum for task components
export enum TaskStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

// Fix: Add Task interface for task components
export interface Task {
  id: string;
  status: TaskStatus;
  description: string;
  result?: string;
}
