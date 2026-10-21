import { Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { HeaderComponent } from '../components/shared/HeaderComponent';
import { FooterComponent } from '../components/shared/FooterComponent';
import { HomeView } from '../views/HomeView';
import { AddTaskView } from '../views/AddTaskView';
import { AboutView } from '../views/AboutView';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { useTheme } from '../hooks/useTheme';

export function App() {
  const { initTheme } = useTheme();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950">
      <ConfirmDialog />
      <HeaderComponent />
      <main className="flex-1 max-w-5xl w-full mx-auto py-6">
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/add-task" element={<AddTaskView />} />
          <Route path="/about" element={<AboutView />} />
        </Routes>
      </main>
      <FooterComponent />
    </div>
  );
}

export default App;
