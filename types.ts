
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

// Fix: Add missing Task and TaskStatus types to resolve import errors.
export enum TaskStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  startTime: string;
  result?: string;
}
