export type SkillStatus = '草稿' | '审核中' | '已发布' | '已停用';

export type SkillViewMode = 'card' | 'list';

export type SkillWorkspace = 'library' | 'manage' | 'execute';

export type SkillDetailTab = 'intro' | 'versions';

export type SkillManageTab = 'created' | 'added';

export type SkillExecutionStatus = 'success' | 'failed';

export type SkillFeedbackValue = 'useful' | 'useless';

export type SkillExecutionTimeFilter = '1d' | '7d' | 'all';

export interface SkillUser {
  id: string;
  name: string;
  avatar: string;
  role: '普通用户' | '管理员';
}

export interface SkillVersion {
  version: string;
  date: string;
  notes: string[];
}

export interface SkillEditForm {
  name: string;
  description: string;
  icon: string;
  tags: string[];
  tagInput: string;
  version: string;
  releaseNotes: string;
  promptLogic: string;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: SkillStatus;
  tags: string[];
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  addCount: number;
  updatedAt: string;
  latestVersion: string;
  introduction: {
    coreFeatures: Array<{title: string; description: string}>;
    scenarios: string[];
    promptLogic: string;
    examples: Array<{title: string; content: string}>;
  };
  versions: SkillVersion[];
  addedByCurrentUser: boolean;
}

export interface SkillExecutionFeedback {
  value: SkillFeedbackValue;
  comment?: string;
  submittedAt: string;
  submittedBy: string;
}

export interface SkillExecutionRecord {
  id: string;
  skillId: string;
  skillName: string;
  userId: string;
  userName: string;
  triggerSource: string;
  targetObject: string;
  owner: string;
  input: string;
  output: string;
  status: SkillExecutionStatus;
  durationSeconds: number;
  executedAt: string;
  errorMessage?: string;
  feedback?: SkillExecutionFeedback;
}
