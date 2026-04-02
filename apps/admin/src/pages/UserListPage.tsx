/**
 * 用户管理列表页
 *
 * 功能说明：
 * - 用户列表展示（表格形式）
 * - 分页查询（支持页码切换）
 * - 搜索过滤（前端过滤用户名、手机号）
 * - 用户管理操作：
 *   - 新增用户
 *   - 编辑用户信息
 *   - 重置密码
 *   - 启用/禁用用户
 *
 * UI 组件：
 * - shadcn/ui Table：用户列表表格
 * - shadcn/ui Dialog：新增/编辑弹窗
 * - shadcn/ui DropdownMenu：操作菜单
 * - shadcn/ui Badge：角色/状态标签
 * - shadcn/ui Avatar：用户头像
 * - shadcn/ui Skeleton：加载骨架屏
 * - Toast：操作反馈
 */
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import type { UserListItem, Department } from '@fullstack/shared';
import {
  Plus,
  MoreVertical,
  Pencil,
  KeyRound,
  UserCheck,
  UserX,
  Search,
  Trash2,
} from 'lucide-react';

/**
 * 用户列表响应类型
 */
interface UserListResponse {
  items: UserListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export default function UserListPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    phone: '',
    departmentId: '',
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const initialized = useRef(false);
  const prevPage = useRef(page);

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get<UserListResponse>(`/admin/users?page=${page}&pageSize=10`);
      setUsers(response.items);
      setTotal(response.meta.total);
    } catch {
      toast({
        title: '获取用户列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载或页码变化时获取数据
  // 使用 useRef 防止 StrictMode 下重复请求
  useEffect(() => {
    // 如果是 StrictMode 的第二次调用且参数没变，跳过
    if (initialized.current && prevPage.current === page) {
      return;
    }
    initialized.current = true;
    prevPage.current = page;
    fetchUsers();
    fetchDepartments();
  }, [page, toast]);

  // 获取部门列表
  const fetchDepartments = async () => {
    try {
      const response = await api.get<Department[]>('/departments');
      setDepartments(response);
    } catch {
      // 静默失败，部门列表为可选
    }
  };

  /**
   * 新增用户 - 打开弹窗
   */
  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ username: '', phone: '', departmentId: '' });
    setModalOpen(true);
  };

  /**
   * 编辑用户 - 打开弹窗并回填数据
   */
  const handleEdit = (record: UserListItem) => {
    setEditingUser(record);
    setFormData({
      username: record.username,
      phone: record.phone,
      departmentId: record.department?.id || '',
    });
    setModalOpen(true);
  };

  /**
   * 重置密码
   *
   * 调用 API：POST /api/admin/users/:id/reset-password
   * 返回默认密码并显示给用户
   */
  const handleResetPassword = async (id: string) => {
    try {
      const response = await api.post<{ success: boolean; defaultPassword: string }>(
        `/admin/users/${id}/reset-password`,
        {},
      );
      toast({
        title: '密码已重置',
        description: `新密码：${response.defaultPassword}`,
      });
    } catch {
      toast({
        title: '重置密码失败',
        variant: 'destructive',
      });
    }
  };

  /**
   * 更新用户状态
   *
   * 调用 API：PATCH /api/admin/users/:id/status
   * 成功后刷新列表
   */
  const handleStatusChange = async (id: string, status: 'active' | 'disabled') => {
    try {
      await api.patch(`/admin/users/${id}/status`, { status });
      toast({
        title: status === 'disabled' ? '已禁用用户' : '已启用用户',
      });
      fetchUsers();
    } catch {
      toast({
        title: '更新状态失败',
        variant: 'destructive',
      });
    }
  };

  /**
   * 删除用户
   *
   * 调用 API：DELETE /api/admin/users/:id
   * 只有停用的用户才能删除
   * 删除前需要二次确认
   */
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个用户吗？此操作不可恢复！')) {
      return;
    }
    try {
      await api.delete(`/admin/users/${id}`);
      toast({ title: '用户已删除' });
      fetchUsers();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '删除失败';
      toast({
        title: msg,
        variant: 'destructive',
      });
    }
  };

  /**
   * 新增/编辑用户确认
   *
   * 编辑时调用 PATCH，新增时调用 POST
   * 成功后刷新列表并关闭弹窗
   */
  const handleModalOk = async () => {
    try {
      if (editingUser) {
        await api.patch(`/admin/users/${editingUser.id}`, formData);
        toast({ title: '更新成功' });
      } else {
        await api.post('/admin/users', formData);
        toast({ title: '创建成功' });
      }
      setModalOpen(false);
      fetchUsers();
    } catch {
      toast({
        title: '操作失败',
        variant: 'destructive',
      });
    }
  };

  // 前端搜索过滤（根据关键词过滤用户名、手机号）
  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm),
  );

  return (
    <div className="space-y-6">
      <Toaster />

      <PageHeader
        title="用户管理"
        description="统一管理后台用户信息、部门归属和登录状态，页面延续轻卡片 + 低压迫感的 AI SaaS 后台视觉。"
        actions={
          <Button onClick={handleAdd} className="gap-2 rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
            <Plus className="w-4 h-4" />
            新增用户
          </Button>
        }
      />

      <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索用户名或手机号..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead>用户</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近登录</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      暂无用户数据
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white text-sm font-medium">
                              {user.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{user.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{user.phone}</TableCell>
                      <TableCell>
                        {user.department ? (
                          <Badge variant="outline">{user.department.name}</Badge>
                        ) : (
                          <span className="text-gray-400">未分配</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? '管理员' : '普通用户'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'outline' : 'secondary'}>
                          <span className={user.status === 'active' ? 'text-green-600' : 'text-gray-600'}>
                            {user.status === 'active' ? '● 正常' : '● 禁用'}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString('zh-CN')
                          : '从未登录'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(user)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              重置密码
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(user.id, user.status === 'active' ? 'disabled' : 'active')
                              }
                            >
                              {user.status === 'active' ? (
                                <>
                                  <UserX className="w-4 h-4 mr-2" />
                                  禁用
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  启用
                                </>
                              )}
                            </DropdownMenuItem>
                            {user.status === 'disabled' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(user.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  删除
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {/* 分页 */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-500">
              共 <span className="font-medium">{total}</span> 条记录
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm text-gray-500 min-w-[80px] text-center">
                第 {page} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 10 >= total}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 编辑/新增对话框 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-[24px] border-slate-200/80 p-0">
          <DialogHeader>
            <DialogTitle className="border-b border-slate-100 px-6 py-5">
              {editingUser ? '编辑用户' : '新增用户'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={!!editingUser}  // 编辑时用户名不可修改
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={!!editingUser}  // 编辑时手机号不可修改
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department">部门</Label>
              <Select
                value={formData.departmentId}
                onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
              >
                <SelectTrigger className="h-10 rounded-2xl border-slate-200 bg-slate-50/70 px-4 shadow-none focus:ring-blue-200">
                  <SelectValue placeholder="选择部门" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200">
                  {departments?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 px-6 py-5">
            <Button variant="outline" className="rounded-2xl" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button className="rounded-2xl bg-[#3B82F6] hover:bg-blue-600" onClick={handleModalOk}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
