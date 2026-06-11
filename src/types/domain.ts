export type AppModule = 'knowledge' | 'skills' | 'permissions';

export type KnowledgeStatus = 'ready' | 'processing' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  owner: string;
  category: string;
  visibility: 'public' | 'private' | 'restricted';
  status: KnowledgeStatus;
  documentCount: number;
  updatedAt: string;
  tags: string[];
}

export interface SkillTemplate {
  id: string;
  name: string;
  scenario: string;
  model: string;
  enabled: boolean;
  calls: number;
  successRate: number;
}

export interface PermissionUser {
  id: string;
  name: string;
  account: string;
  department: string;
  role: string;
  status: 'active' | 'disabled';
  lastLogin: string;
}

export interface PermissionRole {
  id: string;
  name: string;
  type: 'system' | 'custom';
  users: number;
  permissions: string[];
}
