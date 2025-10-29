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

export enum TaskStatus {
  InProgress = 'in-progress',
  Completed = 'completed',
  Failed = 'failed',
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  result?: string;
  startTime: string;
}