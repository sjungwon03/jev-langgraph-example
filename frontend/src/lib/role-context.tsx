'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserProfile,
  AuthUserRole,
  loginUser,
  registerUser,
  logoutUser,
  fetchCurrentUser,
} from './api';

export type UserRole = AuthUserRole;

interface RoleContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  role: UserRole;
  requesterName: string;
  department: string;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    department: string;
    role: UserRole;
  }) => Promise<UserProfile>;
  logout: () => void;
  setRole: (role: UserRole) => void;
  setRequesterName: (name: string) => void;
  setDepartment: (dept: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const DEFAULT_DEV_USER: UserProfile = {
  id: 'usr_dev_001',
  email: 'dev@company.com',
  name: '김개발',
  department: '서비스개발1팀',
  role: 'DEV_TEAM',
};

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(DEFAULT_DEV_USER);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Fallback defaults
  const [role, setRoleState] = useState<UserRole>('DEV_TEAM');
  const [requesterName, setRequesterNameState] = useState<string>('김개발');
  const [department, setDepartmentState] = useState<string>('서비스개발1팀');

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('pve_auth_token');
      const savedUserStr = localStorage.getItem('pve_auth_user');

      if (savedToken && savedUserStr) {
        const savedUser: UserProfile = JSON.parse(savedUserStr);
        setUser(savedUser);
        setToken(savedToken);
        setIsAuthenticated(true);
        setRoleState(savedUser.role);
        setRequesterNameState(savedUser.name);
        setDepartmentState(savedUser.department);

        // Background session verification
        fetchCurrentUser(savedToken)
          .then((verifiedUser) => {
            setUser(verifiedUser);
            setRoleState(verifiedUser.role);
            setRequesterNameState(verifiedUser.name);
            setDepartmentState(verifiedUser.department);
            localStorage.setItem('pve_auth_user', JSON.stringify(verifiedUser));
          })
          .catch(() => {
            // Keep local state or clear if expired
          });
      } else {
        // Initialize default dev account if empty
        setUser(DEFAULT_DEV_USER);
        setToken('dev_initial_session');
        setIsAuthenticated(true);
        setRoleState(DEFAULT_DEV_USER.role);
        setRequesterNameState(DEFAULT_DEV_USER.name);
        setDepartmentState(DEFAULT_DEV_USER.department);
      }
    } catch {}
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const res = await loginUser({ email, password });
    setUser(res.user);
    setToken(res.token);
    setIsAuthenticated(true);
    setRoleState(res.user.role);
    setRequesterNameState(res.user.name);
    setDepartmentState(res.user.department);

    try {
      localStorage.setItem('pve_auth_token', res.token);
      localStorage.setItem('pve_auth_user', JSON.stringify(res.user));
      localStorage.setItem('pve_user_role', res.user.role);
    } catch {}

    return res.user;
  };

  const register = async (data: {
    email: string;
    password: string;
    name: string;
    department: string;
    role: UserRole;
  }): Promise<UserProfile> => {
    const res = await registerUser(data);
    setUser(res.user);
    setToken(res.token);
    setIsAuthenticated(true);
    setRoleState(res.user.role);
    setRequesterNameState(res.user.name);
    setDepartmentState(res.user.department);

    try {
      localStorage.setItem('pve_auth_token', res.token);
      localStorage.setItem('pve_auth_user', JSON.stringify(res.user));
      localStorage.setItem('pve_user_role', res.user.role);
    } catch {}

    return res.user;
  };

  const logout = () => {
    if (token) {
      logoutUser(token).catch(() => {});
    }
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('pve_auth_token');
      localStorage.removeItem('pve_auth_user');
      localStorage.removeItem('pve_user_role');
    } catch {}
  };

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    if (user) {
      const updated = { ...user, role: newRole };
      setUser(updated);
      try {
        localStorage.setItem('pve_auth_user', JSON.stringify(updated));
        localStorage.setItem('pve_user_role', newRole);
      } catch {}
    }
  };

  const setRequesterName = (name: string) => {
    setRequesterNameState(name);
    if (user) {
      const updated = { ...user, name };
      setUser(updated);
      try {
        localStorage.setItem('pve_auth_user', JSON.stringify(updated));
      } catch {}
    }
  };

  const setDepartment = (dept: string) => {
    setDepartmentState(dept);
    if (user) {
      const updated = { ...user, department: dept };
      setUser(updated);
      try {
        localStorage.setItem('pve_auth_user', JSON.stringify(updated));
      } catch {}
    }
  };

  return (
    <RoleContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        role,
        requesterName,
        department,
        login,
        register,
        logout,
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
