import '../src/base.css';
import '../src/clay.css';
import '../src/arcade.css';

export const metadata = {
  title: 'DOGFOOD 2026 — Build what matters',
  description: 'The live DOGFOOD hackathon workspace for teams, judges, organizers and helpers.',
};

export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
