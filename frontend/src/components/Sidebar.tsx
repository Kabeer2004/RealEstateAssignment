'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/compare', label: 'Compare', icon: GitCompare },
  ];

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-sidebar-primary">CapMatch</h2>
      </div>
      <nav className="mt-4 px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center p-3 text-base font-medium rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors',
              pathname.startsWith(item.href) && 'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
          >
            <item.icon className="mr-3 h-6 w-6" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}