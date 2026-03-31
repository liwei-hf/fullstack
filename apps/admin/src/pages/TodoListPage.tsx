/**
 * 任务管理列表页
 *
 * 功能说明：
 * - 任务列表展示（表格形式）
 * - 分页查询（支持页码切换）
 * - 状态筛选（待办/进行中/已完成）
 * - 任务管理操作：
 *   - 新增任务
 *   - 编辑任务信息
 *   - 更新任务状态
 *   - 删除任务
 *
 * UI 组件：
 * - shadcn/ui Table：任务列表表格
 * - shadcn/ui Dialog：新增/编辑弹窗
 * - shadcn/ui DropdownMenu：操作菜单
 * - shadcn/ui Badge：状态标签
 * - shadcn/ui Select：状态下拉选择
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
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Circle,
  Search,
} from 'lucide-react';

/**
 * Todo 任务类型定义
 * 对应后端 Todo 实体和共享类型
 */
interface Todo {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  createdAt: string;
  updatedAt: string;
}

/**
 * 任务列表响应类型
 */
interface TodoListResponse {
  items: Todo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/**
 * 状态标签配置
 * 用于显示不同状态的标签样式和文案
 */
const STATUS_CONFIG = {
  TODO: { label: '待办', variant: 'secondary' as const, icon: Circle },
  IN_PROGRESS: { label: '进行中', variant: 'default' as const, icon: Clock },
  DONE: { label: '已完成', variant: 'outline' as const, icon: CheckCircle2 },
};

export default function TodoListPage() {
  const { toast } = useToast();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
  });
  const initialized = useRef(false);
  const prevPage = useRef(page);
  const prevStatusFilter = useRef(statusFilter);

  // 获取任务列表
  const fetchTodos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });
      const response = await api.get<TodoListResponse>(`/todos?${params}`);
      setTodos(response.items);
      setTotal(response.meta.total);
    } catch {
      toast({
        title: '获取任务列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载或页码/状态变化时获取数据
  // 使用 useRef 防止 StrictMode 下重复请求
  useEffect(() => {
    // 如果是 StrictMode 的第二次调用且参数没变，跳过
    if (initialized.current && prevPage.current === page && prevStatusFilter.current === statusFilter) {
      return;
    }
    initialized.current = true;
    prevPage.current = page;
    prevStatusFilter.current = statusFilter;
    fetchTodos();
  }, [page, statusFilter, toast]);

  /**
   * 新增任务 - 打开弹窗
   */
  const handleAdd = () => {
    setEditingTodo(null);
    setFormData({ title: '', description: '' });
    setModalOpen(true);
  };

  /**
   * 编辑任务 - 打开弹窗并回填数据
   */
  const handleEdit = (record: Todo) => {
    setEditingTodo(record);
    setFormData({
      title: record.title,
      description: record.description || '',
    });
    setModalOpen(true);
  };

  /**
   * 更新任务状态
   *
   * 调用 API：PATCH /api/todos/:id/status
   * 成功后刷新列表
   */
  const handleStatusChange = async (id: string, status: 'TODO' | 'IN_PROGRESS' | 'DONE') => {
    try {
      await api.patch(`/todos/${id}/status`, { status });
      toast({
        title: STATUS_CONFIG[status].label,
      });
      fetchTodos();
    } catch {
      toast({
        title: '更新状态失败',
        variant: 'destructive',
      });
    }
  };

  /**
   * 删除任务
   *
   * 调用 API：DELETE /api/todos/:id
   * 删除前需要二次确认
   */
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个任务吗？此操作不可恢复。')) {
      return;
    }
    try {
      await api.delete(`/todos/${id}`);
      toast({ title: '任务已删除' });
      fetchTodos();
    } catch {
      toast({
        title: '删除任务失败',
        variant: 'destructive',
      });
    }
  };

  /**
   * 新增/编辑任务确认
   *
   * 编辑时调用 PATCH，新增时调用 POST
   * 成功后刷新列表并关闭弹窗
   */
  const handleModalOk = async () => {
    if (!formData.title.trim()) {
      toast({
        title: '任务标题不能为空',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingTodo) {
        await api.patch(`/todos/${editingTodo.id}`, formData);
        toast({ title: '更新成功' });
      } else {
        await api.post('/todos', formData);
        toast({ title: '创建成功' });
      }
      setModalOpen(false);
      fetchTodos();
    } catch {
      toast({
        title: '操作失败',
        variant: 'destructive',
      });
    }
  };

  /**
   * 前端搜索过滤
   * 根据关键词过滤任务标题和描述
   */
  const filteredTodos = todos.filter(
    (todo) =>
      todo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (todo.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-6">
      <Toaster />

      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">任务管理</h2>
          <p className="text-muted-foreground mt-1">
            管理个人任务，跟踪待办事项和进度
          </p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          新增任务
        </Button>
      </div>

      {/* 搜索和状态筛选 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索任务标题或描述..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="TODO">待办</SelectItem>
                <SelectItem value="IN_PROGRESS">进行中</SelectItem>
                <SelectItem value="DONE">已完成</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 任务列表 */}
      <Card>
        <CardHeader>
          <CardTitle>任务列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // 加载骨架屏占位
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : filteredTodos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {searchTerm || statusFilter !== 'all' ? '暂无符合条件的任务' : '暂无任务数据'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTodos.map((todo) => {
                  const StatusIcon = STATUS_CONFIG[todo.status].icon;
                  return (
                    <TableRow key={todo.id}>
                      <TableCell>
                        <div className="font-medium">{todo.title}</div>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="text-sm text-gray-500 truncate">
                          {todo.description || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_CONFIG[todo.status].variant}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {STATUS_CONFIG[todo.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(todo.createdAt).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(todo.updatedAt).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(todo)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(todo.id)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                            {/* 状态快速切换子菜单 */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                  <Clock className="w-4 h-4 mr-2" />
                                  更新状态
                                </DropdownMenuItem>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleStatusChange(todo.id, 'TODO')}>
                                  <Circle className="w-3 h-3 mr-2" />
                                  待办
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(todo.id, 'IN_PROGRESS')}>
                                  <Clock className="w-3 h-3 mr-2" />
                                  进行中
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(todo.id, 'DONE')}>
                                  <CheckCircle2 className="w-3 h-3 mr-2" />
                                  已完成
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

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

      {/* 新增/编辑对话框 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTodo ? '编辑任务' : '新增任务'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">任务名称</Label>
              <Input
                id="title"
                placeholder="请输入任务名称"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">任务描述</Label>
              <Input
                id="description"
                placeholder="请输入任务描述（可选）"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
