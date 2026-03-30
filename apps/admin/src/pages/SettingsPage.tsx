/**
 * 设置页面（占位）
 *
 * 用于系统配置管理
 * 后续可根据需求添加：
 * - 系统设置（站点名称、Logo、公告）
 * - 邮件配置（SMTP 设置、模板管理）
 * - 安全设置（密码策略、登录限制）
 * - 操作日志（系统日志、审计日志）
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings as SettingsIcon, Bell, Shield, Database, Palette } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground mt-1">
          管理系统配置和个性化选项
        </p>
      </div>

      {/* 设置分类 */}
      <div className="grid gap-6">
        {/* 通用设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle>通用设置</CardTitle>
            </div>
            <CardDescription>
              系统基础配置，包括站点信息、时区、语言等
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          </CardContent>
        </Card>

        {/* 通知设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle>通知设置</CardTitle>
            </div>
            <CardDescription>
              配置邮件、短信等通知渠道
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>安全设置</CardTitle>
            </div>
            <CardDescription>
              密码策略、登录限制、双因素认证等
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          </CardContent>
        </Card>

        {/* 数据管理 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle>数据管理</CardTitle>
            </div>
            <CardDescription>
              数据备份、恢复、导入导出
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          </CardContent>
        </Card>

        {/* 外观设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <CardTitle>外观设置</CardTitle>
            </div>
            <CardDescription>
              主题颜色、深色模式、界面布局
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 保存按钮（占位） */}
      <div className="flex justify-end gap-2">
        <Button variant="outline">重置</Button>
        <Button disabled>保存设置</Button>
      </div>
    </div>
  );
}
