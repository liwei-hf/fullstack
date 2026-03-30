/**
 * 用户管理列表页
 *
 * 功能说明：
 * - 用户列表展示（表格形式）
 * - 分页查询（支持页码切换）
 * - 搜索过滤（前端过滤用户名、手机号、昵称）
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
import { useState, useEffect } from 'react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import type { UserListItem } from '@fullstack/shared';
import {
  Plus,
  MoreVertical,
  Pencil,
  KeyRound,
  UserCheck,
  UserX,
  Search,
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
    nickname: '',
  });

  /**
   * 获取用户列表
   *
   * 调用 API：GET /api/admin/users?page=1&pageSize=10
   */
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
  useEffect(() => {
    fetchUsers();
  }, [page]);

  /**
   * 新增用户 - 打开弹窗
   */
  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ username: '', phone: '', nickname: '' });
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
      nickname: record.nickname,
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
        title: status === 'active' ? '用户已启用' : '用户已禁用',
      });
      fetchUsers();
    } catch {
      toast({
        title: '操作失败',
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

  // 前端搜索过滤（根据关键词过滤用户名、手机号、昵称）
  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm) ||
      user.nickname.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <Toaster />

      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
          <p className="text-muted-foreground mt-1">
            管理系统用户，包括创建、编辑和权限控制
          </p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          新增用户
        </Button>
      </div>

      {/* 搜索和过滤 */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索用户名、手机号或昵称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
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
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近登录</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
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
                              {user.nickname?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{user.nickname}</div>
                            <div className="text-sm text-gray-500">@{user.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{user.phone}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? '编辑用户' : '新增用户'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleModalOk}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
