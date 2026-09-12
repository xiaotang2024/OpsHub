import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Shell } from './components/layout/Shell';
import { ServiceFleet } from './pages/Services/ServiceFleet';
import { ServiceDetail } from './pages/Services/ServiceDetail';
import { TemplateList } from './pages/Templates/TemplateList';
import { JDKList } from './pages/JDKs/JDKList';

export const App: React.FC = () => {
  return (
    <>
      <Toaster richColors position="top-right" theme="dark" closeButton />
      <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/services" replace />} />
        <Route path="/services" element={<ServiceFleet />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/templates" element={<TemplateList />} />
        <Route path="/jdks" element={<JDKList />} />
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
    </>
  );
};

export default App;
