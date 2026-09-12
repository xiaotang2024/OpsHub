import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Shell } from './components/layout/Shell';
import { ServiceFleet } from './pages/Services/ServiceFleet';
import { ServiceDetail } from './pages/Services/ServiceDetail';
import { TemplateList } from './pages/Templates/TemplateList';
import { JDKList } from './pages/JDKs/JDKList';
import { AuditList } from './pages/Audit/AuditList';

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
        <Route path="/audit" element={<AuditList />} />
        <Route path="*" element={<Navigate to="/services" replace />} />
      </Routes>
    </Shell>
    </>
  );
};

export default App;
