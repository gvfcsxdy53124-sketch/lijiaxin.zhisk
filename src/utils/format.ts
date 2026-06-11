import type {KnowledgeStatus} from '@/types/domain';

export const statusText: Record<KnowledgeStatus, string> = {
  ready: '可用',
  processing: '处理中',
  error: '异常',
};

export const visibilityText = {
  public: '公开',
  private: '私有',
  restricted: '部分公开',
} as const;

export const numberFormatter = new Intl.NumberFormat('zh-CN');
