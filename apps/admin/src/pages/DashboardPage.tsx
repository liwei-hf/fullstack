/**
 * 仪表盘页面（占位）
 *
 * 用于展示系统概览、数据统计、快捷操作等
 * 后续可根据需求添加：
 * - 用户统计数据（总数、活跃用户、新增趋势）
 * - 系统状态监控
 * - 快捷入口
 * - 最近活动日志
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Activity, TrendingUp, Clock } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">仪表盘</h2>
        <p className="text-muted-foreground mt-1">
          系统概览和数据分析
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="总用户数"
          value="0"
          description="较上月 +0%"
          icon={Users}
        />
        <StatCard
          title="活跃用户"
          value="0"
          description="较上月 +0%"
          icon={Activity}
        />
        <StatCard
          title="新增用户"
          value="0"
          description="本月新增"
          icon={TrendingUp}
        />
        <StatCard
          title="系统运行时间"
          value="0 天"
          description="无故障运行"
          icon={Clock}
        />
      </div>

      {/* 占位提示 */}
      <Card>
        <CardHeader>
          <CardTitle>功能开发中</CardTitle>
          <CardDescription>
            仪表盘功能正在规划中，敬请期待
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>此页面为占位页面，后续将添加数据统计和系统监控功能</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
