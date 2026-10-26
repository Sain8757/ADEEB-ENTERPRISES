'use client';
// ADEEB ENTERPRISES — Party redirect to Unified Party Hub
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

export default function PartyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = params?.id as string;

  useEffect(() => {
    if (partyId) {
      router.replace(`/ledger/${partyId}`);
    }
  }, [partyId, router]);

  return (
    <AppShell currentPage='Redirecting to Party Workspace...'>
      <div style={{ padding: 20, color: '#808080' }}>
        Opening Party Workspace...
      </div>
    </AppShell>
  );
}
