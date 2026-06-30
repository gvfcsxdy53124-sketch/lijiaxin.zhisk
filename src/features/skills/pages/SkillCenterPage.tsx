import {useMemo, useState} from 'react';
import {Trash2} from 'lucide-react';
import {CURRENT_SKILL_USER, INITIAL_SKILL_EXECUTION_RECORDS, INITIAL_SKILLS} from '../data/skillMockData';
import {SkillDetailModal} from '../components/SkillDetailModal';
import {SkillEditModal} from '../components/SkillEditModal';
import {SkillExecutionRecordsView} from '../components/SkillExecutionRecordsView';
import {SkillExecutionView} from '../components/SkillExecutionView';
import {SkillLibraryView} from '../components/SkillLibraryView';
import {SkillManageView} from '../components/SkillManageView';
import {SkillUploadModal} from '../components/SkillUploadModal';
import {EmptyState} from '../components/SkillPrimitives';
import type {SkillEditForm, SkillExecutionRecord, SkillFeedbackValue, SkillItem, SkillManageTab, SkillViewMode, SkillWorkspace} from '../types';
import {
  applyEditForm,
  filterAddedSkills,
  filterCreatedSkills,
  filterPublishedSkills,
  getNextVersion,
  parseUploadedSkill,
  toEditForm,
  validateEditForm,
} from '../utils/skillRules';

interface SkillCenterPageProps {
  activePageKey: string;
  activePageLabel: string;
  onNotify?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

function RemoveConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-5 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">删除 Skill</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">确定要删除此 Skill 吗？删除后不可恢复。</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

export function SkillCenterPage({activePageKey, activePageLabel, onNotify}: SkillCenterPageProps) {
  const [skills, setSkills] = useState<SkillItem[]>(INITIAL_SKILLS);
  const [executionRecords, setExecutionRecords] = useState<SkillExecutionRecord[]>(INITIAL_SKILL_EXECUTION_RECORDS);
  const [workspace, setWorkspace] = useState<SkillWorkspace>('library');
  const [viewMode, setViewMode] = useState<SkillViewMode>('card');
  const [manageTab, setManageTab] = useState<SkillManageTab>('added');
  const [search, setSearch] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(6);
  const [managePage, setManagePage] = useState(1);
  const [managePageSize, setManagePageSize] = useState(6);
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [executingSkill, setExecutingSkill] = useState<SkillItem | null>(null);
  const [rerunInput, setRerunInput] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [updatingFileSkill, setUpdatingFileSkill] = useState<SkillItem | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [editForm, setEditForm] = useState<SkillEditForm>(toEditForm(null));
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof SkillEditForm, string>>>({});
  const [removeTarget, setRemoveTarget] = useState<SkillItem | null>(null);

  const notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => onNotify?.(type, message);

  const librarySkills = useMemo(() => filterPublishedSkills(skills, search), [skills, search]);
  const createdSkills = useMemo(() => filterCreatedSkills(skills, search), [skills, search]);
  const addedSkills = useMemo(() => filterAddedSkills(skills, search), [skills, search]);
  const visibleExecutionRecords = useMemo(() => {
    const skillMap = new Map(skills.map((skill) => [skill.id, skill]));
    const ownedRecords = CURRENT_SKILL_USER.role === '管理员'
      ? executionRecords
      : executionRecords.filter((record) => record.userId === CURRENT_SKILL_USER.id);
    return ownedRecords
      .filter((record) => skillMap.has(record.skillId))
      .map((record) => ({...record, skillName: skillMap.get(record.skillId)?.name || record.skillName}));
  }, [executionRecords, skills]);
  const activeManageSkills = manageTab === 'created' ? createdSkills : addedSkills;
  const safeLibraryPage = Math.min(libraryPage, Math.max(1, Math.ceil(librarySkills.length / libraryPageSize)));
  const safeManagePage = Math.min(managePage, Math.max(1, Math.ceil(activeManageSkills.length / managePageSize)));
  const paginatedLibrarySkills = useMemo(
    () => librarySkills.slice((safeLibraryPage - 1) * libraryPageSize, safeLibraryPage * libraryPageSize),
    [librarySkills, safeLibraryPage, libraryPageSize],
  );
  const paginatedCreatedSkills = useMemo(
    () => createdSkills.slice((safeManagePage - 1) * managePageSize, safeManagePage * managePageSize),
    [createdSkills, safeManagePage, managePageSize],
  );
  const paginatedAddedSkills = useMemo(
    () => addedSkills.slice((safeManagePage - 1) * managePageSize, safeManagePage * managePageSize),
    [addedSkills, safeManagePage, managePageSize],
  );

  const updateSearch = (value: string) => {
    setSearch(value);
    setLibraryPage(1);
    setManagePage(1);
  };

  const openUpload = () => {
    setUploadFileName('');
    setUpdatingFileSkill(null);
    setUploadOpen(true);
  };

  const openUpdateFile = (skill: SkillItem) => {
    setUploadFileName('');
    setUpdatingFileSkill(skill);
    setUploadOpen(true);
  };

  const parseUpload = () => {
    const name = uploadFileName.trim();
    if (!name) {
      notify('warning', '请选择 .zip 或 .skill 文件');
      return;
    }
    if (!/\.(zip|skill)$/i.test(name)) {
      notify('error', '仅支持 .zip 或 .skill 格式');
      return;
    }
    const parsedSkill = parseUploadedSkill(name);
    const targetSkill = updatingFileSkill ? {...updatingFileSkill, introduction: parsedSkill.introduction} : parsedSkill;
    const nextForm = toEditForm(targetSkill);
    setEditingSkill(targetSkill);
    setEditForm({
      ...nextForm,
      version: updatingFileSkill ? getNextVersion(updatingFileSkill.latestVersion) : nextForm.version,
      releaseNotes: updatingFileSkill
        ? '上传了新的 Skill 文件\n解析并更新了 SKILL.md 配置\n补充了本次版本说明'
        : nextForm.releaseNotes,
    });
    setEditErrors({});
    setUploadOpen(false);
    setUpdatingFileSkill(null);
    notify('success', 'SKILL.md 解析成功，请确认新版本信息');
  };

  const openEdit = (skill: SkillItem) => {
    setEditingSkill(skill);
    setEditForm(toEditForm(skill));
    setEditErrors({});
  };

  const downloadSkill = (skill: SkillItem) => {
    notify('success', `${skill.name} 下载已开始`);
  };

  const confirmPublish = () => {
    if (!editingSkill) return;
    const errors = validateEditForm(editForm);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify('error', '请完善必填信息');
      return;
    }

    const nextSkill = applyEditForm(editingSkill, editForm);
    setSkills((prev) => {
      const exists = prev.some((item) => item.id === nextSkill.id);
      return exists ? prev.map((item) => (item.id === nextSkill.id ? nextSkill : item)) : [nextSkill, ...prev];
    });
    setEditingSkill(null);
    setEditErrors({});
    notify('success', 'Skill 已保存，模板库已同步更新');
  };

  const useSkill = (skill: SkillItem) => {
    setDetailSkill(null);
    setExecutingSkill(skill);
    setRerunInput('');
    setWorkspace('execute');
  };

  const createExecutionRecord = (skill: SkillItem, input: string, output: string, durationSeconds: number) => {
    const record: SkillExecutionRecord = {
      id: `exec-${Date.now()}`,
      skillId: skill.id,
      skillName: skill.name,
      userId: CURRENT_SKILL_USER.id,
      userName: CURRENT_SKILL_USER.name,
      triggerSource: '对话调用',
      targetObject: skill.name,
      owner: CURRENT_SKILL_USER.name,
      input,
      output,
      status: 'success',
      durationSeconds,
      executedAt: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\//g, '-'),
    };
    setExecutionRecords((prev) => [record, ...prev]);
  };

  const submitExecutionFeedback = (recordId: string, value: SkillFeedbackValue, comment?: string) => {
    setExecutionRecords((prev) =>
      prev.map((record) =>
        record.id === recordId && !record.feedback
          ? {
              ...record,
              feedback: {
                value,
                comment: comment?.trim() || undefined,
                submittedAt: new Date().toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).replace(/\//g, '-'),
                submittedBy: CURRENT_SKILL_USER.id,
              },
            }
          : record,
      ),
    );
    notify('success', '反馈已保存');
  };

  const rerunExecutionRecord = (record: SkillExecutionRecord) => {
    const skill = skills.find((item) => item.id === record.skillId);
    if (!skill) {
      notify('error', '未找到对应 Skill，无法重新执行');
      return;
    }
    setExecutingSkill(skill);
    setRerunInput(record.input);
    setWorkspace('execute');
    notify('info', '已带入原输入，可重新执行');
  };

  if (activePageKey === 'executions') {
    return <SkillExecutionRecordsView records={visibleExecutionRecords} onSubmitFeedback={submitExecutionFeedback} onRerun={rerunExecutionRecord} />;
  }

  if (activePageKey !== 'templates') {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{activePageLabel}</h2>
          <p className="mt-1 text-sm text-slate-500">该页面已创建，后续可继续补充功能内容。</p>
        </div>
        <EmptyState title={activePageLabel} description="暂无内容" />
      </div>
    );
  }

  return (
    <>
      {workspace === 'library' && (
        <SkillLibraryView
          skills={paginatedLibrarySkills}
          search={search}
          viewMode={viewMode}
          onSearchChange={updateSearch}
          onViewModeChange={(mode) => {
            setViewMode(mode);
            setLibraryPage(1);
          }}
          onCreate={openUpload}
          onManage={() => {
            setWorkspace('manage');
            setSearch('');
            setManagePage(1);
          }}
          onOpenDetail={setDetailSkill}
          onUse={useSkill}
          pagination={{
            total: librarySkills.length,
            page: safeLibraryPage,
            pageSize: libraryPageSize,
            onPageChange: setLibraryPage,
            onPageSizeChange: (pageSize) => {
              setLibraryPageSize(pageSize);
              setLibraryPage(1);
            },
          }}
        />
      )}

      {workspace === 'manage' && (
        <SkillManageView
          createdSkills={paginatedCreatedSkills}
          addedSkills={paginatedAddedSkills}
          activeTab={manageTab}
          search={search}
          onBack={() => {
            setWorkspace('library');
            setSearch('');
            setLibraryPage(1);
          }}
          onTabChange={(tab) => {
            setManageTab(tab);
            setManagePage(1);
          }}
          onSearchChange={updateSearch}
          onCreate={openUpload}
          onEdit={openEdit}
          onUpdateFile={openUpdateFile}
          onDownload={downloadSkill}
          onRemove={setRemoveTarget}
          onOpenDetail={setDetailSkill}
          pagination={{
            total: activeManageSkills.length,
            page: safeManagePage,
            pageSize: managePageSize,
            onPageChange: setManagePage,
            onPageSizeChange: (pageSize) => {
              setManagePageSize(pageSize);
              setManagePage(1);
            },
          }}
        />
      )}

      {workspace === 'execute' && executingSkill && (
        <SkillExecutionView
          skill={executingSkill}
          onBack={() => {
            setWorkspace('library');
            setExecutingSkill(null);
            setRerunInput('');
          }}
          onNotify={notify}
          onExecuted={({input, output, durationSeconds}) => createExecutionRecord(executingSkill, input, output, durationSeconds)}
          initialInput={rerunInput}
        />
      )}

      <SkillDetailModal skill={detailSkill} onClose={() => setDetailSkill(null)} onUse={useSkill} />

      <SkillUploadModal
        open={uploadOpen}
        title={updatingFileSkill ? '更新 Skill 文件' : '上传技能'}
        fileName={uploadFileName}
        onFileNameChange={setUploadFileName}
        onClose={() => {
          setUploadOpen(false);
          setUpdatingFileSkill(null);
        }}
        onParse={parseUpload}
      />

      <SkillEditModal
        open={Boolean(editingSkill)}
        title={editingSkill && skills.some((item) => item.id === editingSkill.id) ? '请确认新版本信息' : '请确认新版本信息'}
        form={editForm}
        errors={editErrors}
        onChange={setEditForm}
        onCancel={() => setEditingSkill(null)}
        onConfirm={confirmPublish}
      />

      {removeTarget && (
        <RemoveConfirmDialog
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => {
            setSkills((prev) => prev.filter((item) => item.id !== removeTarget.id));
            setRemoveTarget(null);
            notify('success', 'Skill 已移除');
          }}
        />
      )}
    </>
  );
}
