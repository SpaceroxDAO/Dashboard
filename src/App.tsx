import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAtom } from 'jotai';
import { Sidebar, Header, PageTransition } from '@/components/layout';
import { ToastContainer, KeyboardShortcutsModal, KeyboardHint, ScrollToTop, CommandPalette } from '@/components/ui';
import { useKeyboardShortcuts, useDataLoader } from '@/hooks';
import {
  DashboardPage,
  MemoryPage,
  CronsPage,
  SchedulePage,
  SkillsPage,
  SettingsPage,
  MorePage,
  GoalsPage,
  TodosPage,
  MissionsPage,
  DNAPage,
  ProjectsPage,
  ReportsPage,
  PersonalPage,
} from '@/pages';
import {
  connectionStatusAtom,
  activeAgentIdAtom,
} from '@/store/atoms';
import './index.css';

function AppContent() {
  const [, setConnectionStatus] = useAtom(connectionStatusAtom);
  const [activeAgentId] = useAtom(activeAgentIdAtom);
  const { loadLiveData } = useDataLoader();

  // Keyboard shortcuts for navigation
  const { shortcuts, showShortcuts, setShowShortcuts } = useKeyboardShortcuts();
  const location = useLocation();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Sync active agent to data-agent attribute on <html> for CSS variable cascading
  useEffect(() => {
    document.documentElement.dataset.agent = activeAgentId;
  }, [activeAgentId]);

  // Cmd+K or / to open command palette
  const handleCmdK = useCallback((e: KeyboardEvent) => {
    // Don't trigger if typing in an input
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setShowCommandPalette((prev) => !prev);
    } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setShowCommandPalette(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, [handleCmdK]);

  // Initialize: fetch live data from API
  useEffect(() => {
    setConnectionStatus('connecting');
    loadLiveData();

    // Poll for connection status and refresh data
    const interval = setInterval(() => {
      loadLiveData();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [setConnectionStatus, loadLiveData]);

  return (
    <div className="flex min-h-screen w-full bg-surface-base">
      {/* Desktop Sidebar */}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 cmd-grid-overlay">
        {/* Mobile Header */}
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* Routes with page transitions */}
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/dna" element={<DNAPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/crons" element={<CronsPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/todos" element={<TodosPage />} />
              <Route path="/missions" element={<MissionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/personal" element={<PersonalPage />} />
            </Routes>
          </PageTransition>
        </AnimatePresence>
      </main>


      {/* Toast Notifications */}
      <ToastContainer />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
      />

      {/* Floating keyboard hint (desktop only, dismissible) */}
      <KeyboardHint onClick={() => setShowShortcuts(true)} />

      {/* Scroll to top button */}
      <ScrollToTop />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
