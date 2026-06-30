import {useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {BookOpen, Eye, EyeOff, KeyRound, Lock, UserRound} from 'lucide-react';
import {
  PASSWORD_RULE_TEXT,
  findAuthUser,
  getUserPassword,
  isValidSixDigitPassword,
  setAuthSession,
  setUserPassword
} from '@/features/auth/authStorage';

type LoginMode = 'login' | 'changePassword';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<LoginMode>('login');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<{type: 'error' | 'success'; text: string} | null>(null);

  const redirectTo = (location.state as {from?: {pathname?: string}} | null)?.from?.pathname || '/knowledge';

  const resetPasswordFields = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleLogin = () => {
    const user = findAuthUser(identity);
    if (!user) {
      setMessage({type: 'error', text: '账号或手机号不存在'});
      return;
    }
    if (user.status !== '在职') {
      setMessage({type: 'error', text: '该账号已禁用，请联系管理员'});
      return;
    }
    if (password !== getUserPassword(user.id)) {
      setMessage({type: 'error', text: '密码错误，请重新输入'});
      return;
    }
    setAuthSession(user);
    navigate(redirectTo, {replace: true});
  };

  const handleChangePassword = () => {
    const user = findAuthUser(identity);
    if (!user) {
      setMessage({type: 'error', text: '请先输入正确的账号或手机号'});
      return;
    }
    if (oldPassword !== getUserPassword(user.id)) {
      setMessage({type: 'error', text: '原密码错误'});
      return;
    }
    if (!isValidSixDigitPassword(newPassword)) {
      setMessage({type: 'error', text: PASSWORD_RULE_TEXT});
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({type: 'error', text: '两次输入的新密码不一致'});
      return;
    }
    setUserPassword(user.id, newPassword);
    setPassword(newPassword);
    resetPasswordFields();
    setMode('login');
    setMessage({type: 'success', text: '密码修改成功，请使用新密码登录'});
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (mode === 'login') {
      handleLogin();
      return;
    }
    handleChangePassword();
  };

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setMessage(null);
    setPassword('');
    resetPasswordFields();
  };

  const PasswordToggleIcon = ({visible}: {visible: boolean}) =>
    visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">知识库系统</h1>
          <p className="mt-2 text-sm text-slate-500">{mode === 'login' ? '登录后进入知识库' : '修改登录密码'}</p>
        </div>

        <div className="space-y-5">
          <label className="block text-sm font-semibold text-slate-700">
            账号/手机号
            <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                placeholder="请输入账号/手机号"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          {mode === 'login' ? (
            <label className="block text-sm font-semibold text-slate-700">
              密码
              <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                <Lock className="h-4 w-4 text-slate-400" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  <PasswordToggleIcon visible={showPassword} />
                </button>
              </div>
            </label>
          ) : (
            <>
              <label className="block text-sm font-semibold text-slate-700">
                原密码
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    type={showOldPassword ? 'text' : 'password'}
                    placeholder="请输入原密码"
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(prev => !prev)}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showOldPassword ? '隐藏原密码' : '显示原密码'}
                  >
                    <PasswordToggleIcon visible={showOldPassword} />
                  </button>
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                新密码
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    type={showNewPassword ? 'text' : 'password'}
                    inputMode="numeric"
                    placeholder="请输入 6 位数字"
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(prev => !prev)}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showNewPassword ? '隐藏新密码' : '显示新密码'}
                  >
                    <PasswordToggleIcon visible={showNewPassword} />
                  </button>
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                确认新密码
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    type={showConfirmPassword ? 'text' : 'password'}
                    inputMode="numeric"
                    placeholder="请再次输入新密码"
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                  >
                    <PasswordToggleIcon visible={showConfirmPassword} />
                  </button>
                </div>
              </label>
            </>
          )}
        </div>

        {message && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {mode === 'login' ? '登录' : '确认修改'}
        </button>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'changePassword' : 'login')}
            className="font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            {mode === 'login' ? '修改密码' : '返回登录'}
          </button>
          {mode === 'changePassword' && <span className="text-slate-400">密码限制：6 位数字</span>}
        </div>
      </form>
    </main>
  );
}
