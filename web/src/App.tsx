import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { ServiceFleet } from './pages/Services/ServiceFleet';
import { ServiceDetail } from './pages/Services/ServiceDetail';
import { TemplateList } from './pages/Templates/TemplateList';

export const App: React.FC = () => {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/services" replace />} />
        <Route path="/services" element={<ServiceFleet />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/templates" element={<TemplateList />} />
        <Route
          path="/jdks"
          element={
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">JDK 资产 / JDKs</h1>
                <p className="text-xs text-ops-text-muted font-mono mt-1">本地及纳管 JDK 版本运行时与环境变量管理</p>
              </div>
              <div className="rounded-xl border border-ops-border bg-ops-card p-8 text-center text-sm text-ops-text-muted">
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
                <p className="text-xs text-ops-text-muted font-mono mt-1">关键运维操作、部署与回滚不可篡改审计追踪</p>
              </div>
              <div className="rounded-xl border border-ops-border bg-ops-card p-8 text-center text-sm text-ops-text-muted">
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
