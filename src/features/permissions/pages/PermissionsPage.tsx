import {Badge} from '@/components/ui/Badge';
import {permissionRoles, permissionUsers} from '@/constants/mockData';

export function PermissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Access Control</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">权限管理</h2>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">成员</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">姓名</th>
                <th className="px-5 py-3">账号</th>
                <th className="px-5 py-3">部门</th>
                <th className="px-5 py-3">角色</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">最近登录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {permissionUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-4 font-medium text-slate-950">{user.name}</td>
                  <td className="px-5 py-4 text-slate-600">{user.account}</td>
                  <td className="px-5 py-4 text-slate-600">{user.department}</td>
                  <td className="px-5 py-4 text-slate-600">{user.role}</td>
                  <td className="px-5 py-4">
                    <Badge variant={user.status === 'active' ? 'success' : 'danger'}>
                      {user.status === 'active' ? '在职' : '已禁用'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{user.lastLogin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {permissionRoles.map((role) => (
          <article key={role.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-950">{role.name}</h3>
              <Badge variant={role.type === 'system' ? 'info' : 'neutral'}>{role.type === 'system' ? '系统' : '自定义'}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{role.users} 名成员</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {role.permissions.map((permission) => (
                <Badge key={permission}>{permission}</Badge>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
