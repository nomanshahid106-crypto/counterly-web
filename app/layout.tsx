import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
export const metadata={title:'Counterly — Web Portal', description:'Counterly POS web portal — same store, same data as the mobile app.'};
export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="en"><body><StoreProvider>{children}</StoreProvider></body></html>; }
