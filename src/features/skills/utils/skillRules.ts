import {CURRENT_SKILL_USER, EMPTY_SKILL_EDIT_FORM} from '../data/skillMockData';
import type {SkillEditForm, SkillItem, SkillUser} from '../types';

export const isAdmin = (user: SkillUser) => user.role === '管理员';

export const formatAddCount = (count: number) => {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
};

export const nowText = () =>
  new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\//g, '-');

export const filterPublishedSkills = (skills: SkillItem[], keyword: string) => {
  const text = keyword.trim().toLowerCase();
  return skills.filter((skill) => {
    if (skill.status !== '已发布') return false;
    if (!text) return true;
    return [skill.name, skill.description, skill.creatorName, skill.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
};

export const filterCreatedSkills = (skills: SkillItem[], keyword: string) => {
  const text = keyword.trim().toLowerCase();
  return skills.filter((skill) => {
    const owned = skill.creatorId === CURRENT_SKILL_USER.id;
    if (!owned) return false;
    if (!text) return true;
    return [skill.name, skill.description, skill.creatorName, skill.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
};

export const filterAddedSkills = (skills: SkillItem[], keyword: string) => {
  const text = keyword.trim().toLowerCase();
  return skills.filter((skill) => {
    if (skill.status !== '已发布') return false;
    if (!text) return true;
    return [skill.name, skill.description, skill.creatorName, skill.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
};

export const toEditForm = (skill?: SkillItem | null): SkillEditForm => {
  if (!skill) return {...EMPTY_SKILL_EDIT_FORM};
  return {
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    tags: [...skill.tags],
    tagInput: '',
    version: skill.latestVersion,
    releaseNotes: skill.versions[0]?.notes.join('\n') || '',
    promptLogic: skill.introduction.promptLogic,
  };
};

export const validateEditForm = (form: SkillEditForm) => {
  const errors: Partial<Record<keyof SkillEditForm, string>> = {};
  if (!form.name.trim()) errors.name = '请输入 Skill 名称';
  if (!form.description.trim()) errors.description = '请输入一句话描述';
  if (!form.icon.trim()) errors.icon = '请输入图标';
  if (!form.version.trim()) errors.version = '请输入技能版本号';
  if (!form.releaseNotes.trim()) errors.releaseNotes = '请输入更新日志';
  if (!form.promptLogic.trim()) errors.promptLogic = '请输入 Prompt 逻辑';
  return errors;
};

export const applyEditForm = (skill: SkillItem, form: SkillEditForm): SkillItem => {
  const nextVersion = normalizeVersion(form.version);
  const notes = form.releaseNotes
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const nextVersionRecord = {
    version: nextVersion,
    date: nowText().slice(0, 10),
    notes: notes.length > 0 ? notes : ['更新 Skill 配置信息'],
  };
  const hasSameVersion = skill.versions.some((version) => version.version === nextVersion);

  return {
    ...skill,
    name: form.name.trim(),
    description: form.description.trim(),
    icon: form.icon.trim() || '✨',
    tags: form.tags.map((item) => item.trim()).filter(Boolean),
    status: '已发布',
    updatedAt: nowText(),
    latestVersion: nextVersion,
    introduction: {
      ...skill.introduction,
      promptLogic: form.promptLogic.trim(),
    },
    versions: hasSameVersion
      ? skill.versions.map((version) => (version.version === nextVersion ? nextVersionRecord : version))
      : [nextVersionRecord, ...skill.versions],
  };
};

export const parseUploadedSkill = (fileName: string): SkillItem => {
  const now = nowText();
  const baseName = fileName.replace(/\.(zip|skill)$/i, '').replace(/[-_]/g, ' ') || '新上传 Skill';
  return {
    id: `skill-${Date.now()}`,
    name: baseName,
    description: '从 SKILL.md 解析得到的 Skill，确认发布前可继续编辑名称、描述、图标、标签和更新日志。',
    icon: '✨',
    status: '已发布',
    tags: ['上传', '自定义'],
    creatorId: CURRENT_SKILL_USER.id,
    creatorName: CURRENT_SKILL_USER.name,
    creatorAvatar: CURRENT_SKILL_USER.avatar,
    addCount: 0,
    updatedAt: now,
    latestVersion: 'V1.0.0',
    addedByCurrentUser: false,
    introduction: {
      coreFeatures: [
        {
          title: 'SKILL.md 读取',
          description: '系统会在上传的压缩包中查找 SKILL.md，并优先读取其中的 YAML 元信息、技能名称、描述和正文说明。',
        },
        {
          title: 'Markdown 正文解析',
          description: '解析正文中的使用场景、能力边界、输入输出要求和 Prompt 逻辑，生成可在详情页展示的 Skill 介绍内容。',
        },
        {
          title: '发布前确认',
          description: '解析结果不会立即入库，用户需要在编辑确认弹窗中检查名称、描述、图标、标签和更新日志后再发布。',
        },
      ],
      scenarios: ['企业内部 Skill 发布', '个人 Skill 沉淀复用'],
      promptLogic: '根据 SKILL.md 中的角色、任务、约束和输出格式解析 Skill 的执行逻辑。',
      examples: [{title: '上传 Skill 包', content: '上传包含 SKILL.md 的 .zip 或 .skill 文件。'}],
    },
    versions: [
      {version: 'V1.0.0', date: now.slice(0, 10), notes: ['通过 Skill 包上传创建', '解析 SKILL.md 并生成首个发布版本']},
    ],
  };
};

const bumpVersion = (version: string) => {
  const match = version.match(/^V(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return 'V1.0.0';
  const [, major, minor, patch] = match;
  return `V${major}.${minor}.${Number(patch) + 1}`;
};

export const getNextVersion = (version: string) => bumpVersion(version);

const normalizeVersion = (version: string) => {
  const value = version.trim();
  if (!value) return 'V1.0.0';
  return value.toUpperCase().startsWith('V') ? value : `V${value}`;
};
