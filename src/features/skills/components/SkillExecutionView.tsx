import {useState} from 'react';
import {ChevronLeft, Play, RotateCcw} from 'lucide-react';
import type {SkillItem} from '../types';

interface SkillExecutionViewProps {
  skill: SkillItem;
  onBack: () => void;
  onNotify?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onExecuted?: (payload: {input: string; output: string; durationSeconds: number}) => void;
  initialInput?: string;
}

export function SkillExecutionView({skill, onBack, onNotify, onExecuted, initialInput = ''}: SkillExecutionViewProps) {
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);

  const run = () => {
    if (!input.trim()) {
      onNotify?.('warning', '请输入运行内容');
      return;
    }
    setRunning(true);
    const startedAt = Date.now();
    window.setTimeout(() => {
      const nextResult = [
        `Skill：${skill.name}`,
        '',
        '运行结果：',
        `已根据「${skill.description}」完成处理。`,
        `输出遵循 Prompt 逻辑：${skill.introduction.promptLogic}`,
      ].join('\n');
      setResult(nextResult);
      setRunning(false);
      onExecuted?.({
        input: input.trim(),
        output: nextResult,
        durationSeconds: Math.max(0.1, (Date.now() - startedAt) / 1000),
      });
      onNotify?.('success', 'Skill 执行完成');
    }, 700);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-all hover:text-blue-600"
        >
          <ChevronLeft className="h-4 w-4" />
          返回模板库
        </button>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-3xl">{skill.icon}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{skill.name}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{skill.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">输入内容</h3>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="请输入要交给 Skill 处理的内容"
            className="mt-4 min-h-[260px] w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setInput('');
                setResult('');
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </button>
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              <Play className="h-4 w-4" />
              {running ? '运行中' : '运行 Skill'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">运行结果</h3>
          <div className="mt-4 min-h-[260px] rounded-xl bg-slate-50 p-4">
            {result ? <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{result}</pre> : <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">暂无结果</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
