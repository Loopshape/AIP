
import type { ReactNode } from 'react';

export type AgentName = 'nexus' | 'cognito' | 'relay' | 'sentinel' | 'echo';

export interface Agent {
  name: AgentName;
  title: string;
  subtitle: string;
  // Fix: Use ReactNode to correctly type content that can be a string or JSX.
  content: ReactNode;
  hash: string;
  isReasoning: boolean;
}

export type UIMode = 'dashboard' | 'chat' | 'image-tools' | 'video-tools' | 'voice-assistant';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface UploadedFile {
    file: File;
    base64: string;
    mimeType: string;
}