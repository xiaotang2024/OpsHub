import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { Shell } from './components/layout/Shell';
import { ServiceFleet } from './pages/Services/ServiceFleet';
import { ServiceDetail } from './pages/Services/ServiceDetail';
import { TemplateList } from './pages/Templates/TemplateList';
import { JDKList } from './pages/JDKs/JDKList';
import { AuditList } from './pages/Audit/AuditList';
import { usePermission } from './hooks/usePermission';

// Protected Route for Admin only
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = usePermission();

  useEffect(() => {
    if (!isAdmin) {
      toast.warning('需要管理员权限才能访问该页面');
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/services" replace />;
  }

  return <>{children}</>;
};

// Placeholder for UserManagement (implemented in Task 6)
export const UserManagementPlaceholder: React.FC = () => (
  <div data-testid="user-management-page" className="p-6 text-white font-mono">
    用户管理 (User Management)
  </div>
);

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
          <Route
            path="/users"
            element={
              <AdminRoute>
                <UserManagementPlaceholder />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/services" replace />} />
        </Routes>
      </Shell>
    </>
  );
};

export default App;

