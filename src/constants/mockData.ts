import type {KnowledgeBase, PermissionRole, PermissionUser, SkillTemplate} from '@/types/domain';

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: 'KB-001',
    name: '产品设计规范',
    description: '沉淀交互原则、视觉规范、组件使用说明和可访问性要求。',
    owner: '产品体验部',
    category: '设计文档',
    visibility: 'restricted',
    status: 'ready',
    documentCount: 128,
    updatedAt: '2026-06-10 18:20',
    tags: ['设计系统', '规范', 'UI'],
  },
  {
    id: 'KB-002',
    name: '研发工程手册',
    description: '统一前端、后端、测试、发布与代码评审标准。',
    owner: '技术平台部',
    category: '技术文档',
    visibility: 'private',
    status: 'processing',
    documentCount: 94,
    updatedAt: '2026-06-09 21:15',
    tags: ['工程规范', 'DevOps', '安全'],
  },
  {
    id: 'KB-003',
    name: '客户成功 FAQ',
    description: '客户实施、售后服务、常见问题和标准答复话术。',
    owner: '客户成功部',
    category: 'FAQ',
    visibility: 'public',
    status: 'ready',
    documentCount: 312,
    updatedAt: '2026-06-08 11:05',
    tags: ['客服', 'SOP', '知识运营'],
  },
  {
    id: 'KB-004',
    name: '安全合规资料库',
    description: '覆盖账号安全、数据分级、审计记录和合规要求。',
    owner: '安全合规部',
    category: '合规制度',
    visibility: 'private',
    status: 'error',
    documentCount: 47,
    updatedAt: '2026-06-07 09:40',
    tags: ['权限', '审计', '合规'],
  },
];

export const skillTemplates: SkillTemplate[] = [
  {id: 'SK-001', name: '知识库问答', scenario: '基于指定知识库回答业务问题', model: 'GPT-4.1', enabled: true, calls: 12840, successRate: 97.8},
  {id: 'SK-002', name: '文档摘要', scenario: '提炼长文档要点与行动项', model: 'GPT-4.1 mini', enabled: true, calls: 6420, successRate: 96.2},
  {id: 'SK-003', name: '工单分类', scenario: '自动识别咨询类型并分派团队', model: 'GPT-4.1 mini', enabled: false, calls: 2176, successRate: 91.4},
];

export const permissionUsers: PermissionUser[] = [
  {id: 'U-001', name: '张明', account: 'zhangming', department: '技术平台部', role: '系统管理员', status: 'active', lastLogin: '2026-06-11 09:12'},
  {id: 'U-002', name: '李雨', account: 'liyu', department: '产品体验部', role: '知识库管理员', status: 'active', lastLogin: '2026-06-10 17:48'},
  {id: 'U-003', name: '王一博', account: 'wangyibo', department: '客户成功部', role: '普通成员', status: 'active', lastLogin: '2026-06-09 14:25'},
  {id: 'U-004', name: '赵琳', account: 'zhaolin', department: '安全合规部', role: '审计员', status: 'disabled', lastLogin: '2026-05-28 10:03'},
];

export const permissionRoles: PermissionRole[] = [
  {id: 'R-001', name: '系统管理员', type: 'system', users: 2, permissions: ['系统配置', '成员管理', '角色管理', '全部知识库']},
  {id: 'R-002', name: '知识库管理员', type: 'system', users: 8, permissions: ['知识库新建', '文档上传', '权限配置']},
  {id: 'R-003', name: '审计员', type: 'custom', users: 3, permissions: ['审计日志', '只读访问']},
];
