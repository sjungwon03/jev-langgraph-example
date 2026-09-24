'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'DEV_TEAM' | 'INFRA_TEAM';

interface RoleContextType {
  role: UserRole;
  requesterName: string;
  department: string;
  setRole: (role: UserRole) => void;
  setRequesterName: (name: string) => void;
  setDepartment: (dept: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('DEV_TEAM');
  const [requesterName, setRequesterNameState] = useState<string>('김개발');
  const [department, setDepartmentState] = useState<string>('서비스개발1팀');

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem('pve_user_role') as UserRole;
      if (savedRole === 'DEV_TEAM' || savedRole === 'INFRA_TEAM') {
        setRoleState(savedRole);
        if (savedRole === 'INFRA_TEAM') {
          setRequesterNameState('인프라 관리자');
          setDepartmentState('클라우드인프라팀');
        } else {
          setRequesterNameState('김개발');
          setDepartmentState('서비스개발1팀');
        }
      }
    } catch {}
  }, []);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    try {
      localStorage.setItem('pve_user_role', newRole);
    } catch {}
    if (newRole === 'INFRA_TEAM') {
      setRequesterNameState('인프라 관리자');
      setDepartmentState('클라우드인프라팀');
    } else {
      setRequesterNameState('김개발');
      setDepartmentState('서비스개발1팀');
    }
  };

  const setRequesterName = (name: string) => {
    setRequesterNameState(name);
  };

  const setDepartment = (dept: string) => {
    setDepartmentState(dept);
  };

  return (
    <RoleContext.Provider
      value={{
        role,
        requesterName,
        department,
        setRole,
        setRequesterName,
        setDepartment,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useUserRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useUserRole must be used within a RoleProvider');
  }
  return context;
}
