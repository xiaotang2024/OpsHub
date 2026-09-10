import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';

export const App: React.FC = () => {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/services" replace />} />
        <Route
          path="/services"
          element={
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white">服务列表 / Services</h1>
                  <p className="text-xs text-[#94A3B8] font-mono mt-1">集群纳管的 JVM 生产服务实例列表与运行状态</p>
                </div>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#131B2A] p-8 text-center text-sm text-[#94A3B8]">
                服务列表准备就绪 (Task 13 接入)
              </div>
            </div>
          }
        />
        <Route
          path="/templates"
          element={
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">部署模板 / Templates</h1>
                <p className="text-xs text-[#94A3B8] font-mono mt-1">JVM 参数策略、健康检查与部署流程预定义模板</p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#131B2A] p-8 text-center text-sm text-[#94A3B8]">
                模板工作台准备就绪 (Task 13 接入)
              </div>
            </div>
          }
        />
        <Route
          path="/jdks"
          element={
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">JDK 资产 / JDKs</h1>
                <p className="text-xs text-[#94A3B8] font-mono mt-1">本地及纳管 JDK 版本运行时与环境变量管理</p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#131B2A] p-8 text-center text-sm text-[#94A3B8]">
                JDK 资产管理准备就绪
              </div>
            </div>
          }
        />
        <Route
          path="/audit"
          element={
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">审计日志 / Audit</h1>
                <p className="text-xs text-[#94A3B8] font-mono mt-1">关键运维操作、部署与回滚不可篡改审计追踪</p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#131B2A] p-8 text-center text-sm text-[#94A3B8]">
                审计跟踪就绪
              </div>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/services" replace />} />
      </Routes>
    </Shell>
  );
};

export default App;
