import './styles/globals.css';
import { Crimson_Text } from 'next/font/google';

// Initialize fonts
const crimson = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-crimson',
});

export const metadata = {
  title: 'RankBoxd',
  description: 'Rank movies through pairwise comparisons, inspired by Letterboxd',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="night">
      <body className={`min-h-screen bg-base-100 text-base-content font-sans ${crimson.variable}`}>
        {children}
      </body>
    </html>
  );
}