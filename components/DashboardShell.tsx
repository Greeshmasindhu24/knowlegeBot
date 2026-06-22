'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/actions/auth';
import { fetchUserProfile, type UserProfile } from '@/lib/userProfile';
import {
  LayoutDashboard,
  UploadCloud,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Menu,
  X,
  Sun,
  Moon,
  Bot
} from 'lucide-react';

interface DashboardShellProps {
  children: React.ReactNode;
  userProfile?: UserProfile | null;
}

export default function DashboardShell({ children, userProfile: userProfileProp }: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(userProfileProp ?? null);

  useEffect(() => {
    if (userProfileProp) {
      setUserProfile(userProfileProp);
      return;
    }

    let cancelled = false;
    fetchUserProfile().then((result) => {
      if (!cancelled && result.profile) {
        setUserProfile(result.profile);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userProfileProp]);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Document Hub', href: '/upload', icon: UploadCloud },
    { name: 'AI Chat', href: '/chat', icon: MessageSquare },
    { name: 'Admin Center', href: '/admin', icon: ShieldCheck, adminOnly: true },
    { name: 'Review Queue', href: '/admin/review', icon: ShieldAlert, adminOnly: true },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const filteredNav = navigation.filter((item) => {
    if (item.adminOnly && userProfile?.role !== 'admin') {
      return false;
    }
    return true;
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  };

  const getDeptColor = (dept: string | null) => {
    if (!dept) return 'bg-slate-800 text-slate-400';
    switch (dept.toLowerCase()) {
      case 'engineering':
        return 'bg-violet-950/60 border border-violet-850 text-violet-400';
      case 'hr':
      case 'human resources':
        return 'bg-emerald-950/60 border border-emerald-850 text-emerald-400';
      case 'finance':
        return 'bg-amber-950/60 border border-amber-850 text-amber-400';
      case 'legal':
        return 'bg-rose-950/60 border border-rose-850 text-rose-400';
      case 'marketing':
        return 'bg-cyan-950/60 border border-cyan-850 text-cyan-400';
      default:
        return 'bg-slate-800 border border-slate-700 text-slate-400';
    }
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Mobile Top Bar */}
      <header className={`md:hidden flex items-center justify-between px-4 py-3 border-b ${
        theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
      } backdrop-blur-md sticky top-0 z-30`}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold tracking-tight text-sm bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            KNOWLEDGE BOT
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg border transition ${
              theme === 'dark' ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-250 text-slate-650 hover:text-slate-900'
            }`}
          >
            {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`p-1.5 rounded-lg border transition ${
              theme === 'dark' ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-250 text-slate-650 hover:text-slate-900'
            }`}
          >
            {mobileOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </div>
      </header>

      {/* Sidebar - Desktop and Mobile overlay */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 md:sticky md:block md:h-screen transition-transform duration-300 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${
        collapsed ? 'md:w-20' : 'md:w-64'
      } ${
        theme === 'dark'
          ? 'bg-slate-900/90 border-r border-slate-800/80'
          : 'bg-white border-r border-slate-200'
      } backdrop-blur-md flex flex-col justify-between shadow-xl`}>
        {/* Sidebar Header */}
        <div>
          <div className="hidden md:flex items-center justify-between px-6 py-5 border-b border-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/10 shrink-0">
                <Bot className="h-5 w-5 text-white" />
              </div>
              {!collapsed && (
                <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-violet-400 via-indigo-200 to-white bg-clip-text text-transparent">
                  KnowledgeBot
                </span>
              )}
            </div>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded bg-slate-800/30 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            {filteredNav.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/10'
                      : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`} />
                  {(!collapsed || mobileOpen) && (
                    <span className="text-sm tracking-wide">{item.name}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer (User Info & Sign Out) */}
        <div className={`p-4 border-t ${
          theme === 'dark' ? 'border-slate-800/50' : 'border-slate-200/80'
        } space-y-3`}>
          {userProfile && (!collapsed || mobileOpen) && (
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-slate-350" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {userProfile.full_name || 'User'}
                </p>
                <p className="text-[10px] text-slate-400 truncate mb-1">
                  {userProfile.email}
                </p>
                {userProfile.department && (
                  <span className={`inline-block px-1.5 py-0.25 text-[9px] rounded font-medium capitalize ${getDeptColor(userProfile.department)}`}>
                    {userProfile.department}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Desktop Theme toggle inside footer */}
            <button
              onClick={toggleTheme}
              className={`hidden md:flex flex-1 items-center justify-center p-2.5 rounded-xl border transition ${
                theme === 'dark'
                  ? 'border-slate-850 hover:bg-slate-800/40 text-slate-450 hover:text-white'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4.5 w-4.5 shrink-0" />
                  {!collapsed && <span className="text-xs ml-2 font-medium">Light Mode</span>}
                </>
              ) : (
                <>
                  <Moon className="h-4.5 w-4.5 shrink-0" />
                  {!collapsed && <span className="text-xs ml-2 font-medium">Dark Mode</span>}
                </>
              )}
            </button>

            <button
              onClick={async () => {
                await logout();
              }}
              className={`flex-1 flex items-center justify-center p-2.5 rounded-xl border border-red-950/20 hover:bg-red-950/15 text-red-400 transition`}
              title="Sign Out"
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" />
              {(!collapsed || mobileOpen) && <span className="text-xs ml-2 font-semibold">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Page Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative h-[calc(100vh-62px)] md:h-screen">
        {/* Background grids */}
        <div className="absolute top-0 right-0 w-[50%] h-[30%] bg-gradient-to-b from-indigo-500/5 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[50%] h-[30%] bg-gradient-to-t from-violet-500/5 to-transparent blur-3xl pointer-events-none" />
        
        <div className="p-6 md:p-8 flex-1 relative z-10">
          {children}
        </div>
      </main>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-950/60 z-35 md:hidden backdrop-blur-sm"
        />
      )}
    </div>
  );
}
