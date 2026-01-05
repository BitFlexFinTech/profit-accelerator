import { useState, useEffect } from 'react';
import { MasterPasswordGate } from '@/components/MasterPasswordGate';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

export default function Index() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    const unlocked = sessionStorage.getItem('hft-unlocked') === 'true';
    setIsUnlocked(unlocked);
  }, []);

  if (!isUnlocked) {
    return <MasterPasswordGate onUnlock={() => setIsUnlocked(true)} />;
  }

  return <DashboardLayout />;
}
