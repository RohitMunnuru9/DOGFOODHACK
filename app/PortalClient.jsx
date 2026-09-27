'use client';

import dynamic from 'next/dynamic';

const Portal = dynamic(() => import('../src/PortalApp.jsx'), {
  ssr: false,
  loading: () => <main className="portal-boot" role="status"><span>D/F</span><p>Preparing your workspace</p></main>,
});

export default function PortalClient() {
  return <Portal />;
}
