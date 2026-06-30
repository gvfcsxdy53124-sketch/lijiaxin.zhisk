import {useMemo, useState} from 'react';
import {MessageSquare, RotateCcw, Search, ThumbsDown, ThumbsUp, X} from 'lucide-react';
import type {SkillExecutionRecord, SkillExecutionTimeFilter, SkillFeedbackValue} from '../types';
import {SkillPagination} from './SkillPagination';

interface SkillExecutionRecordsViewProps {
  records: SkillExecutionRecord[];
  onSubmitFeedback: (recordId: string, value: SkillFeedbackValue, comment?: string) => void;
  onRerun?: (record: SkillExecutionRecord) => void;
}

const timeFilters: Array<{value: SkillExecutionTimeFilter; label: string}> = [
  {value: '1d', label: '近1天'},
  {value: '7d', label: '近7天'},
  {value: 'all', label: '全部'},
];

const truncateText = (value: string, length = 30) => {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}...` : value;
};

const toTime = (value: string) => new Date(value.replace(/-/g, '/')).getTime();

const isInRange = (record: SkillExecutionRecord, filter: SkillExecutionTimeFilter) => {
  if (filter === 'all') return true;
  const days = filter === '1d' ? 1 : 7;
  return Date.now() - toTime(record.executedAt) <= days * 24 * 60 * 60 * 1000;
};

function FeedbackText({record}: {record: SkillExecutionRecord}) {
  if (!record.feedback) {
    return (
      <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-500">
        未反馈
      </span>
    );
  }
  return record.feedback.value === 'useful' ? (
    <span className="inline-flex h-7 items-center rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-600 ring-1 ring-inset ring-blue-100">
      有用
    </span>
  ) : (
    <span className="inline-flex h-7 items-center rounded-full bg-rose-50 px-3 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-100">
      待优化
    </span>
  );
}

function ExecutionDetailModal({
  record,
  onClose,
  onSubmitFeedback,
}: {
  record: SkillExecutionRecord;
  onClose: () => void;
  onSubmitFeedback: (recordId: string, value: SkillFeedbackValue, comment?: string) => void;
}) {
  const [feedbackValue, setFeedbackValue] = useState<SkillFeedbackValue | null>(record.feedback?.value || null);
  const [comment, setComment] = useState(record.feedback?.comment || '');
  const [showComment, setShowComment] = useState(record.feedback?.value === 'useless');
  const hasFeedback = Boolean(record.feedback);

  const submitFeedback = (value: SkillFeedbackValue) => {
    if (hasFeedback) return;
    setFeedbackValue(value);
    if (value === 'useless') {
      setShowComment(true);
      return;
    }
    onSubmitFeedback(record.id, value);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-6 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between border-b border-slate-100 px-7 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{record.skillName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {record.executedAt} · 耗时 {record.durationSeconds.toFixed(1)} 秒
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-2">
            <div>
              <span className="text-slate-400">触发来源：</span>
              <span className="font-medium text-slate-700">{record.triggerSource}</span>
            </div>
            <div>
              <span className="text-slate-400">处理对象：</span>
              <span className="font-medium text-slate-700">{record.targetObject}</span>
            </div>
            <div>
              <span className="text-slate-400">负责人：</span>
              <span className="font-medium text-slate-700">{record.owner}</span>
            </div>
            <div>
              <span className="text-slate-400">执行状态：</span>
              <span className={record.status === 'success' ? 'font-semibold text-blue-600' : 'font-semibold text-rose-600'}>
                {record.status === 'success' ? '成功' : '失败'}
              </span>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">完整输入</h3>
            <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{record.input}</div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">完整输出</h3>
            <div className="mt-3 min-h-[96px] rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {record.output || '暂无输出'}
            </div>
          </section>

          {record.status === 'failed' && (
            <section>
              <h3 className="text-sm font-semibold text-rose-600">错误信息</h3>
              <div className="mt-3 rounded-xl bg-rose-50 p-4 text-sm leading-7 text-rose-700">
                {record.errorMessage || '执行失败，暂无错误详情。'}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">本次反馈</h3>
                <p className="mt-1 text-xs text-slate-400">{hasFeedback ? '已反馈，不能重复提交。' : '请选择本次 Skill 执行结果是否有用。'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={hasFeedback}
                  onClick={() => submitFeedback('useful')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed ${
                    feedbackValue === 'useful' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400'
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  有用
                </button>
                <button
                  type="button"
                  disabled={hasFeedback}
                  onClick={() => submitFeedback('useless')}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed ${
                    feedbackValue === 'useless' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400'
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" />
                  没用
                </button>
              </div>
            </div>

            {showComment && !hasFeedback && (
              <div className="mt-4">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="请简要描述问题（选填）"
                  className="min-h-[96px] w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onSubmitFeedback(record.id, 'useless', comment)}
                    className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                  >
                    提交
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export function SkillExecutionRecordsView({records, onSubmitFeedback, onRerun}: SkillExecutionRecordsViewProps) {
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<SkillExecutionTimeFilter>('7d');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [selectedRecord, setSelectedRecord] = useState<SkillExecutionRecord | null>(null);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records
      .filter((record) => isInRange(record, timeFilter))
      .filter((record) => !keyword || record.skillName.toLowerCase().includes(keyword))
      .sort((a, b) => toTime(b.executedAt) - toTime(a.executedAt));
  }, [records, search, timeFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredRecords.length / pageSize)));
  const paginatedRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage, pageSize],
  );
  const latestSelectedRecord = selectedRecord ? records.find((record) => record.id === selectedRecord.id) || selectedRecord : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Skill 执行记录</h2>
            <p className="mt-1 text-sm text-slate-500">查看 Skill 调用历史、执行结果和单次反馈。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="按 Skill 名称搜索"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
            <div className="inline-flex h-10 rounded-lg border border-slate-200 bg-white p-1">
              {timeFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setTimeFilter(item.value);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 text-sm font-medium transition-all ${
                    timeFilter === item.value ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[1700px] pr-6">
          <div className="grid grid-cols-[170px_120px_150px_180px_180px_90px_80px_100px_150px_70px_230px] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            <div>Skill 名称</div>
            <div>触发来源</div>
            <div>处理对象</div>
            <div>输入摘要</div>
            <div>输出结果</div>
            <div>执行状态</div>
            <div>耗时</div>
            <div>负责人</div>
            <div>执行时间</div>
            <div>反馈</div>
            <div className="text-center">操作</div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-700">暂无执行记录</div>
                <div className="mt-1 text-xs text-slate-400">使用 Skill 后会自动生成记录。</div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginatedRecords.map((record) => (
                <div
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRecord(record);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="grid w-full cursor-pointer grid-cols-[170px_120px_150px_180px_180px_90px_80px_100px_150px_70px_230px] items-center gap-4 px-4 py-4 text-left text-sm transition-all hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <div className="truncate font-semibold text-slate-900">{record.skillName}</div>
                  <div className="truncate text-slate-600">{record.triggerSource}</div>
                  <div className="truncate text-slate-600">{record.targetObject}</div>
                  <div className="truncate text-slate-500">{truncateText(record.input)}</div>
                  <div className="truncate text-slate-500">{truncateText(record.output || record.errorMessage || '-')}</div>
                  <div>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        record.status === 'success' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {record.status === 'success' ? '成功' : '失败'}
                    </span>
                  </div>
                  <div className="text-slate-600">{record.durationSeconds.toFixed(1)} 秒</div>
                  <div className="truncate text-slate-600">{record.owner}</div>
                  <div className="text-slate-500">{record.executedAt}</div>
                  <div>
                    <FeedbackText record={record} />
                  </div>
                  <div className="flex min-w-0 items-center justify-center gap-2">
                    <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-blue-50 px-3 text-sm font-semibold text-blue-600">
                      查看详情
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRerun?.(record);
                      }}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-slate-50 px-3 text-sm font-semibold text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-600"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      重新执行
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SkillPagination
        total={filteredRecords.length}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      {latestSelectedRecord && (
        <ExecutionDetailModal
          record={latestSelectedRecord}
          onClose={() => setSelectedRecord(null)}
          onSubmitFeedback={onSubmitFeedback}
        />
      )}
    </div>
  );
}
