'use client';

import dynamic from 'next/dynamic';
import {ClaySkeleton} from '../src/ClayUI';

const Portal = dynamic(() => import('../src/PortalApp.jsx'), {
  ssr: false,
  loading: () => <main className="clay-boot"><ClaySkeleton label="Preparing your workspace"/></main>,
});

export default function PortalClient() {
  return <Portal />;
}
